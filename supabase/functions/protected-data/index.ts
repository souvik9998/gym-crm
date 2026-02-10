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
 * Version: 2.0
 */

import { createClient } from "npm:@supabase/supabase-js@2";

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
  permissions?: Record<string, boolean>;
  branchIds?: string[];
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

  // Verify JWT - try getClaims first, fall back to getUser
  let userId: string | null = null;

  const { data: claimsData, error: claimsError } = await anonClient.auth.getClaims(token);
  if (!claimsError && claimsData?.claims?.sub) {
    userId = String(claimsData.claims.sub);
  } else {
    console.warn("getClaims failed, trying getUser:", claimsError?.message);
    // Fallback: use getUser with explicit token
    const { data: userData, error: userError } = await anonClient.auth.getUser(token);
    if (!userError && userData?.user?.id) {
      userId = userData.user.id;
    } else {
      console.error("Both getClaims and getUser failed:", userError?.message);
      return { valid: false, isAdmin: false, isStaff: false };
    }
  }

  // Check if user is an admin-like user.
  // In this SaaS: 
  // - super_admin (platform)
  // - tenant_admin (gym owner)
  // - admin (tenant internal admin)
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

  // Check if user is staff (may have multiple records across branches)
  const { data: staffList } = await serviceClient
    .from("staff")
    .select("id, is_active")
    .eq("auth_user_id", userId)
    .eq("is_active", true);

  const staff = (staffList as { id: string; is_active: boolean }[] | null)?.[0];
  if (!staff) {
    return { valid: false, isAdmin: false, isStaff: false };
  }

  // Get staff permissions (from primary staff record)
  const { data: permissions } = await serviceClient
    .from("staff_permissions")
    .select("*")
    .eq("staff_id", staff.id)
    .single();

  // Get assigned branches across ALL staff records for this user
  const allStaffIds = (staffList || []).map((s: { id: string }) => s.id);
  const { data: assignments } = await serviceClient
    .from("staff_branch_assignments")
    .select("branch_id")
    .in("staff_id", allStaffIds);

  const branchIds = (assignments || []).map((a: { branch_id: string }) => a.branch_id);

  return {
    valid: true,
    isAdmin: false,
    isStaff: true,
    userId,
    staffId: staff.id,
    permissions: permissions || {},
    branchIds,
  };
}

function hasBranchAccess(auth: AuthResult, branchId: string | null): boolean {
  if (auth.isAdmin) return true;
  if (!branchId) return true;
  return auth.branchIds?.includes(branchId) || false;
}

async function resolveAllowedBranchIds(
  // deno-lint-ignore no-explicit-any
  serviceClient: any,
  auth: AuthResult,
  requestedBranchId: string | null
): Promise<string[] | null> {
  // If a specific branch is requested, scope to that branch (permission checks happen separately)
  if (requestedBranchId) return [requestedBranchId];

  // Staff are restricted to assigned branches
  if (auth.isStaff) return auth.branchIds || [];

  // Super admins can see everything (no tenant scoping)
  if (auth.isAdmin && auth.isSuperAdmin) return null;

  // Tenant-scoped admins: only branches belonging to their tenant
  if (auth.isAdmin && auth.userId) {
    const { data: membership, error: membershipError } = await serviceClient
      .from("tenant_members")
      .select("tenant_id")
      .eq("user_id", auth.userId)
      .limit(1)
      .maybeSingle();

    if (membershipError) {
      console.error("Error resolving tenant membership:", membershipError);
      return [];
    }

    const tenantId = membership?.tenant_id as string | undefined;
    if (!tenantId) {
      // Not a tenant member means: deny data (prevents accidental global leakage)
      return [];
    }

    const { data: branches, error: branchesError } = await serviceClient
      .from("branches")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("is_active", true);

    if (branchesError) {
      console.error("Error resolving tenant branches:", branchesError);
      return [];
    }

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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

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

    // Validate UUIDs
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

    // Client used ONLY for JWT validation (does not need service role)
    const anonClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Client used for data access (service role). Authorization is still validated above.
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

    switch (action) {
      case "health": {
        // Health check endpoint - no permissions required, just valid auth
        return new Response(
          JSON.stringify({ 
            status: "ok", 
            isAdmin: auth.isAdmin, 
            isStaff: auth.isStaff,
            timestamp: new Date().toISOString(),
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "dashboard-stats": {
        // Dashboard stats - admin or staff with view members permission
        if (!hasPermission(auth, "can_view_members") && !auth.isAdmin) {
          return errorResponse("Permission denied: cannot view dashboard", 403);
        }

        // Refresh subscription statuses
        await supabase.rpc("refresh_subscription_statuses");

        // If tenant admin has no branches, return zeroed stats
        if (Array.isArray(allowedBranchIds) && allowedBranchIds.length === 0) {
          return new Response(
            JSON.stringify({
              totalMembers: 0,
              activeMembers: 0,
              expiringSoon: 0,
              expiredMembers: 0,
              inactiveMembers: 0,
              monthlyRevenue: 0,
              withPT: 0,
              dailyPassUsers: 0,
            }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Build query with branch/tenant filter
        let membersCountQuery = supabase.from("members").select("*", { count: "exact", head: true });
        if (Array.isArray(allowedBranchIds)) {
          membersCountQuery = membersCountQuery.in("branch_id", allowedBranchIds);
        }
        const { count: totalMembers, error: membersCountError } = await membersCountQuery;
        if (membersCountError) throw membersCountError;

        // Get all members
        let memberDataQuery = supabase.from("members").select("id");
        if (Array.isArray(allowedBranchIds)) {
          memberDataQuery = memberDataQuery.in("branch_id", allowedBranchIds);
        }
        const { data: membersData, error: membersDataError } = await memberDataQuery;
        if (membersDataError) throw membersDataError;

        // Get subscriptions for status calculations
        let subscriptionsQuery = supabase
          .from("subscriptions")
          .select("member_id, status, end_date")
          .order("end_date", { ascending: false });
        if (Array.isArray(allowedBranchIds)) {
          subscriptionsQuery = subscriptionsQuery.in("branch_id", allowedBranchIds);
        }
        const { data: allSubscriptions, error: subsError } = await subscriptionsQuery;
        if (subsError) throw subsError;

        // Group subscriptions by member (latest first)
        const memberSubscriptions = new Map<string, { status: string; end_date: string }>();
        if (allSubscriptions) {
          for (const sub of allSubscriptions) {
            if (!memberSubscriptions.has(sub.member_id)) {
              memberSubscriptions.set(sub.member_id, { status: sub.status || "inactive", end_date: sub.end_date });
            }
          }
        }

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        let activeCount = 0;
        let expiringSoonCount = 0;
        let expiredCount = 0;
        let inactiveCount = 0;

        // Calculate status based on actual dates
        if (membersData) {
          for (const member of membersData) {
            const sub = memberSubscriptions.get(member.id);

            if (!sub) {
              continue;
            }

            if (sub.status === "inactive") {
              inactiveCount++;
              continue;
            }

            const endDate = new Date(sub.end_date);
            endDate.setHours(0, 0, 0, 0);
            const diffDays = Math.ceil((endDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
            const isExpired = diffDays < 0;
            const isExpiringSoon = !isExpired && diffDays >= 0 && diffDays <= 7;

            if (isExpired) {
              expiredCount++;
            } else if (isExpiringSoon) {
              expiringSoonCount++;
            } else {
              activeCount++;
            }
          }
        }

        const startOfMonth = new Date();
        startOfMonth.setDate(1);
        startOfMonth.setHours(0, 0, 0, 0);

        let paymentsQuery = supabase
          .from("payments")
          .select("amount")
          .eq("status", "success")
          .gte("created_at", startOfMonth.toISOString());
        if (Array.isArray(allowedBranchIds)) {
          paymentsQuery = paymentsQuery.in("branch_id", allowedBranchIds);
        }
        const { data: payments, error: paymentsError } = await paymentsQuery;
        if (paymentsError) throw paymentsError;

        const monthlyRevenue = payments?.reduce((sum, p) => sum + Number(p.amount), 0) || 0;

        // Get active PT subscriptions count
        const todayStr = new Date().toISOString().split("T")[0];
        let ptQuery = supabase
          .from("pt_subscriptions")
          .select("member_id")
          .eq("status", "active")
          .gte("end_date", todayStr);
        if (Array.isArray(allowedBranchIds)) {
          ptQuery = ptQuery.in("branch_id", allowedBranchIds);
        }
        const { data: activePTData, error: ptError } = await ptQuery;
        if (ptError) throw ptError;

        const uniquePTMembers = new Set(activePTData?.map((pt) => pt.member_id) || []).size;

        // Get daily pass users count
        let dailyPassQuery = supabase.from("daily_pass_users").select("*", { count: "exact", head: true });
        if (Array.isArray(allowedBranchIds)) {
          dailyPassQuery = dailyPassQuery.in("branch_id", allowedBranchIds);
        }
        const { count: dailyPassCount, error: dailyPassError } = await dailyPassQuery;
        if (dailyPassError) throw dailyPassError;

        return new Response(
          JSON.stringify({
            totalMembers: totalMembers || 0,
            activeMembers: activeCount,
            expiringSoon: expiringSoonCount,
            expiredMembers: expiredCount,
            inactiveMembers: inactiveCount,
            monthlyRevenue,
            withPT: uniquePTMembers,
            dailyPassUsers: dailyPassCount || 0,
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "trainers": {
        if (!hasPermission(auth, "can_view_members") && !hasPermission(auth, "can_manage_members")) {
          return errorResponse("Permission denied: cannot view trainers", 403);
        }

        let query = supabase.from("personal_trainers").select("*").eq("is_active", true);

        if (Array.isArray(allowedBranchIds)) {
          query = query.in("branch_id", allowedBranchIds);
        }

        const { data: trainers, error } = await query;
        if (error) throw new Error("Failed to fetch trainers");

        return new Response(
          JSON.stringify({ trainers: trainers || [] }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "all-trainers": {
        if (!hasPermission(auth, "can_change_settings")) {
          return errorResponse("Permission denied: cannot manage trainers", 403);
        }

        let query = supabase.from("personal_trainers").select("*");

        if (Array.isArray(allowedBranchIds)) {
          query = query.in("branch_id", allowedBranchIds);
        }

        const { data: trainers, error } = await query;
        if (error) throw new Error("Failed to fetch trainers");

        return new Response(
          JSON.stringify({ trainers: trainers || [] }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "settings": {
        if (!hasPermission(auth, "can_change_settings")) {
          return errorResponse("Permission denied: cannot access settings", 403);
        }

        if (!branchId) {
          return errorResponse("Branch ID required", 400);
        }

        const { data: settings, error } = await supabase
          .from("gym_settings")
          .select("*")
          .eq("branch_id", branchId)
          .maybeSingle();

        if (error) throw new Error("Failed to fetch settings");

        return new Response(
          JSON.stringify({ settings: settings || null }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
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

        if (monthlyResult.error || customResult.error) {
          throw new Error("Failed to fetch packages");
        }

        return new Response(
          JSON.stringify({
            monthlyPackages: monthlyResult.data || [],
            customPackages: customResult.data || [],
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "members": {
        if (!hasPermission(auth, "can_view_members") && !hasPermission(auth, "can_manage_members")) {
          return errorResponse("Permission denied: cannot view members", 403);
        }

        // If tenant admin has no branches, return empty list (prevents cross-tenant leakage)
        if (Array.isArray(allowedBranchIds) && allowedBranchIds.length === 0) {
          return new Response(
            JSON.stringify({ members: [], nextCursor: null, totalCount: 0 }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        let countQuery = supabase.from("members").select("*", { count: "exact", head: true });
        let membersQuery = supabase.from("members").select("*").order("created_at", { ascending: false });

        if (Array.isArray(allowedBranchIds)) {
          countQuery = countQuery.in("branch_id", allowedBranchIds);
          membersQuery = membersQuery.in("branch_id", allowedBranchIds);
        }

        const { count, error: countError } = await countQuery;
        if (countError) throw new Error("Failed to count members");

        membersQuery = membersQuery.range(cursor, cursor + limit - 1);
        const { data: members, error: membersError } = await membersQuery;
        if (membersError) throw new Error("Failed to fetch members");

        const today = new Date().toISOString().split("T")[0];

        const membersWithData = await Promise.all(
          (members || []).map(async (member: Record<string, unknown>) => {
            const { data: subData } = await supabase
              .from("subscriptions")
              .select("id, status, end_date, start_date")
              .eq("member_id", member.id)
              .order("end_date", { ascending: false })
              .limit(1)
              .maybeSingle();

            const { data: ptData } = await supabase
              .from("pt_subscriptions")
              .select("end_date, personal_trainer:personal_trainers(name)")
              .eq("member_id", member.id)
              .eq("status", "active")
              .gte("end_date", today)
              .order("end_date", { ascending: false })
              .limit(1)
              .maybeSingle();

            // deno-lint-ignore no-explicit-any
            const trainerData = ptData?.personal_trainer as any;
            return {
              ...member,
              subscription: subData || undefined,
              activePT: ptData
                ? {
                    trainer_name: trainerData?.name || "Unknown",
                    end_date: ptData.end_date,
                  }
                : null,
            };
          })
        );

        const nextCursor = cursor + (members?.length || 0) < (count || 0) ? cursor + limit : null;

        return new Response(
          JSON.stringify({
            members: membersWithData,
            nextCursor,
            totalCount: count || 0,
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "member": {
        if (!hasPermission(auth, "can_view_members") && !hasPermission(auth, "can_manage_members")) {
          return errorResponse("Permission denied: cannot view member", 403);
        }

        if (!memberId) {
          return errorResponse("Member ID required", 400);
        }

        const { data: member, error: memberError } = await supabase
          .from("members")
          .select("*")
          .eq("id", memberId)
          .single();

        if (memberError || !member) {
          return errorResponse("Member not found", 404);
        }

        // Enforce branch/tenant isolation for staff + tenant-scoped admins
        if (Array.isArray(allowedBranchIds) && !allowedBranchIds.includes(member.branch_id)) {
          return errorResponse("Access denied to this member", 403);
        }

        const { data: details } = await supabase
          .from("member_details")
          .select("*")
          .eq("member_id", memberId)
          .maybeSingle();

        return new Response(
          JSON.stringify({ member, details: details || null }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "payments": {
        if (!hasPermission(auth, "can_access_payments")) {
          return errorResponse("Permission denied: cannot view payments", 403);
        }

        let countQuery = supabase.from("payments").select("*", { count: "exact", head: true });
        let paymentsQuery = supabase
          .from("payments")
          .select(`
            *,
            member:members(id, name, phone),
            subscription:subscriptions(id, plan_months, start_date, end_date),
            daily_pass_user:daily_pass_users(id, name, phone)
          `)
          .order("created_at", { ascending: false });

        if (Array.isArray(allowedBranchIds) && allowedBranchIds.length === 0) {
          return new Response(
            JSON.stringify({ payments: [], nextCursor: null, totalCount: 0 }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

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

        return new Response(
          JSON.stringify({
            payments: payments || [],
            nextCursor,
            totalCount: count || 0,
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "ledger": {
        if (!hasPermission(auth, "can_access_ledger")) {
          return errorResponse("Permission denied: cannot view ledger", 403);
        }

        let countQuery = supabase.from("ledger_entries").select("*", { count: "exact", head: true });
        let ledgerQuery = supabase
          .from("ledger_entries")
          .select(`
            *,
            member:members(id, name, phone),
            trainer:personal_trainers(id, name),
            daily_pass_user:daily_pass_users(id, name, phone)
          `)
          .order("entry_date", { ascending: false });

        if (Array.isArray(allowedBranchIds) && allowedBranchIds.length === 0) {
          return new Response(
            JSON.stringify({ entries: [], nextCursor: null, totalCount: 0 }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

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

        return new Response(
          JSON.stringify({
            entries: entries || [],
            nextCursor,
            totalCount: count || 0,
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "subscriptions": {
        if (!hasPermission(auth, "can_view_members")) {
          return errorResponse("Permission denied: cannot view subscriptions", 403);
        }

        let query = supabase
          .from("subscriptions")
          .select(`
            *,
            member:members(id, name, phone),
            personal_trainer:personal_trainers(id, name)
          `)
          .order("created_at", { ascending: false });

        if (Array.isArray(allowedBranchIds) && allowedBranchIds.length === 0) {
          return new Response(
            JSON.stringify({ subscriptions: [] }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        if (Array.isArray(allowedBranchIds)) {
          query = query.in("branch_id", allowedBranchIds);
        }

        query = query.range(cursor, cursor + limit - 1);
        const { data: subscriptions, error } = await query;
        if (error) throw new Error("Failed to fetch subscriptions");

        return new Response(
          JSON.stringify({ subscriptions: subscriptions || [] }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "daily-pass-users": {
        if (!hasPermission(auth, "can_view_members")) {
          return errorResponse("Permission denied: cannot view daily pass users", 403);
        }

        let countQuery = supabase.from("daily_pass_users").select("*", { count: "exact", head: true });
        let usersQuery = supabase.from("daily_pass_users").select("*").order("created_at", { ascending: false });

        if (Array.isArray(allowedBranchIds) && allowedBranchIds.length === 0) {
          return new Response(
            JSON.stringify({ users: [], nextCursor: null, totalCount: 0 }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

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

        const usersWithSubs = await Promise.all(
          (users || []).map(async (user: Record<string, unknown>) => {
            const { data: subData } = await supabase
              .from("daily_pass_subscriptions")
              .select("*")
              .eq("daily_pass_user_id", user.id)
              .order("end_date", { ascending: false })
              .limit(1)
              .maybeSingle();

            const isActive = subData && subData.end_date >= today;

            return {
              ...user,
              latestSubscription: subData || null,
              isActive,
            };
          })
        );

        const nextCursor = cursor + (users?.length || 0) < (count || 0) ? cursor + limit : null;

        return new Response(
          JSON.stringify({
            users: usersWithSubs,
            nextCursor,
            totalCount: count || 0,
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
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
