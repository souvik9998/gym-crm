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
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface AuthResult {
  valid: boolean;
  isAdmin: boolean;
  isStaff: boolean;
  userId?: string;
  staffId?: string;
  permissions?: Record<string, boolean>;
  branchIds?: string[];
}

// Verify session via Supabase Auth and determine role
async function authenticateRequest(
  // deno-lint-ignore no-explicit-any
  supabase: any, 
  authHeader: string
): Promise<AuthResult> {
  const token = authHeader.replace("Bearer ", "");
  
  // Verify JWT
  const { data: { user }, error } = await supabase.auth.getUser(token);
  
  if (error || !user) {
    return { valid: false, isAdmin: false, isStaff: false };
  }

  // Check if user is admin
  const { data: adminRole } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id)
    .eq("role", "admin")
    .maybeSingle();

  if (adminRole) {
    return { valid: true, isAdmin: true, isStaff: false, userId: user.id };
  }

  // Check if user is staff
  const { data: staffData } = await supabase
    .from("staff")
    .select("id, is_active")
    .eq("auth_user_id", user.id)
    .single();

  const staff = staffData as { id: string; is_active: boolean } | null;
  if (!staff || !staff.is_active) {
    return { valid: false, isAdmin: false, isStaff: false };
  }

  // Get staff permissions
  const { data: permissions } = await supabase
    .from("staff_permissions")
    .select("*")
    .eq("staff_id", staff.id)
    .single();

  // Get assigned branches
  const { data: assignments } = await supabase
    .from("staff_branch_assignments")
    .select("branch_id")
    .eq("staff_id", staff.id);

  const branchIds = (assignments || []).map((a: { branch_id: string }) => a.branch_id);

  return {
    valid: true,
    isAdmin: false,
    isStaff: true,
    userId: user.id,
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
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error("Server configuration error");
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    const auth = await authenticateRequest(supabase, authHeader);
    
    if (!auth.valid) {
      return errorResponse("Unauthorized", 403);
    }

    if (!hasBranchAccess(auth, branchId)) {
      return errorResponse("Access denied to this branch", 403);
    }

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

        // Build query with branch filter
        let membersCountQuery = supabase.from("members").select("*", { count: "exact", head: true });
        if (branchId) {
          membersCountQuery = membersCountQuery.eq("branch_id", branchId);
        } else if (auth.isStaff && auth.branchIds?.length) {
          membersCountQuery = membersCountQuery.in("branch_id", auth.branchIds);
        }
        const { count: totalMembers, error: membersCountError } = await membersCountQuery;
        if (membersCountError) throw membersCountError;

        // Get all members
        let memberDataQuery = supabase.from("members").select("id");
        if (branchId) {
          memberDataQuery = memberDataQuery.eq("branch_id", branchId);
        } else if (auth.isStaff && auth.branchIds?.length) {
          memberDataQuery = memberDataQuery.in("branch_id", auth.branchIds);
        }
        const { data: membersData, error: membersDataError } = await memberDataQuery;
        if (membersDataError) throw membersDataError;

        // Get subscriptions for status calculations
        let subscriptionsQuery = supabase
          .from("subscriptions")
          .select("member_id, status, end_date")
          .order("end_date", { ascending: false });
        if (branchId) {
          subscriptionsQuery = subscriptionsQuery.eq("branch_id", branchId);
        } else if (auth.isStaff && auth.branchIds?.length) {
          subscriptionsQuery = subscriptionsQuery.in("branch_id", auth.branchIds);
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
        if (branchId) {
          paymentsQuery = paymentsQuery.eq("branch_id", branchId);
        } else if (auth.isStaff && auth.branchIds?.length) {
          paymentsQuery = paymentsQuery.in("branch_id", auth.branchIds);
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
        if (branchId) {
          ptQuery = ptQuery.eq("branch_id", branchId);
        } else if (auth.isStaff && auth.branchIds?.length) {
          ptQuery = ptQuery.in("branch_id", auth.branchIds);
        }
        const { data: activePTData, error: ptError } = await ptQuery;
        if (ptError) throw ptError;

        const uniquePTMembers = new Set(activePTData?.map((pt) => pt.member_id) || []).size;

        // Get daily pass users count
        let dailyPassQuery = supabase.from("daily_pass_users").select("*", { count: "exact", head: true });
        if (branchId) {
          dailyPassQuery = dailyPassQuery.eq("branch_id", branchId);
        } else if (auth.isStaff && auth.branchIds?.length) {
          dailyPassQuery = dailyPassQuery.in("branch_id", auth.branchIds);
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

        if (branchId) {
          query = query.eq("branch_id", branchId);
        } else if (auth.isStaff && auth.branchIds?.length) {
          query = query.in("branch_id", auth.branchIds);
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

        if (branchId) {
          query = query.eq("branch_id", branchId);
        } else if (auth.isStaff && auth.branchIds?.length) {
          query = query.in("branch_id", auth.branchIds);
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

        if (branchId) {
          monthlyQuery = monthlyQuery.eq("branch_id", branchId);
          customQuery = customQuery.eq("branch_id", branchId);
        } else if (auth.isStaff && auth.branchIds?.length) {
          monthlyQuery = monthlyQuery.in("branch_id", auth.branchIds);
          customQuery = customQuery.in("branch_id", auth.branchIds);
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

        let countQuery = supabase.from("members").select("*", { count: "exact", head: true });
        let membersQuery = supabase.from("members").select("*").order("created_at", { ascending: false });

        if (branchId) {
          countQuery = countQuery.eq("branch_id", branchId);
          membersQuery = membersQuery.eq("branch_id", branchId);
        } else if (auth.isStaff && auth.branchIds?.length) {
          countQuery = countQuery.in("branch_id", auth.branchIds);
          membersQuery = membersQuery.in("branch_id", auth.branchIds);
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

        if (auth.isStaff && auth.branchIds && !auth.branchIds.includes(member.branch_id)) {
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

        if (branchId) {
          countQuery = countQuery.eq("branch_id", branchId);
          paymentsQuery = paymentsQuery.eq("branch_id", branchId);
        } else if (auth.isStaff && auth.branchIds?.length) {
          countQuery = countQuery.in("branch_id", auth.branchIds);
          paymentsQuery = paymentsQuery.in("branch_id", auth.branchIds);
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

        if (branchId) {
          countQuery = countQuery.eq("branch_id", branchId);
          ledgerQuery = ledgerQuery.eq("branch_id", branchId);
        } else if (auth.isStaff && auth.branchIds?.length) {
          countQuery = countQuery.in("branch_id", auth.branchIds);
          ledgerQuery = ledgerQuery.in("branch_id", auth.branchIds);
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

        if (branchId) {
          query = query.eq("branch_id", branchId);
        } else if (auth.isStaff && auth.branchIds?.length) {
          query = query.in("branch_id", auth.branchIds);
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

        if (branchId) {
          countQuery = countQuery.eq("branch_id", branchId);
          usersQuery = usersQuery.eq("branch_id", branchId);
        } else if (auth.isStaff && auth.branchIds?.length) {
          countQuery = countQuery.in("branch_id", auth.branchIds);
          usersQuery = usersQuery.in("branch_id", auth.branchIds);
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
