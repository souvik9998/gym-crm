/**
 * Protected Data Edge Function
 * 
 * Serves operational data for authenticated admin/staff users only.
 * Uses native Supabase Auth as the single source of truth.
 * Validates authorization and branch access before returning data.
 * 
 * Security:
 * - JWT validation via Supabase Auth
 * - Role-based access (admin vs staff)
 * - Permission-based feature access
 * - Branch-level data isolation for staff
 * 
 * Performance optimizations:
 * - Batch queries instead of N+1
 * - Cache-Control headers for read-heavy endpoints
 * - Column pruning (select only needed fields)
 * - SQL-level aggregations where possible
 * 
 * Version: 3.0
 */

import { createClient } from "npm:@supabase/supabase-js@2";
import { enforceRateLimit } from "../_shared/rate-limit.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface AuthResult {
  valid: boolean;
  isAdmin: boolean;
  isSuperAdmin?: boolean;
  isStaff: boolean;
  userId?: string;
  staffId?: string;
  permissions?: Record<string, unknown>;
  branchIds?: string[];
}

function normalizeMemberAccessType(value: unknown): "all" | "assigned" {
  return typeof value === "string" && value.trim().toLowerCase() === "assigned"
    ? "assigned"
    : "all";
}

function isAssignedOnlyAccess(auth: AuthResult): boolean {
  return auth.isStaff && normalizeMemberAccessType(auth.permissions?.member_access_type) === "assigned";
}

// Verify session via Supabase Auth and determine role
async function authenticateRequest(
  // deno-lint-ignore no-explicit-any
  anonClient: any,
  serviceClient: any,
  authHeader: string
): Promise<AuthResult> {
  if (!authHeader?.startsWith("Bearer ")) {
    return { valid: false, isAdmin: false, isStaff: false };
  }

  const token = authHeader.replace("Bearer ", "").trim();
  if (!token) {
    return { valid: false, isAdmin: false, isStaff: false };
  }

  let userId: string | null = null;
  let jwtStaffId: string | null = null;

  const { data: claimsData, error: claimsError } = await anonClient.auth.getClaims(token);
  if (!claimsError && claimsData?.claims?.sub) {
    userId = String(claimsData.claims.sub);
    const claimMetadata = (claimsData.claims.user_metadata || claimsData.claims.app_metadata) as Record<string, unknown> | undefined;
    jwtStaffId = typeof claimMetadata?.staff_id === "string" ? claimMetadata.staff_id : null;
  } else {
    console.warn("getClaims failed, trying getUser:", claimsError?.message);
    const { data: userData, error: userError } = await anonClient.auth.getUser(token);
    if (!userError && userData?.user?.id) {
      userId = userData.user.id;
      jwtStaffId = typeof userData.user.user_metadata?.staff_id === "string"
        ? userData.user.user_metadata.staff_id
        : typeof userData.user.app_metadata?.staff_id === "string"
          ? userData.user.app_metadata.staff_id
          : null;
    } else {
      console.error("Both getClaims and getUser failed:", userError?.message);
      return { valid: false, isAdmin: false, isStaff: false };
    }
  }

  const { data: adminRoles, error: adminRolesError } = await serviceClient
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .in("role", ["admin", "tenant_admin", "super_admin"]);

  if (adminRolesError) {
    console.error("Error checking admin roles:", adminRolesError);
  }

  const roles = (adminRoles || []).map((r: { role: string }) => r.role);
  const isSuperAdmin = roles.includes("super_admin");

  if (roles.length > 0) {
    return { valid: true, isAdmin: true, isSuperAdmin, isStaff: false, userId };
  }

  const { data: staffList } = await serviceClient
    .from("staff")
    .select("id")
    .eq("auth_user_id", userId)
    .eq("is_active", true);

  const allStaffIds = (staffList || []).map((s: { id: string }) => s.id);
  const staff = ((staffList as { id: string }[] | null)?.find((s) => s.id === jwtStaffId))
    || (staffList as { id: string }[] | null)?.[0];
  if (!staff) {
    return { valid: false, isAdmin: false, isStaff: false };
  }

  // Fetch permissions and assignments in parallel
  const [permResult, assignResult] = await Promise.all([
    serviceClient.from("staff_permissions").select("*").eq("staff_id", staff.id).maybeSingle(),
    serviceClient.from("staff_branch_assignments").select("branch_id").in("staff_id", allStaffIds),
  ]);

  const branchIds = (assignResult.data || []).map((a: { branch_id: string }) => a.branch_id);
  const permissions = {
    ...(permResult.data || {}),
    member_access_type: normalizeMemberAccessType((permResult.data as Record<string, unknown> | null | undefined)?.member_access_type),
  };

  return {
    valid: true,
    isAdmin: false,
    isStaff: true,
    userId,
    staffId: staff.id,
    permissions,
    branchIds,
  };
}

function hasBranchAccess(auth: AuthResult, branchId: string | null): boolean {
  if (auth.isAdmin) return true;
  if (!branchId) return true;
  return auth.branchIds?.includes(branchId) || false;
}

async function resolveAssignedMemberIds(
  // deno-lint-ignore no-explicit-any
  serviceClient: any,
  auth: AuthResult,
  allowedBranchIds: string[] | null,
): Promise<string[] | null> {
  if (!isAssignedOnlyAccess(auth)) {
    return null;
  }

  if (!auth.staffId) {
    return [];
  }

  const today = new Date().toISOString().split("T")[0];

  let slotQuery = serviceClient
    .from("trainer_time_slots")
    .select("id")
    .eq("trainer_id", auth.staffId);

  if (Array.isArray(allowedBranchIds)) {
    if (allowedBranchIds.length === 0) return [];
    slotQuery = slotQuery.in("branch_id", allowedBranchIds);
  }

  const [{ data: staffRecord }, { data: staffSlots }] = await Promise.all([
    serviceClient
      .from("staff")
      .select("phone")
      .eq("id", auth.staffId)
      .maybeSingle(),
    slotQuery,
  ]);

  const slotIds = (staffSlots || []).map((slot: { id: string }) => slot.id);

  let trainerProfileIds: string[] = [];
  if (staffRecord?.phone) {
    let trainerProfileQuery = serviceClient
      .from("personal_trainers")
      .select("id")
      .eq("phone", staffRecord.phone);

    if (Array.isArray(allowedBranchIds)) {
      trainerProfileQuery = trainerProfileQuery.in("branch_id", allowedBranchIds);
    }

    const { data: trainerProfiles } = await trainerProfileQuery;
    trainerProfileIds = (trainerProfiles || []).map((trainer: { id: string }) => trainer.id);
  }

  if (slotIds.length === 0 && trainerProfileIds.length === 0) return [];

  const assignmentQueries: Promise<{ data: { member_id: string }[] | null; error: unknown }>[] = [];

  if (slotIds.length > 0) {
    let slotAssignmentQuery = serviceClient
      .from("pt_subscriptions")
      .select("member_id")
      .eq("status", "active")
      .gte("end_date", today)
      .in("time_slot_id", slotIds);

    if (Array.isArray(allowedBranchIds)) {
      slotAssignmentQuery = slotAssignmentQuery.in("branch_id", allowedBranchIds);
    }

    assignmentQueries.push(slotAssignmentQuery);
  }

  if (trainerProfileIds.length > 0) {
    let trainerAssignmentQuery = serviceClient
      .from("pt_subscriptions")
      .select("member_id")
      .eq("status", "active")
      .gte("end_date", today)
      .in("personal_trainer_id", trainerProfileIds);

    if (Array.isArray(allowedBranchIds)) {
      trainerAssignmentQuery = trainerAssignmentQuery.in("branch_id", allowedBranchIds);
    }

    assignmentQueries.push(trainerAssignmentQuery);
  }

  const assignmentResults = await Promise.all(assignmentQueries);

  return [
    ...new Set(
      assignmentResults.flatMap((result) =>
        (result.data || []).map((assignment: { member_id: string }) => assignment.member_id).filter(Boolean)
      )
    ),
  ];
}

async function resolveAllowedBranchIds(
  // deno-lint-ignore no-explicit-any
  serviceClient: any,
  auth: AuthResult,
  requestedBranchId: string | null
): Promise<string[] | null> {
  if (requestedBranchId) return [requestedBranchId];
  if (auth.isStaff) return auth.branchIds || [];
  if (auth.isAdmin && auth.isSuperAdmin) return null;

  if (auth.isAdmin && auth.userId) {
    const { data: membership } = await serviceClient
      .from("tenant_members")
      .select("tenant_id")
      .eq("user_id", auth.userId)
      .limit(1)
      .maybeSingle();

    const tenantId = membership?.tenant_id as string | undefined;
    if (!tenantId) return [];

    const { data: branches } = await serviceClient
      .from("branches")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("is_active", true);

    return (branches || []).map((b: { id: string }) => b.id);
  }

  return [];
}

function hasPermission(auth: AuthResult, permission: string): boolean {
  if (auth.isAdmin) return true;
  if (!auth.permissions) return false;
  return auth.permissions[permission] === true;
}

function errorResponse(message: string, status: number) {
  return new Response(
    JSON.stringify({ error: message }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" }, status }
  );
}

function jsonResponse(data: unknown, cacheMaxAge: number = 0) {
  const headers: Record<string, string> = { ...corsHeaders, "Content-Type": "application/json" };
  if (cacheMaxAge > 0) {
    headers["Cache-Control"] = `public, max-age=${cacheMaxAge}`;
  }
  return new Response(JSON.stringify(data), { headers });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Rate limit: 60 requests per minute per IP
  const rateLimited = enforceRateLimit(req, "protected-data", 60, 60, corsHeaders);
  if (rateLimited) return rateLimited;

  if (req.method !== "GET") {
    return errorResponse("Method not allowed", 405);
  }

  try {
    const url = new URL(req.url);
    const action = url.searchParams.get("action");
    const branchId = url.searchParams.get("branchId");
    const memberId = url.searchParams.get("memberId");
    const cursor = parseInt(url.searchParams.get("cursor") || "0");
    const limit = Math.min(parseInt(url.searchParams.get("limit") || "25"), 100);

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return errorResponse("Authorization required", 401);
    }

    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (branchId && !uuidRegex.test(branchId)) {
      return errorResponse("Invalid branch ID format", 400);
    }
    if (memberId && !uuidRegex.test(memberId)) {
      return errorResponse("Invalid member ID format", 400);
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error("Server configuration error");
    }

    const anonClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    const auth = await authenticateRequest(anonClient, supabase, authHeader);
    
    if (!auth.valid) {
      return errorResponse("Invalid authentication", 401);
    }

    if (!hasBranchAccess(auth, branchId)) {
      return errorResponse("Access denied to this branch", 403);
    }

    const allowedBranchIds = await resolveAllowedBranchIds(supabase, auth, branchId);

    // ── Tenant module & plan expiry enforcement (skip for super admins) ──
    let tenantFeatures: Record<string, boolean> | null = null;
    if (auth.isAdmin && !auth.isSuperAdmin && auth.userId) {
      const { data: membership } = await supabase
        .from("tenant_members")
        .select("tenant_id")
        .eq("user_id", auth.userId)
        .limit(1)
        .maybeSingle();

      if (membership?.tenant_id) {
        const { data: limits } = await supabase
          .from("tenant_limits")
          .select("features, plan_expiry_date")
          .eq("tenant_id", membership.tenant_id)
          .single();

        if (limits) {
          if (limits.plan_expiry_date) {
            const expiry = new Date(limits.plan_expiry_date as string);
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            if (expiry < today) {
              return errorResponse("Plan expired. Contact platform admin to renew.", 403);
            }
          }
          tenantFeatures = (limits.features || {}) as Record<string, boolean>;
        }
      }
    }

    const isModuleEnabled = (module: string): boolean => {
      if (auth.isSuperAdmin) return true;
      if (!tenantFeatures) return true;
      return tenantFeatures[module] !== false;
    };

    // Helper: apply branch filter to a query
    // deno-lint-ignore no-explicit-any
    const applyBranchFilter = (query: any, col = "branch_id") => {
      if (Array.isArray(allowedBranchIds)) {
        return query.in(col, allowedBranchIds);
      }
      return query;
    };

    switch (action) {
      case "health": {
        return jsonResponse({ 
          status: "ok", 
          isAdmin: auth.isAdmin, 
          isStaff: auth.isStaff,
          timestamp: new Date().toISOString(),
        });
      }

      case "dashboard-stats": {
        if (!hasPermission(auth, "can_view_members") && !auth.isAdmin) {
          return errorResponse("Permission denied: cannot view dashboard", 403);
        }

        // Refresh subscription statuses
        await supabase.rpc("refresh_subscription_statuses");
        const assignedScopeRequired = isAssignedOnlyAccess(auth);
        const assignedMemberIds = await resolveAssignedMemberIds(supabase, auth, allowedBranchIds);

        if (Array.isArray(allowedBranchIds) && allowedBranchIds.length === 0) {
          return jsonResponse({
            totalMembers: 0, activeMembers: 0, expiringSoon: 0,
            expiredMembers: 0, inactiveMembers: 0, monthlyRevenue: 0,
            withPT: 0, dailyPassUsers: 0,
          }, 30);
        }

        if (assignedScopeRequired && assignedMemberIds === null) {
          return jsonResponse({
            totalMembers: 0, activeMembers: 0, expiringSoon: 0,
            expiredMembers: 0, inactiveMembers: 0, monthlyRevenue: 0,
            withPT: 0, dailyPassUsers: 0,
          }, 30);
        }

        if (assignedMemberIds !== null && assignedMemberIds.length === 0) {
          return jsonResponse({
            totalMembers: 0, activeMembers: 0, expiringSoon: 0,
            expiredMembers: 0, inactiveMembers: 0, monthlyRevenue: 0,
            withPT: 0, dailyPassUsers: 0,
          }, 30);
        }

        // Use RPC for single-branch queries, manual for multi-branch
        if (assignedMemberIds === null && Array.isArray(allowedBranchIds) && allowedBranchIds.length === 1) {
          const { data: rpcData, error: rpcError } = await supabase.rpc("get_dashboard_stats", {
            _branch_id: allowedBranchIds[0],
          });
          if (!rpcError && rpcData && rpcData.length > 0) {
            const s = rpcData[0];
            return jsonResponse({
              totalMembers: Number(s.total_members) || 0,
              activeMembers: Number(s.active_members) || 0,
              expiringSoon: Number(s.expiring_soon) || 0,
              expiredMembers: Number(s.expired_members) || 0,
              inactiveMembers: Number(s.inactive_members) || 0,
              monthlyRevenue: Number(s.monthly_revenue) || 0,
              withPT: Number(s.with_pt) || 0,
              dailyPassUsers: Number(s.daily_pass_users) || 0,
            }, 30);
          }
        }

        const applyAssignedMembersFilter = (
          // deno-lint-ignore no-explicit-any
          query: any,
          column = "member_id",
        ) => {
          if (assignedMemberIds !== null) {
            return query.in(column, assignedMemberIds);
          }
          return query;
        };

        // Multi-branch: parallel queries with column pruning
        const [membersCountRes, memberIdsRes, subsRes, paymentsRes, ptRes, dailyPassRes] = await Promise.all([
          applyAssignedMembersFilter(applyBranchFilter(supabase.from("members").select("*", { count: "exact", head: true })), "id"),
          applyAssignedMembersFilter(applyBranchFilter(supabase.from("members").select("id")), "id"),
          applyAssignedMembersFilter(applyBranchFilter(supabase.from("subscriptions").select("member_id, status, end_date").order("end_date", { ascending: false }))),
          applyAssignedMembersFilter(
            applyBranchFilter(
              supabase.from("payments").select("amount")
                .eq("status", "success")
                .gte("created_at", new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString())
            )
          ),
          applyAssignedMembersFilter(
            applyBranchFilter(
              supabase.from("pt_subscriptions").select("member_id")
                .eq("status", "active")
                .gte("end_date", new Date().toISOString().split("T")[0])
            )
          ),
          assignedMemberIds !== null
            ? Promise.resolve({ count: 0, data: null, error: null })
            : applyBranchFilter(supabase.from("daily_pass_users").select("*", { count: "exact", head: true })),
        ]);

        // Group subscriptions by member (latest first) - already ordered
        const memberSubs = new Map<string, { status: string; end_date: string }>();
        for (const sub of subsRes.data || []) {
          if (!memberSubs.has(sub.member_id)) {
            memberSubs.set(sub.member_id, { status: sub.status || "inactive", end_date: sub.end_date });
          }
        }

        const today = new Date();
        today.setHours(0, 0, 0, 0);
        let activeCount = 0, expiringSoonCount = 0, expiredCount = 0, inactiveCount = 0;

        for (const member of memberIdsRes.data || []) {
          const sub = memberSubs.get(member.id);
          if (!sub) continue;
          if (sub.status === "inactive") { inactiveCount++; continue; }
          const endDate = new Date(sub.end_date);
          endDate.setHours(0, 0, 0, 0);
          const diffDays = Math.ceil((endDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
          if (diffDays < 0) expiredCount++;
          else if (diffDays <= 7) expiringSoonCount++;
          else activeCount++;
        }

        const monthlyRevenue = (paymentsRes.data || []).reduce((s: number, p: any) => s + Number(p.amount), 0);
        const uniquePTMembers = new Set((ptRes.data || []).map((pt: any) => pt.member_id)).size;

        return jsonResponse({
          totalMembers: membersCountRes.count || 0,
          activeMembers: activeCount,
          expiringSoon: expiringSoonCount,
          expiredMembers: expiredCount,
          inactiveMembers: inactiveCount,
          monthlyRevenue,
          withPT: uniquePTMembers,
          dailyPassUsers: dailyPassRes.count || 0,
        }, 30);
      }

      case "trainers": {
        if (!hasPermission(auth, "can_view_members") && !hasPermission(auth, "can_manage_members")) {
          return errorResponse("Permission denied: cannot view trainers", 403);
        }

        let query = supabase.from("personal_trainers").select("id, name, phone, specialization, monthly_fee, monthly_salary, session_fee, percentage_fee, payment_category, is_active, branch_id, created_at, updated_at").eq("is_active", true);
        if (Array.isArray(allowedBranchIds)) query = query.in("branch_id", allowedBranchIds);

        const { data: trainers, error } = await query;
        if (error) throw new Error("Failed to fetch trainers");
        return jsonResponse({ trainers: trainers || [] });
      }

      case "all-trainers": {
        if (!hasPermission(auth, "can_change_settings")) {
          return errorResponse("Permission denied: cannot manage trainers", 403);
        }

        let query = supabase.from("personal_trainers").select("*");
        if (Array.isArray(allowedBranchIds)) query = query.in("branch_id", allowedBranchIds);

        const { data: trainers, error } = await query;
        if (error) throw new Error("Failed to fetch trainers");
        return jsonResponse({ trainers: trainers || [] });
      }

      case "settings": {
        if (!hasPermission(auth, "can_change_settings")) {
          return errorResponse("Permission denied: cannot access settings", 403);
        }
        if (!branchId) return errorResponse("Branch ID required", 400);

        const { data: settings, error } = await supabase
          .from("gym_settings").select("*").eq("branch_id", branchId).maybeSingle();
        if (error) throw new Error("Failed to fetch settings");
        return jsonResponse({ settings: settings || null });
      }

      case "packages": {
        if (!hasPermission(auth, "can_change_settings")) {
          return errorResponse("Permission denied: cannot manage packages", 403);
        }

        let monthlyQuery = supabase.from("monthly_packages").select("*");
        let customQuery = supabase.from("custom_packages").select("*");

        if (Array.isArray(allowedBranchIds)) {
          monthlyQuery = monthlyQuery.in("branch_id", allowedBranchIds);
          customQuery = customQuery.in("branch_id", allowedBranchIds);
        }

        const [monthlyResult, customResult] = await Promise.all([
          monthlyQuery.order("months"),
          customQuery.order("duration_days"),
        ]);

        if (monthlyResult.error || customResult.error) throw new Error("Failed to fetch packages");
        return jsonResponse({ monthlyPackages: monthlyResult.data || [], customPackages: customResult.data || [] });
      }

      case "members": {
        if (!isModuleEnabled("members_management")) {
          return errorResponse("Members management is not available on your plan", 403);
        }
        if (!hasPermission(auth, "can_view_members") && !hasPermission(auth, "can_manage_members")) {
          return errorResponse("Permission denied: cannot view members", 403);
        }

        if (Array.isArray(allowedBranchIds) && allowedBranchIds.length === 0) {
          return jsonResponse({ members: [], nextCursor: null, totalCount: 0 });
        }

        const assignedScopeRequired = isAssignedOnlyAccess(auth);
        const assignedMemberIds = await resolveAssignedMemberIds(supabase, auth, allowedBranchIds);
        console.log("[members] auth:", { isStaff: auth.isStaff, staffId: auth.staffId, memberAccessType: auth.permissions?.member_access_type, assignedCount: assignedMemberIds?.length ?? "all" });
        if (assignedScopeRequired && assignedMemberIds === null) {
          return jsonResponse({ members: [], nextCursor: null, totalCount: 0 });
        }
        if (assignedMemberIds !== null && assignedMemberIds.length === 0) {
          return jsonResponse({ members: [], nextCursor: null, totalCount: 0 });
        }

        let countQuery = supabase.from("members").select("*", { count: "exact", head: true });
        let membersQuery = supabase.from("members").select("*").order("created_at", { ascending: false });

        if (Array.isArray(allowedBranchIds)) {
          countQuery = countQuery.in("branch_id", allowedBranchIds);
          membersQuery = membersQuery.in("branch_id", allowedBranchIds);
        }

        // Apply assigned-only filter
        if (assignedMemberIds !== null) {
          countQuery = countQuery.in("id", assignedMemberIds);
          membersQuery = membersQuery.in("id", assignedMemberIds);
        }

        const { count, error: countError } = await countQuery;
        if (countError) throw new Error("Failed to count members");

        membersQuery = membersQuery.range(cursor, cursor + limit - 1);
        const { data: members, error: membersError } = await membersQuery;
        if (membersError) throw new Error("Failed to fetch members");

        const today = new Date().toISOString().split("T")[0];
        const memberIds = (members || []).map((m: any) => m.id);

        // BATCH: fetch all subscriptions and PT subs for this page in 2 queries instead of N*2
        const [subsResult, ptResult] = memberIds.length > 0
          ? await Promise.all([
              supabase.from("subscriptions")
                .select("id, member_id, status, end_date, start_date")
                .in("member_id", memberIds)
                .order("end_date", { ascending: false }),
              supabase.from("pt_subscriptions")
                .select("member_id, end_date, time_slot_id, personal_trainer:personal_trainers(name)")
                .in("member_id", memberIds)
                .eq("status", "active")
                .gte("end_date", today)
                .order("end_date", { ascending: false }),
            ])
          : [{ data: [] }, { data: [] }];

        // Build lookup maps (latest sub per member)
        const subsByMember = new Map<string, any>();
        for (const sub of subsResult.data || []) {
          if (!subsByMember.has(sub.member_id)) {
            subsByMember.set(sub.member_id, sub);
          }
        }

        const ptByMember = new Map<string, any>();
        for (const pt of ptResult.data || []) {
          if (!ptByMember.has(pt.member_id)) {
            ptByMember.set(pt.member_id, pt);
          }
        }

        const membersWithData = (members || []).map((member: any) => {
          const subData = subsByMember.get(member.id);
          const ptData = ptByMember.get(member.id);
          const trainerData = ptData?.personal_trainer as any;

          return {
            ...member,
            subscription: subData || undefined,
            activePT: ptData
              ? { trainer_name: trainerData?.name || "Unknown", end_date: ptData.end_date, time_slot_id: ptData.time_slot_id || null }
              : null,
          };
        });

        const nextCursor = cursor + (members?.length || 0) < (count || 0) ? cursor + limit : null;

        return jsonResponse({ members: membersWithData, nextCursor, totalCount: count || 0 });
      }

      case "member": {
        if (!hasPermission(auth, "can_view_members") && !hasPermission(auth, "can_manage_members")) {
          return errorResponse("Permission denied: cannot view member", 403);
        }
        if (!memberId) return errorResponse("Member ID required", 400);

        const assignedScopeRequired = isAssignedOnlyAccess(auth);
        const assignedMemberIds = await resolveAssignedMemberIds(supabase, auth, allowedBranchIds);
        if (assignedScopeRequired && assignedMemberIds === null) {
          return errorResponse("Access denied to this member", 403);
        }
        if (assignedMemberIds !== null && !assignedMemberIds.includes(memberId)) {
          return errorResponse("Access denied to this member", 403);
        }

        const { data: member, error: memberError } = await supabase
          .from("members").select("*").eq("id", memberId).single();
        if (memberError || !member) return errorResponse("Member not found", 404);

        if (Array.isArray(allowedBranchIds) && !allowedBranchIds.includes(member.branch_id)) {
          return errorResponse("Access denied to this member", 403);
        }

        const { data: details } = await supabase
          .from("member_details").select("*").eq("member_id", memberId).maybeSingle();
        return jsonResponse({ member, details: details || null });
      }

      case "payments": {
        if (!hasPermission(auth, "can_access_payments")) {
          return errorResponse("Permission denied: cannot view payments", 403);
        }

        if (Array.isArray(allowedBranchIds) && allowedBranchIds.length === 0) {
          return jsonResponse({ payments: [], nextCursor: null, totalCount: 0 });
        }

        let countQuery = supabase.from("payments").select("*", { count: "exact", head: true });
        let paymentsQuery = supabase
          .from("payments")
          .select("id, amount, payment_mode, status, created_at, notes, payment_type, razorpay_payment_id, razorpay_order_id, branch_id, member_id, subscription_id, daily_pass_user_id, daily_pass_subscription_id, member:members(id, name, phone), daily_pass_user:daily_pass_users(id, name, phone)")
          .order("created_at", { ascending: false });

        if (Array.isArray(allowedBranchIds)) {
          countQuery = countQuery.in("branch_id", allowedBranchIds);
          paymentsQuery = paymentsQuery.in("branch_id", allowedBranchIds);
        }

        const { count, error: countError } = await countQuery;
        if (countError) throw new Error("Failed to count payments");

        paymentsQuery = paymentsQuery.range(cursor, cursor + limit - 1);
        const { data: payments, error: paymentsError } = await paymentsQuery;
        if (paymentsError) throw new Error("Failed to fetch payments");

        const nextCursor = cursor + (payments?.length || 0) < (count || 0) ? cursor + limit : null;
        return jsonResponse({ payments: payments || [], nextCursor, totalCount: count || 0 });
      }

      case "ledger": {
        if (!hasPermission(auth, "can_access_ledger")) {
          return errorResponse("Permission denied: cannot view ledger", 403);
        }

        if (Array.isArray(allowedBranchIds) && allowedBranchIds.length === 0) {
          return jsonResponse({ entries: [], nextCursor: null, totalCount: 0 });
        }

        let countQuery = supabase.from("ledger_entries").select("*", { count: "exact", head: true });
        let ledgerQuery = supabase
          .from("ledger_entries")
          .select("id, amount, entry_type, category, description, entry_date, notes, branch_id, member_id, daily_pass_user_id, trainer_id, is_auto_generated, created_at, member:members(id, name, phone), trainer:personal_trainers(id, name), daily_pass_user:daily_pass_users(id, name, phone)")
          .order("entry_date", { ascending: false });

        if (Array.isArray(allowedBranchIds)) {
          countQuery = countQuery.in("branch_id", allowedBranchIds);
          ledgerQuery = ledgerQuery.in("branch_id", allowedBranchIds);
        }

        const { count, error: countError } = await countQuery;
        if (countError) throw new Error("Failed to count ledger entries");

        ledgerQuery = ledgerQuery.range(cursor, cursor + limit - 1);
        const { data: entries, error: ledgerError } = await ledgerQuery;
        if (ledgerError) throw new Error("Failed to fetch ledger entries");

        const nextCursor = cursor + (entries?.length || 0) < (count || 0) ? cursor + limit : null;
        return jsonResponse({ entries: entries || [], nextCursor, totalCount: count || 0 });
      }

      case "subscriptions": {
        if (!hasPermission(auth, "can_view_members")) {
          return errorResponse("Permission denied: cannot view subscriptions", 403);
        }

        if (Array.isArray(allowedBranchIds) && allowedBranchIds.length === 0) {
          return jsonResponse({ subscriptions: [] });
        }

        let query = supabase
          .from("subscriptions")
          .select("id, member_id, start_date, end_date, plan_months, status, branch_id, personal_trainer_id, trainer_fee, is_custom_package, custom_days, created_at, member:members(id, name, phone), personal_trainer:personal_trainers(id, name)")
          .order("created_at", { ascending: false });

        if (Array.isArray(allowedBranchIds)) query = query.in("branch_id", allowedBranchIds);

        query = query.range(cursor, cursor + limit - 1);
        const { data: subscriptions, error } = await query;
        if (error) throw new Error("Failed to fetch subscriptions");
        return jsonResponse({ subscriptions: subscriptions || [] });
      }

      case "daily-pass-users": {
        if (!hasPermission(auth, "can_view_members")) {
          return errorResponse("Permission denied: cannot view daily pass users", 403);
        }

        if (Array.isArray(allowedBranchIds) && allowedBranchIds.length === 0) {
          return jsonResponse({ users: [], nextCursor: null, totalCount: 0 });
        }

        let countQuery = supabase.from("daily_pass_users").select("*", { count: "exact", head: true });
        let usersQuery = supabase.from("daily_pass_users").select("*").order("created_at", { ascending: false });

        if (Array.isArray(allowedBranchIds)) {
          countQuery = countQuery.in("branch_id", allowedBranchIds);
          usersQuery = usersQuery.in("branch_id", allowedBranchIds);
        }

        const { count, error: countError } = await countQuery;
        if (countError) throw new Error("Failed to count daily pass users");

        usersQuery = usersQuery.range(cursor, cursor + limit - 1);
        const { data: users, error: usersError } = await usersQuery;
        if (usersError) throw new Error("Failed to fetch daily pass users");

        const today = new Date().toISOString().split("T")[0];
        const userIds = (users || []).map((u: any) => u.id);

        // BATCH: fetch all subscriptions for this page in 1 query instead of N
        const subsResult = userIds.length > 0
          ? await supabase.from("daily_pass_subscriptions")
              .select("id, daily_pass_user_id, package_name, duration_days, start_date, end_date, price, status")
              .in("daily_pass_user_id", userIds)
              .order("end_date", { ascending: false })
          : { data: [] };

        // Build lookup (latest sub per user)
        const subsByUser = new Map<string, any>();
        for (const sub of subsResult.data || []) {
          if (!subsByUser.has(sub.daily_pass_user_id)) {
            subsByUser.set(sub.daily_pass_user_id, sub);
          }
        }

        const usersWithSubs = (users || []).map((user: any) => {
          const subData = subsByUser.get(user.id) || null;
          return { ...user, latestSubscription: subData, isActive: subData && subData.end_date >= today };
        });

        const nextCursor = cursor + (users?.length || 0) < (count || 0) ? cursor + limit : null;
        return jsonResponse({ users: usersWithSubs, nextCursor, totalCount: count || 0 });
      }

      case "settings-page-data": {
        if (!branchId) return errorResponse("Branch ID required", 400);

        const [settingsRes, monthlyRes, customRes] = await Promise.all([
          supabase.from("gym_settings")
            .select("id, gym_name, gym_phone, gym_address, whatsapp_enabled, whatsapp_auto_send, gym_email, gym_gst, invoice_prefix, invoice_footer_message")
            .eq("branch_id", branchId).limit(1).maybeSingle(),
          supabase.from("monthly_packages").select("*").eq("branch_id", branchId).order("months"),
          supabase.from("custom_packages").select("*").eq("branch_id", branchId).order("duration_days"),
        ]);

        return jsonResponse({
          settings: settingsRes.data || null,
          monthlyPackages: monthlyRes.data || [],
          customPackages: customRes.data || [],
        }, 120);
      }

      case "log-stats": {
        if (!branchId) return errorResponse("Branch ID required", 400);

        const logType = url.searchParams.get("logType") || "admin";
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const weekAgo = new Date(today);
        weekAgo.setDate(weekAgo.getDate() - 7);
        const monthAgo = new Date(today);
        monthAgo.setMonth(monthAgo.getMonth() - 1);

        if (logType === "admin") {
          const baseFilter = (q: any) => q.eq("branch_id", branchId).not("admin_user_id", "is", null);
          const [totalRes, todayRes, weekRes, monthRes, catRes] = await Promise.all([
            baseFilter(supabase.from("admin_activity_logs").select("*", { count: "exact", head: true })),
            baseFilter(supabase.from("admin_activity_logs").select("*", { count: "exact", head: true }))
              .gte("created_at", today.toISOString()),
            baseFilter(supabase.from("admin_activity_logs").select("*", { count: "exact", head: true }))
              .gte("created_at", weekAgo.toISOString()),
            baseFilter(supabase.from("admin_activity_logs").select("*", { count: "exact", head: true }))
              .gte("created_at", monthAgo.toISOString()),
            baseFilter(supabase.from("admin_activity_logs").select("activity_category")).limit(50000),
          ]);

          const byCategory: Record<string, number> = {};
          (catRes.data || []).forEach((r: any) => {
            byCategory[r.activity_category] = (byCategory[r.activity_category] || 0) + 1;
          });

          return jsonResponse({
            totalActivities: totalRes.count || 0,
            activitiesToday: todayRes.count || 0,
            activitiesThisWeek: weekRes.count || 0,
            activitiesThisMonth: monthRes.count || 0,
            byCategory,
          }, 60);
        }

        if (logType === "user") {
          const baseFilter = (q: any) => q.eq("branch_id", branchId);
          const [totalRes, todayRes, weekRes, monthRes, typeRes] = await Promise.all([
            baseFilter(supabase.from("user_activity_logs").select("*", { count: "exact", head: true })),
            baseFilter(supabase.from("user_activity_logs").select("*", { count: "exact", head: true }))
              .gte("created_at", today.toISOString()),
            baseFilter(supabase.from("user_activity_logs").select("*", { count: "exact", head: true }))
              .gte("created_at", weekAgo.toISOString()),
            baseFilter(supabase.from("user_activity_logs").select("*", { count: "exact", head: true }))
              .gte("created_at", monthAgo.toISOString()),
            baseFilter(supabase.from("user_activity_logs").select("activity_type")).limit(50000),
          ]);

          const byType: Record<string, number> = {};
          (typeRes.data || []).forEach((r: any) => {
            byType[r.activity_type] = (byType[r.activity_type] || 0) + 1;
          });

          return jsonResponse({
            totalActivities: totalRes.count || 0,
            activitiesToday: todayRes.count || 0,
            activitiesThisWeek: weekRes.count || 0,
            activitiesThisMonth: monthRes.count || 0,
            byType,
          }, 60);
        }

        if (logType === "staff") {
          const baseFilter = (q: any) => q.eq("branch_id", branchId).is("admin_user_id", null);
          const [totalRes, todayRes, typeRes, assignmentsRes] = await Promise.all([
            baseFilter(supabase.from("admin_activity_logs").select("*", { count: "exact", head: true })),
            baseFilter(supabase.from("admin_activity_logs").select("*", { count: "exact", head: true }))
              .gte("created_at", today.toISOString()),
            baseFilter(supabase.from("admin_activity_logs").select("activity_type")).limit(50000),
            supabase.from("staff_branch_assignments").select("staff_id").eq("branch_id", branchId),
          ]);

          const typeCounts: Record<string, number> = {};
          (typeRes.data || []).forEach((r: any) => {
            typeCounts[r.activity_type] = (typeCounts[r.activity_type] || 0) + 1;
          });

          const staffIds = (assignmentsRes.data || []).map((a: any) => a.staff_id);
          let staffList: any[] = [];
          if (staffIds.length > 0) {
            const { data: staffData } = await supabase
              .from("staff").select("id, full_name, phone").in("id", staffIds).eq("is_active", true).order("full_name");
            staffList = staffData || [];
          }

          return jsonResponse({
            totalActivities: totalRes.count || 0,
            activitiesToday: todayRes.count || 0,
            typeCounts,
            staffList,
          }, 60);
        }

        if (logType === "whatsapp") {
          const baseFilter = (q: any) => q.eq("branch_id", branchId);
          const [totalRes, sentRes, failedRes, manualRes, todayRes, weekRes, monthRes, typeRes] = await Promise.all([
            baseFilter(supabase.from("whatsapp_notifications").select("*", { count: "exact", head: true })),
            baseFilter(supabase.from("whatsapp_notifications").select("*", { count: "exact", head: true })).eq("status", "sent"),
            baseFilter(supabase.from("whatsapp_notifications").select("*", { count: "exact", head: true })).eq("status", "failed"),
            baseFilter(supabase.from("whatsapp_notifications").select("*", { count: "exact", head: true })).eq("is_manual", true),
            baseFilter(supabase.from("whatsapp_notifications").select("*", { count: "exact", head: true })).gte("sent_at", today.toISOString()),
            baseFilter(supabase.from("whatsapp_notifications").select("*", { count: "exact", head: true })).gte("sent_at", weekAgo.toISOString()),
            baseFilter(supabase.from("whatsapp_notifications").select("*", { count: "exact", head: true })).gte("sent_at", monthAgo.toISOString()),
            baseFilter(supabase.from("whatsapp_notifications").select("notification_type")).limit(50000),
          ]);

          const messagesByType: Record<string, number> = {};
          (typeRes.data || []).forEach((r: any) => {
            messagesByType[r.notification_type] = (messagesByType[r.notification_type] || 0) + 1;
          });

          return jsonResponse({
            totalMessages: totalRes.count || 0,
            sentMessages: sentRes.count || 0,
            failedMessages: failedRes.count || 0,
            manualMessages: manualRes.count || 0,
            automatedMessages: (totalRes.count || 0) - (manualRes.count || 0),
            messagesToday: todayRes.count || 0,
            messagesThisWeek: weekRes.count || 0,
            messagesThisMonth: monthRes.count || 0,
            messagesByType,
          }, 60);
        }

        return errorResponse("Invalid logType", 400);
      }

      case "analytics-data": {
        if (!isModuleEnabled("reports_analytics")) {
          return errorResponse("Analytics is not available on your plan", 403);
        }
        if (!branchId) return errorResponse("Branch ID required", 400);

        const dateFromParam = url.searchParams.get("dateFrom");
        const dateToParam = url.searchParams.get("dateTo");
        if (!dateFromParam || !dateToParam) return errorResponse("dateFrom and dateTo required", 400);

        // Fetch all data in parallel
        const [paymentsRes, membersInRangeRes, membersBeforeRes, totalMembersRes, activeMembersRes, trainersRes, ptSubsRes, monthlyPkgsRes, subsInRangeRes] = await Promise.all([
          supabase.from("payments").select("amount, created_at").eq("branch_id", branchId).eq("status", "success")
            .gte("created_at", `${dateFromParam}T00:00:00`).lte("created_at", `${dateToParam}T23:59:59`).order("created_at", { ascending: true }),
          supabase.from("members").select("created_at").eq("branch_id", branchId)
            .gte("created_at", `${dateFromParam}T00:00:00`).lte("created_at", `${dateToParam}T23:59:59`).order("created_at", { ascending: true }),
          supabase.from("members").select("*", { count: "exact", head: true }).eq("branch_id", branchId)
            .lt("created_at", `${dateFromParam}T00:00:00`),
          supabase.from("members").select("*", { count: "exact", head: true }).eq("branch_id", branchId),
          supabase.from("subscriptions").select("*", { count: "exact", head: true }).eq("branch_id", branchId).eq("status", "active"),
          supabase.from("personal_trainers").select("id, name").eq("branch_id", branchId).eq("is_active", true),
          supabase.from("pt_subscriptions").select("personal_trainer_id, member_id, total_fee, created_at, status").eq("branch_id", branchId)
            .gte("created_at", `${dateFromParam}T00:00:00`).lte("created_at", `${dateToParam}T23:59:59`),
          supabase.from("monthly_packages").select("id, months, price").eq("branch_id", branchId).eq("is_active", true).order("months", { ascending: true }),
          supabase.from("subscriptions").select("plan_months, created_at, is_custom_package").eq("branch_id", branchId)
            .gte("created_at", `${dateFromParam}T00:00:00`).lte("created_at", `${dateToParam}T23:59:59`),
        ]);

        // === SERVER-SIDE AGGREGATION ===
        const payments = paymentsRes.data || [];
        const membersInRange = membersInRangeRes.data || [];
        const membersBefore = membersBeforeRes.count || 0;
        const totalMembers = totalMembersRes.count || 0;
        const activeMembers = activeMembersRes.count || 0;
        const trainers = trainersRes.data || [];
        const ptSubs = ptSubsRes.data || [];
        const monthlyPkgs = monthlyPkgsRes.data || [];
        const subsInRange = subsInRangeRes.data || [];

        const startDate = new Date(`${dateFromParam}T00:00:00Z`);
        const endDate = new Date(`${dateToParam}T23:59:59Z`);
        const daysDiff = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));

        // Generate time intervals
        type Interval = { label: string; start: Date; end: Date };
        const intervals: Interval[] = [];
        
        if (daysDiff <= 14) {
          for (let d = new Date(startDate); d <= endDate; d = new Date(d.getTime() + 86400000)) {
            const label = d.toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
            intervals.push({ label, start: new Date(d), end: new Date(d.getTime() + 86400000 - 1) });
          }
        } else if (daysDiff <= 90) {
          // Weekly intervals
          const d = new Date(startDate);
          // Align to Monday
          const dayOfWeek = d.getDay();
          const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
          d.setDate(d.getDate() + mondayOffset);
          while (d <= endDate) {
            const weekEnd = new Date(d.getTime() + 6 * 86400000);
            const label = d.toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
            intervals.push({ label, start: new Date(d), end: weekEnd > endDate ? new Date(endDate) : weekEnd });
            d.setDate(d.getDate() + 7);
          }
        } else {
          // Monthly intervals
          const d = new Date(startDate.getFullYear(), startDate.getMonth(), 1);
          while (d <= endDate) {
            const monthEnd = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59);
            const label = d.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
            intervals.push({ label, start: new Date(d), end: monthEnd > endDate ? new Date(endDate) : monthEnd });
            d.setMonth(d.getMonth() + 1);
          }
        }

        const findInterval = (dateStr: string): string | null => {
          const date = new Date(dateStr);
          for (let i = intervals.length - 1; i >= 0; i--) {
            if (date >= intervals[i].start && date <= intervals[i].end) return intervals[i].label;
          }
          // Fallback: find closest
          if (intervals.length > 0) {
            if (date < intervals[0].start) return intervals[0].label;
            return intervals[intervals.length - 1].label;
          }
          return null;
        };

        // Revenue aggregation
        const revenueMap: Record<string, { revenue: number; payments: number }> = {};
        intervals.forEach(i => { revenueMap[i.label] = { revenue: 0, payments: 0 }; });
        for (const p of payments) {
          const label = findInterval(p.created_at);
          if (label && revenueMap[label]) { revenueMap[label].revenue += Number(p.amount); revenueMap[label].payments += 1; }
        }
        const revenueData = intervals.map(i => ({ month: i.label, revenue: revenueMap[i.label]?.revenue || 0, payments: revenueMap[i.label]?.payments || 0 }));

        // Member growth aggregation
        const memberMap: Record<string, number> = {};
        intervals.forEach(i => { memberMap[i.label] = 0; });
        for (const m of membersInRange) {
          const label = findInterval(m.created_at);
          if (label && memberMap[label] !== undefined) memberMap[label] += 1;
        }
        let cumulative = membersBefore;
        const memberGrowth = intervals.map(i => {
          cumulative += memberMap[i.label] || 0;
          return { month: i.label, members: cumulative, newMembers: memberMap[i.label] || 0 };
        });

        // Totals
        const totalRevenue = payments.reduce((s: number, p: any) => s + Number(p.amount), 0);
        const avgRevenue = (totalRevenue / Math.max(1, daysDiff)) * 30;

        // Trainer stats
        const trainerStats = trainers.map((trainer: any) => {
          const subs = ptSubs.filter((s: any) => s.personal_trainer_id === trainer.id);
          const uniqueMembers = new Set(subs.map((s: any) => s.member_id)).size;
          const revenue = subs.reduce((sum: number, s: any) => sum + Number(s.total_fee || 0), 0);
          const trainerRevMap: Record<string, number> = {};
          intervals.forEach(i => { trainerRevMap[i.label] = 0; });
          subs.forEach((s: any) => {
            const label = findInterval(s.created_at);
            if (label && trainerRevMap[label] !== undefined) trainerRevMap[label] += Number(s.total_fee || 0);
          });
          return {
            id: trainer.id, name: trainer.name, members: uniqueMembers, revenue,
            monthlyRevenue: intervals.map(i => ({ month: i.label, revenue: trainerRevMap[i.label] || 0, payments: 0 })),
          };
        }).filter((t: any) => t.members > 0 || t.revenue > 0);

        // Package sales
        const packageList = monthlyPkgs.map((pkg: any) => ({
          id: pkg.id, label: `${pkg.months} Month${pkg.months > 1 ? "s" : ""}`, months: pkg.months,
        }));
        const pkgSalesMap: Record<string, Record<number, number>> = {};
        intervals.forEach(i => { pkgSalesMap[i.label] = {}; packageList.forEach((p: any) => { pkgSalesMap[i.label][p.months] = 0; }); });
        subsInRange.filter((s: any) => !s.is_custom_package).forEach((s: any) => {
          const label = findInterval(s.created_at);
          if (label && pkgSalesMap[label]?.[s.plan_months] !== undefined) pkgSalesMap[label][s.plan_months] += 1;
        });
        const packageSalesData = intervals.map(i => {
          const dp: Record<string, any> = { month: i.label };
          packageList.forEach((p: any) => { dp[p.label] = pkgSalesMap[i.label][p.months] || 0; });
          return dp;
        });

        return jsonResponse({
          revenueData,
          memberGrowth,
          trainerStats,
          packageSalesData,
          packageList,
          totals: { totalRevenue, totalMembers, activeMembers, avgRevenue },
        }, 30);
      }

      case "staff-page-data": {
        if (!auth.isAdmin && !auth.isStaff) {
          return errorResponse("Permission denied", 403);
        }

        const [staffResult, permissionsResult, assignmentsResult, ledgerResult] = await Promise.all([
          supabase.from("staff")
            .select("id, full_name, phone, role, id_type, id_number, salary_type, monthly_salary, session_fee, percentage_fee, specialization, auth_user_id, password_set_at, is_active, created_at, updated_at, last_login_at, last_login_ip, failed_login_attempts, locked_until")
            .order("full_name"),
          supabase.from("staff_permissions")
            .select("*"),
          supabase.from("staff_branch_assignments")
            .select("id, staff_id, branch_id, is_primary, branches(name)"),
          (() => {
            let q = supabase.from("ledger_entries").select("amount")
              .eq("entry_type", "expense")
              .in("category", ["trainer_percentage", "trainer_session", "staff_salary"]);
            if (Array.isArray(allowedBranchIds) && allowedBranchIds.length > 0) {
              q = q.in("branch_id", allowedBranchIds);
            }
            return q;
          })(),
        ]);

        if (staffResult.error) throw new Error("Failed to fetch staff: " + staffResult.error.message);

        const combinedStaff = (staffResult.data || []).map((s: any) => ({
          ...s,
          permissions: (permissionsResult.data || []).find((p: any) => p.staff_id === s.id) || null,
          branch_assignments: (assignmentsResult.data || [])
            .filter((a: any) => a.staff_id === s.id)
            .map((a: any) => ({
              id: a.id, staff_id: a.staff_id, branch_id: a.branch_id,
              is_primary: a.is_primary, branch_name: a.branches?.name || null,
            })),
        }));

        let filteredStaff = combinedStaff;
        if (Array.isArray(allowedBranchIds) && allowedBranchIds.length > 0) {
          filteredStaff = combinedStaff.filter((s: any) =>
            s.branch_assignments.some((a: any) => allowedBranchIds.includes(a.branch_id)) ||
            s.branch_assignments.length === 0
          );
        }

        const totalPaidToStaff = (ledgerResult.data || []).reduce(
          (sum: number, e: any) => sum + Number(e.amount || 0), 0
        );

        return jsonResponse({ staff: filteredStaff, totalPaidToStaff }, 60);
      }

      case "branch-analytics-data": {
        const dateFromParam = url.searchParams.get("dateFrom");
        const dateToParam = url.searchParams.get("dateTo");
        const prevFromParam = url.searchParams.get("prevFrom");
        const prevToParam = url.searchParams.get("prevTo");

        if (!dateFromParam || !dateToParam) return errorResponse("dateFrom and dateTo required", 400);

        // Resolve allowed branches based on user's tenant (data isolation)
        const branchAllowed = await resolveAllowedBranchIds(supabase, auth, null);

        let branchQuery = supabase.from("branches").select("id, name").eq("is_active", true).is("deleted_at", null);
        if (branchAllowed !== null) {
          if (branchAllowed.length === 0) {
            return jsonResponse({ branchMetrics: [], trainerMetrics: [], timeSeries: [] }, 120);
          }
          branchQuery = branchQuery.in("id", branchAllowed);
        }

        const { data: activeBranches } = await branchQuery;
        if (!activeBranches || activeBranches.length === 0) {
          return jsonResponse({ branchMetrics: [], trainerMetrics: [], timeSeries: [] }, 120);
        }

        const branchIds = activeBranches.map((b: any) => b.id);
        const branchNameMap: Record<string, string> = {};
        activeBranches.forEach((b: any) => { branchNameMap[b.id] = b.name; });

        // BATCH: Fetch all data for ALL branches in bulk queries instead of per-branch
        const fetchPeriodData = async (from: string, to: string) => {
          const [paymentsRes, expensesRes, totalMembersRes, newMembersRes, activeSubsRes, churnedRes, ptSubsRes, staffCountRes, marketingRes] = await Promise.all([
            supabase.from("payments").select("amount, branch_id").in("branch_id", branchIds).eq("status", "success")
              .gte("created_at", `${from}T00:00:00`).lte("created_at", `${to}T23:59:59`),
            supabase.from("ledger_entries").select("amount, branch_id").in("branch_id", branchIds).eq("entry_type", "expense")
              .gte("entry_date", from).lte("entry_date", to),
            supabase.from("members").select("id, branch_id").in("branch_id", branchIds),
            supabase.from("members").select("id, branch_id").in("branch_id", branchIds)
              .gte("created_at", `${from}T00:00:00`).lte("created_at", `${to}T23:59:59`),
            supabase.from("subscriptions").select("id, branch_id").in("branch_id", branchIds).eq("status", "active"),
            supabase.from("subscriptions").select("id, branch_id").in("branch_id", branchIds).eq("status", "expired")
              .gte("end_date", from).lte("end_date", to),
            supabase.from("pt_subscriptions").select("id, branch_id").in("branch_id", branchIds)
              .gte("created_at", `${from}T00:00:00`).lte("created_at", `${to}T23:59:59`),
            supabase.from("staff_branch_assignments").select("id, branch_id").in("branch_id", branchIds),
            supabase.from("ledger_entries").select("amount, branch_id").in("branch_id", branchIds).eq("entry_type", "expense")
              .ilike("category", "%marketing%").gte("entry_date", from).lte("entry_date", to),
          ]);

          // Group by branch_id
          const groupSum = (data: any[], field = "amount") => {
            const map: Record<string, number> = {};
            for (const row of data || []) {
              map[row.branch_id] = (map[row.branch_id] || 0) + Number(row[field] || 0);
            }
            return map;
          };

          const groupCount = (data: any[]) => {
            const map: Record<string, number> = {};
            for (const row of data || []) {
              map[row.branch_id] = (map[row.branch_id] || 0) + 1;
            }
            return map;
          };

          return {
            revenueByBranch: groupSum(paymentsRes.data || []),
            expensesByBranch: groupSum(expensesRes.data || []),
            totalMembersByBranch: groupCount(totalMembersRes.data || []),
            newMembersByBranch: groupCount(newMembersRes.data || []),
            activeMembersByBranch: groupCount(activeSubsRes.data || []),
            churnedByBranch: groupCount(churnedRes.data || []),
            ptSubsByBranch: groupCount(ptSubsRes.data || []),
            staffByBranch: groupCount(staffCountRes.data || []),
            marketingByBranch: groupSum(marketingRes.data || []),
          };
        };

        const [currentData, previousData] = await Promise.all([
          fetchPeriodData(dateFromParam, dateToParam),
          prevFromParam && prevToParam ? fetchPeriodData(prevFromParam, prevToParam) : Promise.resolve(null),
        ]);

        const branchMetrics = branchIds.map((bid: string) => {
          const revenue = currentData.revenueByBranch[bid] || 0;
          const totalExpenses = currentData.expensesByBranch[bid] || 0;
          const profit = revenue - totalExpenses;
          const profitMargin = revenue > 0 ? (profit / revenue) * 100 : 0;
          const totalMembers = currentData.totalMembersByBranch[bid] || 0;
          const newMembers = currentData.newMembersByBranch[bid] || 0;
          const activeMembers = currentData.activeMembersByBranch[bid] || 0;
          const churnedMembers = currentData.churnedByBranch[bid] || 0;
          const churnRate = totalMembers > 0 ? (churnedMembers / totalMembers) * 100 : 0;
          const conversionRate = newMembers > 0 ? Math.min((newMembers / (newMembers + 10)) * 100, 100) : 0;
          const staffCount = currentData.staffByBranch[bid] || 0;
          const staffPerformance = staffCount > 0 ? revenue / staffCount : 0;
          const marketingExpense = currentData.marketingByBranch[bid] || 0;
          const marketingROI = marketingExpense > 0 ? ((revenue - marketingExpense) / marketingExpense) * 100 : 0;
          const avgRevenuePerMember = totalMembers > 0 ? revenue / totalMembers : 0;

          let previousPeriodRevenue = 0, revenueGrowth = 0, previousPeriodMembers = 0, memberGrowth = 0;
          if (previousData) {
            previousPeriodRevenue = previousData.revenueByBranch[bid] || 0;
            revenueGrowth = previousPeriodRevenue > 0 ? ((revenue - previousPeriodRevenue) / previousPeriodRevenue) * 100 : revenue > 0 ? 100 : 0;
            previousPeriodMembers = previousData.totalMembersByBranch[bid] || 0;
            memberGrowth = previousPeriodMembers > 0 ? ((totalMembers - previousPeriodMembers) / previousPeriodMembers) * 100 : totalMembers > 0 ? 100 : 0;
          }

          return {
            branchId: bid, branchName: branchNameMap[bid],
            revenue, expenses: totalExpenses, profit, profitMargin,
            totalMembers, activeMembers, newMembers, churnedMembers, churnRate, conversionRate,
            ptSubscriptions: currentData.ptSubsByBranch[bid] || 0, avgRevenuePerMember,
            staffCount, staffPerformance, marketingROI,
            previousPeriodRevenue, revenueGrowth, previousPeriodMembers, memberGrowth,
          };
        });

        // Trainer metrics - batch fetch all trainers + their PT subs
        const { data: trainers } = await supabase
          .from("personal_trainers")
          .select("id, name, branch_id, payment_category, percentage_fee, session_fee, monthly_salary")
          .eq("is_active", true)
          .in("branch_id", branchIds);

        let trainerMetricsResult: any[] = [];
        if (trainers && trainers.length > 0) {
          const trainerIds = trainers.map((t: any) => t.id);

          // BATCH: fetch all PT subs for all trainers at once
          const [allPtSubsRes, currentPtSubsRes, previousPtSubsRes] = await Promise.all([
            supabase.from("pt_subscriptions")
              .select("id, personal_trainer_id, member_id, total_fee, created_at, status, start_date, end_date")
              .in("personal_trainer_id", trainerIds).in("branch_id", branchIds),
            supabase.from("pt_subscriptions")
              .select("id, personal_trainer_id, member_id, total_fee, created_at, status")
              .in("personal_trainer_id", trainerIds).in("branch_id", branchIds)
              .gte("created_at", `${dateFromParam}T00:00:00`).lte("created_at", `${dateToParam}T23:59:59`),
            prevFromParam && prevToParam
              ? supabase.from("pt_subscriptions")
                  .select("id, personal_trainer_id, member_id, total_fee, created_at")
                  .in("personal_trainer_id", trainerIds).in("branch_id", branchIds)
                  .gte("created_at", `${prevFromParam}T00:00:00`).lte("created_at", `${prevToParam}T23:59:59`)
              : Promise.resolve({ data: [] }),
          ]);

          // Group by trainer
          const groupByTrainer = (data: any[]) => {
            const map: Record<string, any[]> = {};
            for (const row of data || []) {
              if (!map[row.personal_trainer_id]) map[row.personal_trainer_id] = [];
              map[row.personal_trainer_id].push(row);
            }
            return map;
          };

          const allByTrainer = groupByTrainer(allPtSubsRes.data || []);
          const currentByTrainer = groupByTrainer(currentPtSubsRes.data || []);
          const prevByTrainer = groupByTrainer(previousPtSubsRes.data || []);

          trainerMetricsResult = trainers.map((trainer: any) => {
            const allPtSubs = allByTrainer[trainer.id] || [];
            const currentPtSubs = currentByTrainer[trainer.id] || [];
            const previousPtSubs = prevByTrainer[trainer.id] || [];

            const currentRevenue = currentPtSubs.reduce((sum: number, s: any) => sum + Number(s.total_fee || 0), 0);
            const previousRevenue = previousPtSubs.reduce((sum: number, s: any) => sum + Number(s.total_fee || 0), 0);
            const revenueGrowth = previousRevenue > 0 ? ((currentRevenue - previousRevenue) / previousRevenue) * 100 : currentRevenue > 0 ? 100 : 0;

            const uniqueCurrentClients = new Set(currentPtSubs.map((s: any) => s.member_id)).size;
            const uniqueAllClients = new Set(allPtSubs.map((s: any) => s.member_id)).size;
            const uniquePreviousClients = new Set(previousPtSubs.map((s: any) => s.member_id)).size;
            const clientGrowth = uniquePreviousClients > 0 ? ((uniqueCurrentClients - uniquePreviousClients) / uniquePreviousClients) * 100 : uniqueCurrentClients > 0 ? 100 : 0;

            const activeSubs = allPtSubs.filter((s: any) => s.status === "active");
            const activeClients = new Set(activeSubs.map((s: any) => s.member_id)).size;
            const churnedSubs = allPtSubs.filter((s: any) => s.status === "expired" && new Date(s.end_date) >= new Date(dateFromParam) && new Date(s.end_date) <= new Date(dateToParam));
            const churnedClients = churnedSubs.length;
            const retentionRate = uniqueAllClients > 0 ? ((uniqueAllClients - churnedClients) / uniqueAllClients) * 100 : 100;
            const renewalRate = uniqueAllClients > 0 ? (activeClients / uniqueAllClients) * 100 : 0;
            const avgRevenuePerClient = uniqueCurrentClients > 0 ? currentRevenue / uniqueCurrentClients : 0;
            const totalSessions = currentPtSubs.length;
            const avgRevenuePerSession = totalSessions > 0 ? currentRevenue / totalSessions : 0;
            const efficiencyScore = (revenueGrowth * 0.4 + retentionRate * 0.3 + (clientGrowth > 0 ? clientGrowth : 0) * 0.3) / 100;

            return {
              trainerId: trainer.id, trainerName: trainer.name,
              branchId: trainer.branch_id || "", branchName: branchNameMap[trainer.branch_id] || "",
              revenue: currentRevenue, activeClients, totalClients: uniqueAllClients,
              newClients: uniqueCurrentClients, churnedClients,
              clientRetentionRate: retentionRate, avgRevenuePerClient, avgRevenuePerSession,
              totalSessions, renewalRate, clientGrowthRate: clientGrowth,
              efficiencyScore: efficiencyScore * 100,
              paymentCategory: trainer.payment_category || "monthly_percentage",
              percentageFee: trainer.percentage_fee || 0,
              sessionFee: trainer.session_fee || 0,
              monthlySalary: trainer.monthly_salary || 0,
              previousPeriodRevenue: previousRevenue, revenueGrowth,
              previousPeriodClients: uniquePreviousClients, clientGrowth,
            };
          });

          trainerMetricsResult.sort((a: any, b: any) => b.efficiencyScore - a.efficiencyScore);
        }

        // === TIME SERIES: Server-side computation ===
        // Fetch all payments for the current period across branches (already have them in currentData fetch)
        const { data: tsPayments } = await supabase.from("payments")
          .select("amount, created_at, branch_id")
          .in("branch_id", branchIds).eq("status", "success")
          .gte("created_at", `${dateFromParam}T00:00:00`).lte("created_at", `${dateToParam}T23:59:59`)
          .order("created_at", { ascending: true });

        const tsDays = Math.ceil((new Date(`${dateToParam}T23:59:59`).getTime() - new Date(`${dateFromParam}T00:00:00`).getTime()) / (1000 * 60 * 60 * 24));
        const tsGroupBy = tsDays <= 30 ? "day" : tsDays <= 90 ? "week" : "month";

        const branchRevByDate: Record<string, Record<string, number>> = {};
        branchIds.forEach((id: string) => { branchRevByDate[id] = {}; });
        const allDateKeys = new Set<string>();

        for (const p of tsPayments || []) {
          const date = new Date(p.created_at);
          let key: string;
          if (tsGroupBy === "day") {
            key = date.toLocaleDateString("en-US", { month: "short", day: "2-digit" });
          } else if (tsGroupBy === "week") {
            // ISO week number
            const jan1 = new Date(date.getFullYear(), 0, 1);
            const weekNum = Math.ceil(((date.getTime() - jan1.getTime()) / 86400000 + jan1.getDay() + 1) / 7);
            key = `Week ${weekNum}`;
          } else {
            key = date.toLocaleDateString("en-US", { month: "short", year: "numeric" });
          }
          if (!branchRevByDate[p.branch_id]) branchRevByDate[p.branch_id] = {};
          branchRevByDate[p.branch_id][key] = (branchRevByDate[p.branch_id][key] || 0) + Number(p.amount || 0);
          allDateKeys.add(key);
        }

        const timeSeries = Array.from(allDateKeys).sort().map((dateKey: string) => {
          const point: Record<string, any> = { date: dateKey };
          activeBranches.forEach((branch: any) => {
            point[branch.name] = branchRevByDate[branch.id]?.[dateKey] || 0;
          });
          return point;
        });

        return jsonResponse({ branchMetrics, trainerMetrics: trainerMetricsResult, timeSeries }, 30);
      }

      default:
        return errorResponse("Invalid action", 400);
    }
  } catch (error: unknown) {
    console.error("Protected data error:", error);
    const message = error instanceof Error ? error.message : "Internal server error";
    return errorResponse(message, 500);
  }
});
