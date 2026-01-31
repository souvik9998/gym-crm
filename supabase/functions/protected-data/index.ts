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
 */

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Verify staff session and get staff info
async function verifyStaffSession(supabase: any, token: string): Promise<{
  valid: boolean;
  staffId?: string;
  permissions?: any;
  branchIds?: string[];
}> {
  // Extract token from Bearer format
  const sessionToken = token.replace("Bearer ", "");
  
  // Verify session
  const { data: session, error: sessionError } = await supabase
    .from("staff_sessions")
    .select("staff_id, expires_at, is_revoked")
    .eq("session_token", sessionToken)
    .single();

  if (sessionError || !session || session.is_revoked) {
    return { valid: false };
  }

  // Check expiration
  if (new Date(session.expires_at) <= new Date()) {
    return { valid: false };
  }

  // Get permissions
  const { data: permissions, error: permError } = await supabase
    .from("staff_permissions")
    .select("*")
    .eq("staff_id", session.staff_id)
    .single();

  if (permError || !permissions) {
    return { valid: false };
  }

  // Get assigned branches
  const { data: assignments, error: assignError } = await supabase
    .from("staff_branch_assignments")
    .select("branch_id")
    .eq("staff_id", session.staff_id);

  const branchIds = (assignments || []).map((a: any) => a.branch_id);

  return {
    valid: true,
    staffId: session.staff_id,
    permissions,
    branchIds,
  };
}

// Verify admin session via Supabase Auth
async function verifyAdminSession(supabase: any, token: string): Promise<{
  valid: boolean;
  userId?: string;
}> {
  try {
    // Create a client with the user's token to verify
    const { data: { user }, error } = await supabase.auth.getUser(token.replace("Bearer ", ""));
    
    if (error || !user) {
      return { valid: false };
    }

    // Check if user has admin role
    const { data: roleData, error: roleError } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "admin")
      .maybeSingle();

    if (roleError || !roleData) {
      return { valid: false };
    }

    return { valid: true, userId: user.id };
  } catch (error) {
    console.error("Admin verification error:", error);
    return { valid: false };
  }
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

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error("Server configuration error");
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Try staff auth first, then admin auth
    let isAdmin = false;
    let isStaff = false;
    let staffPermissions: any = null;
    let staffBranchIds: string[] = [];

    // Check if it's a staff token (custom session token)
    const staffAuth = await verifyStaffSession(supabase, authHeader);
    if (staffAuth.valid) {
      isStaff = true;
      staffPermissions = staffAuth.permissions;
      staffBranchIds = staffAuth.branchIds || [];
    } else {
      // Try admin auth
      const adminAuth = await verifyAdminSession(supabase, authHeader);
      if (adminAuth.valid) {
        isAdmin = true;
      }
    }

    if (!isAdmin && !isStaff) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 403 }
      );
    }

    // For staff, verify branch access
    if (isStaff && branchId && !staffBranchIds.includes(branchId)) {
      return new Response(
        JSON.stringify({ error: "Access denied to this branch" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 403 }
      );
    }

    switch (action) {
      case "trainers": {
        // Check permission: staff needs can_view_members or can_manage_members
        if (isStaff && !staffPermissions?.can_view_members && !staffPermissions?.can_manage_members) {
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
        } else if (isStaff && staffBranchIds.length > 0) {
          // Staff can only see trainers from their branches
          trainersQuery = trainersQuery.in("branch_id", staffBranchIds);
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
        if (isStaff && !staffPermissions?.can_change_settings) {
          return new Response(
            JSON.stringify({ error: "Permission denied: cannot manage trainers" }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 403 }
          );
        }

        let trainersQuery = supabase.from("personal_trainers").select("*");

        if (branchId) {
          trainersQuery = trainersQuery.eq("branch_id", branchId);
        } else if (isStaff && staffBranchIds.length > 0) {
          trainersQuery = trainersQuery.in("branch_id", staffBranchIds);
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
        // Check permission: staff needs can_change_settings
        if (isStaff && !staffPermissions?.can_change_settings) {
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
        if (isStaff && !staffPermissions?.can_change_settings) {
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
        } else if (isStaff && staffBranchIds.length > 0) {
          monthlyQuery = monthlyQuery.in("branch_id", staffBranchIds);
          customQuery = customQuery.in("branch_id", staffBranchIds);
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
