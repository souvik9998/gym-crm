/**
 * Protected Data Edge Function
 * 
 * Serves full operational data for authenticated admin/staff users only.
 * Validates authorization before returning any data.
 * 
 * Endpoints:
 * - GET ?action=trainers&branchId=xxx - Full trainer data (requires can_view_members or can_manage_members)
 * - GET ?action=settings&branchId=xxx - Full gym settings (requires can_change_settings)
 * - GET ?action=packages&branchId=xxx - Full package data including inactive (requires can_change_settings)
 * - GET ?action=members&branchId=xxx - Full member data (requires can_view_members or can_manage_members)
 * - GET ?action=member&memberId=xxx - Single member with details (requires can_view_members)
 * - GET ?action=payments&branchId=xxx - Payment data (requires can_access_payments)
 * - GET ?action=ledger&branchId=xxx - Ledger entries (requires can_access_ledger)
 * - GET ?action=subscriptions&branchId=xxx - Subscription data (requires can_view_members)
 * - GET ?action=daily-pass-users&branchId=xxx - Daily pass users (requires can_view_members)
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
  staffId?: string;
  permissions?: any;
  branchIds?: string[];
}

// Verify staff session and get staff info
async function verifyStaffSession(supabase: any, token: string): Promise<AuthResult> {
  // Extract token from Bearer format
  const sessionToken = token.replace("Bearer ", "");
  
  // Verify session
  const { data: session, error: sessionError } = await supabase
    .from("staff_sessions")
    .select("staff_id, expires_at, is_revoked")
    .eq("session_token", sessionToken)
    .single();

  if (sessionError || !session || session.is_revoked) {
    return { valid: false, isAdmin: false, isStaff: false };
  }

  // Check expiration
  if (new Date(session.expires_at) <= new Date()) {
    return { valid: false, isAdmin: false, isStaff: false };
  }

  // Get permissions
  const { data: permissions, error: permError } = await supabase
    .from("staff_permissions")
    .select("*")
    .eq("staff_id", session.staff_id)
    .single();

  if (permError || !permissions) {
    return { valid: false, isAdmin: false, isStaff: false };
  }

  // Get assigned branches
  const { data: assignments, error: assignError } = await supabase
    .from("staff_branch_assignments")
    .select("branch_id")
    .eq("staff_id", session.staff_id);

  const branchIds = (assignments || []).map((a: any) => a.branch_id);

  return {
    valid: true,
    isAdmin: false,
    isStaff: true,
    staffId: session.staff_id,
    permissions,
    branchIds,
  };
}

// Verify admin session via Supabase Auth
async function verifyAdminSession(supabase: any, token: string): Promise<AuthResult> {
  try {
    // Create a client with the user's token to verify
    const { data: { user }, error } = await supabase.auth.getUser(token.replace("Bearer ", ""));
    
    if (error || !user) {
      return { valid: false, isAdmin: false, isStaff: false };
    }

    // Check if user has admin role
    const { data: roleData, error: roleError } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "admin")
      .maybeSingle();

    if (roleError || !roleData) {
      return { valid: false, isAdmin: false, isStaff: false };
    }

    return { valid: true, isAdmin: true, isStaff: false };
  } catch (error) {
    console.error("Admin verification error:", error);
    return { valid: false, isAdmin: false, isStaff: false };
  }
}

// Combined authentication check
async function authenticateRequest(supabase: any, authHeader: string): Promise<AuthResult> {
  // Try staff auth first, then admin auth
  const staffAuth = await verifyStaffSession(supabase, authHeader);
  if (staffAuth.valid) {
    return staffAuth;
  }
  
  const adminAuth = await verifyAdminSession(supabase, authHeader);
  return adminAuth;
}

// Check if user has access to branch
function hasBranchAccess(auth: AuthResult, branchId: string | null): boolean {
  if (auth.isAdmin) return true;
  if (!branchId) return true;
  return auth.branchIds?.includes(branchId) || false;
}

// Check permission
function hasPermission(auth: AuthResult, permission: string): boolean {
  if (auth.isAdmin) return true;
  if (!auth.permissions) return false;
  return auth.permissions[permission] === true;
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Only allow GET requests
  if (req.method !== "GET") {
    return new Response(
      JSON.stringify({ error: "Method not allowed" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 405 }
    );
  }

  try {
    const url = new URL(req.url);
    const action = url.searchParams.get("action");
    const branchId = url.searchParams.get("branchId");
    const memberId = url.searchParams.get("memberId");
    const cursor = parseInt(url.searchParams.get("cursor") || "0");
    const limit = Math.min(parseInt(url.searchParams.get("limit") || "25"), 100);

    // Get authorization header
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Authorization required" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 401 }
      );
    }

    // Validate branchId format if provided
    if (branchId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(branchId)) {
      return new Response(
        JSON.stringify({ error: "Invalid branch ID format" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    // Validate memberId format if provided
    if (memberId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(memberId)) {
      return new Response(
        JSON.stringify({ error: "Invalid member ID format" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error("Server configuration error");
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Authenticate the request
    const auth = await authenticateRequest(supabase, authHeader);
    
    if (!auth.valid) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 403 }
      );
    }

    // Check branch access
    if (!hasBranchAccess(auth, branchId)) {
      return new Response(
        JSON.stringify({ error: "Access denied to this branch" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 403 }
      );
    }

    switch (action) {
      case "trainers": {
        // Check permission: needs can_view_members or can_manage_members
        if (!hasPermission(auth, "can_view_members") && !hasPermission(auth, "can_manage_members")) {
          return new Response(
            JSON.stringify({ error: "Permission denied: cannot view trainers" }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 403 }
          );
        }

        // Get full trainer data
        let trainersQuery = supabase
          .from("personal_trainers")
          .select("*")
          .eq("is_active", true);

        if (branchId) {
          trainersQuery = trainersQuery.eq("branch_id", branchId);
        } else if (auth.isStaff && auth.branchIds && auth.branchIds.length > 0) {
          trainersQuery = trainersQuery.in("branch_id", auth.branchIds);
        }

        const { data: trainers, error: trainersError } = await trainersQuery;

        if (trainersError) {
          console.error("Error fetching trainers:", trainersError);
          throw new Error("Failed to fetch trainers");
        }

        return new Response(
          JSON.stringify({ trainers: trainers || [] }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "all-trainers": {
        // Get all trainers including inactive - for settings/management
        if (!hasPermission(auth, "can_change_settings")) {
          return new Response(
            JSON.stringify({ error: "Permission denied: cannot manage trainers" }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 403 }
          );
        }

        let trainersQuery = supabase.from("personal_trainers").select("*");

        if (branchId) {
          trainersQuery = trainersQuery.eq("branch_id", branchId);
        } else if (auth.isStaff && auth.branchIds && auth.branchIds.length > 0) {
          trainersQuery = trainersQuery.in("branch_id", auth.branchIds);
        }

        const { data: trainers, error: trainersError } = await trainersQuery;

        if (trainersError) {
          console.error("Error fetching all trainers:", trainersError);
          throw new Error("Failed to fetch trainers");
        }

        return new Response(
          JSON.stringify({ trainers: trainers || [] }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "settings": {
        // Check permission: needs can_change_settings
        if (!hasPermission(auth, "can_change_settings")) {
          return new Response(
            JSON.stringify({ error: "Permission denied: cannot access settings" }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 403 }
          );
        }

        if (!branchId) {
          return new Response(
            JSON.stringify({ error: "Branch ID required" }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
          );
        }

        // Get full gym settings
        const { data: settings, error: settingsError } = await supabase
          .from("gym_settings")
          .select("*")
          .eq("branch_id", branchId)
          .maybeSingle();

        if (settingsError) {
          console.error("Error fetching settings:", settingsError);
          throw new Error("Failed to fetch settings");
        }

        return new Response(
          JSON.stringify({ settings: settings || null }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "packages": {
        // Check permission for full package data including inactive
        if (!hasPermission(auth, "can_change_settings")) {
          return new Response(
            JSON.stringify({ error: "Permission denied: cannot manage packages" }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 403 }
          );
        }

        // Get all packages including inactive
        let monthlyQuery = supabase.from("monthly_packages").select("*");
        let customQuery = supabase.from("custom_packages").select("*");

        if (branchId) {
          monthlyQuery = monthlyQuery.eq("branch_id", branchId);
          customQuery = customQuery.eq("branch_id", branchId);
        } else if (auth.isStaff && auth.branchIds && auth.branchIds.length > 0) {
          monthlyQuery = monthlyQuery.in("branch_id", auth.branchIds);
          customQuery = customQuery.in("branch_id", auth.branchIds);
        }

        const [monthlyResult, customResult] = await Promise.all([
          monthlyQuery.order("months"),
          customQuery.order("duration_days"),
        ]);

        if (monthlyResult.error || customResult.error) {
          console.error("Error fetching packages:", monthlyResult.error || customResult.error);
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
        // Check permission: needs can_view_members or can_manage_members
        if (!hasPermission(auth, "can_view_members") && !hasPermission(auth, "can_manage_members")) {
          return new Response(
            JSON.stringify({ error: "Permission denied: cannot view members" }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 403 }
          );
        }

        // Build query with branch filtering
        let countQuery = supabase.from("members").select("*", { count: "exact", head: true });
        let membersQuery = supabase.from("members").select("*").order("created_at", { ascending: false });

        if (branchId) {
          countQuery = countQuery.eq("branch_id", branchId);
          membersQuery = membersQuery.eq("branch_id", branchId);
        } else if (auth.isStaff && auth.branchIds && auth.branchIds.length > 0) {
          countQuery = countQuery.in("branch_id", auth.branchIds);
          membersQuery = membersQuery.in("branch_id", auth.branchIds);
        }

        // Get count
        const { count, error: countError } = await countQuery;
        if (countError) {
          console.error("Error counting members:", countError);
          throw new Error("Failed to count members");
        }

        // Paginate
        membersQuery = membersQuery.range(cursor, cursor + limit - 1);
        const { data: members, error: membersError } = await membersQuery;

        if (membersError) {
          console.error("Error fetching members:", membersError);
          throw new Error("Failed to fetch members");
        }

        const today = new Date().toISOString().split("T")[0];

        // Get subscriptions and PT data for each member
        const membersWithData = await Promise.all(
          (members || []).map(async (member: any) => {
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

            return {
              ...member,
              subscription: subData || undefined,
              activePT: ptData
                ? {
                    trainer_name: (ptData.personal_trainer as any)?.name || "Unknown",
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
        // Check permission
        if (!hasPermission(auth, "can_view_members") && !hasPermission(auth, "can_manage_members")) {
          return new Response(
            JSON.stringify({ error: "Permission denied: cannot view member" }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 403 }
          );
        }

        if (!memberId) {
          return new Response(
            JSON.stringify({ error: "Member ID required" }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
          );
        }

        // Fetch member
        const { data: member, error: memberError } = await supabase
          .from("members")
          .select("*")
          .eq("id", memberId)
          .single();

        if (memberError || !member) {
          return new Response(
            JSON.stringify({ error: "Member not found" }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 404 }
          );
        }

        // Check branch access for staff
        if (auth.isStaff && auth.branchIds && !auth.branchIds.includes(member.branch_id)) {
          return new Response(
            JSON.stringify({ error: "Access denied to this member" }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 403 }
          );
        }

        // Fetch member details (sensitive info)
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
        // Check permission
        if (!hasPermission(auth, "can_access_payments")) {
          return new Response(
            JSON.stringify({ error: "Permission denied: cannot view payments" }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 403 }
          );
        }

        let query = supabase
          .from("payments")
          .select(`
            id, amount, payment_mode, status, created_at, notes, payment_type,
            razorpay_payment_id, razorpay_order_id, branch_id,
            member_id, subscription_id, daily_pass_user_id, daily_pass_subscription_id
          `)
          .order("created_at", { ascending: false });

        if (branchId) {
          query = query.eq("branch_id", branchId);
        } else if (auth.isStaff && auth.branchIds && auth.branchIds.length > 0) {
          query = query.in("branch_id", auth.branchIds);
        }

        query = query.range(cursor, cursor + limit - 1);
        const { data: payments, error: paymentsError } = await query;

        if (paymentsError) {
          console.error("Error fetching payments:", paymentsError);
          throw new Error("Failed to fetch payments");
        }

        // Get member/daily pass user names for display
        const memberIds = [...new Set((payments || []).filter(p => p.member_id).map(p => p.member_id))];
        const dpUserIds = [...new Set((payments || []).filter(p => p.daily_pass_user_id).map(p => p.daily_pass_user_id))];

        let members: any[] = [];
        let dpUsers: any[] = [];

        if (memberIds.length > 0) {
          const { data } = await supabase.from("members").select("id, name, phone").in("id", memberIds);
          members = data || [];
        }

        if (dpUserIds.length > 0) {
          const { data } = await supabase.from("daily_pass_users").select("id, name, phone").in("id", dpUserIds);
          dpUsers = data || [];
        }

        const paymentsWithNames = (payments || []).map((p: any) => ({
          ...p,
          member: members.find(m => m.id === p.member_id) || null,
          dailyPassUser: dpUsers.find(u => u.id === p.daily_pass_user_id) || null,
        }));

        return new Response(
          JSON.stringify({ payments: paymentsWithNames }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "ledger": {
        // Check permission
        if (!hasPermission(auth, "can_access_ledger")) {
          return new Response(
            JSON.stringify({ error: "Permission denied: cannot view ledger" }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 403 }
          );
        }

        let query = supabase
          .from("ledger_entries")
          .select("*")
          .order("entry_date", { ascending: false })
          .order("created_at", { ascending: false });

        if (branchId) {
          query = query.eq("branch_id", branchId);
        } else if (auth.isStaff && auth.branchIds && auth.branchIds.length > 0) {
          query = query.in("branch_id", auth.branchIds);
        }

        query = query.range(cursor, cursor + limit - 1);
        const { data: entries, error: entriesError } = await query;

        if (entriesError) {
          console.error("Error fetching ledger:", entriesError);
          throw new Error("Failed to fetch ledger");
        }

        return new Response(
          JSON.stringify({ entries: entries || [] }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "subscriptions": {
        // Check permission
        if (!hasPermission(auth, "can_view_members") && !hasPermission(auth, "can_manage_members")) {
          return new Response(
            JSON.stringify({ error: "Permission denied: cannot view subscriptions" }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 403 }
          );
        }

        let query = supabase
          .from("subscriptions")
          .select("*, member:members(id, name, phone), trainer:personal_trainers(id, name)")
          .order("created_at", { ascending: false });

        if (branchId) {
          query = query.eq("branch_id", branchId);
        } else if (auth.isStaff && auth.branchIds && auth.branchIds.length > 0) {
          query = query.in("branch_id", auth.branchIds);
        }

        query = query.range(cursor, cursor + limit - 1);
        const { data: subscriptions, error: subError } = await query;

        if (subError) {
          console.error("Error fetching subscriptions:", subError);
          throw new Error("Failed to fetch subscriptions");
        }

        return new Response(
          JSON.stringify({ subscriptions: subscriptions || [] }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "daily-pass-users": {
        // Check permission
        if (!hasPermission(auth, "can_view_members") && !hasPermission(auth, "can_manage_members")) {
          return new Response(
            JSON.stringify({ error: "Permission denied: cannot view daily pass users" }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 403 }
          );
        }

        let query = supabase
          .from("daily_pass_users")
          .select("*")
          .order("created_at", { ascending: false });

        if (branchId) {
          query = query.eq("branch_id", branchId);
        } else if (auth.isStaff && auth.branchIds && auth.branchIds.length > 0) {
          query = query.in("branch_id", auth.branchIds);
        }

        query = query.range(cursor, cursor + limit - 1);
        const { data: users, error: usersError } = await query;

        if (usersError) {
          console.error("Error fetching daily pass users:", usersError);
          throw new Error("Failed to fetch daily pass users");
        }

        // Get active subscriptions for each user
        const usersWithSubs = await Promise.all(
          (users || []).map(async (user: any) => {
            const { data: subs } = await supabase
              .from("daily_pass_subscriptions")
              .select("*")
              .eq("daily_pass_user_id", user.id)
              .eq("status", "active")
              .order("end_date", { ascending: false })
              .limit(1)
              .maybeSingle();

            return { ...user, activeSubscription: subs || null };
          })
        );

        return new Response(
          JSON.stringify({ users: usersWithSubs }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "pt-subscriptions": {
        // Check permission
        if (!hasPermission(auth, "can_view_members") && !hasPermission(auth, "can_manage_members")) {
          return new Response(
            JSON.stringify({ error: "Permission denied: cannot view PT subscriptions" }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 403 }
          );
        }

        let query = supabase
          .from("pt_subscriptions")
          .select("*, member:members(id, name, phone), trainer:personal_trainers(id, name)")
          .order("created_at", { ascending: false });

        if (branchId) {
          query = query.eq("branch_id", branchId);
        } else if (auth.isStaff && auth.branchIds && auth.branchIds.length > 0) {
          query = query.in("branch_id", auth.branchIds);
        }

        query = query.range(cursor, cursor + limit - 1);
        const { data: ptSubs, error: ptError } = await query;

        if (ptError) {
          console.error("Error fetching PT subscriptions:", ptError);
          throw new Error("Failed to fetch PT subscriptions");
        }

        return new Response(
          JSON.stringify({ subscriptions: ptSubs || [] }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      default:
        return new Response(
          JSON.stringify({ error: "Invalid action" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
        );
    }
  } catch (error) {
    console.error("Protected data error:", error);
    const message = error instanceof Error ? error.message : "Internal server error";
    return new Response(
      JSON.stringify({ error: message }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
