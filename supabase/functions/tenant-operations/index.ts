import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface TenantCreateRequest {
  name: string;
  slug: string;
  email?: string;
  phone?: string;
  ownerEmail: string;
  ownerPassword: string;
  limits?: {
    maxBranches?: number;
    maxStaffPerBranch?: number;
    maxMembers?: number;
    maxTrainers?: number;
    maxMonthlyWhatsAppMessages?: number;
    features?: Record<string, boolean>;
  };
}

interface LimitCheckRequest {
  tenantId: string;
  resourceType: "branch" | "staff" | "member" | "trainer" | "whatsapp";
}

interface UsageUpdateRequest {
  tenantId: string;
  resourceType: "whatsapp";
  count?: number;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const action = url.searchParams.get("action");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Parse request body
    const bodyText = await req.text();
    const body = bodyText ? JSON.parse(bodyText) : {};

    // Get auth token for user verification
    const authHeader = req.headers.get("Authorization");
    let userId: string | null = null;
    let isSuperAdmin = false;

    if (authHeader) {
      const token = authHeader.replace("Bearer ", "");
      const { data: { user } } = await supabase.auth.getUser(token);
      userId = user?.id || null;

      if (userId) {
        // Check if user is super_admin
        const { data: roleData } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", userId)
          .eq("role", "super_admin")
          .maybeSingle();
        
        isSuperAdmin = !!roleData;
      }
    }

    switch (action) {
      // ========================================
      // SUPER ADMIN ACTIONS
      // ========================================
      case "create-tenant": {
        if (!isSuperAdmin) {
          return new Response(
            JSON.stringify({ error: "Unauthorized: Super admin access required" }),
            { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const { name, slug, email, phone, ownerEmail, ownerPassword, limits } = body;

        // Validate required fields
        if (!name || !slug) {
          return new Response(
            JSON.stringify({ error: "Missing required fields: name, slug" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Owner credentials required for new tenant
        if (!ownerEmail || !ownerPassword) {
          return new Response(
            JSON.stringify({ error: "Owner email and password are required" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Validate slug format
        if (!/^[a-z0-9-]+$/.test(slug)) {
          return new Response(
            JSON.stringify({ error: "Invalid slug format: only lowercase letters, numbers, and hyphens allowed" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Check if owner email already exists
        const { data: existingUsers } = await supabase.auth.admin.listUsers();
        const existingUser = existingUsers?.users?.find(u => u.email === ownerEmail);
        
        let ownerUserId: string;

        if (existingUser) {
          // User exists - check if they're already assigned to a tenant
          const { data: existingMembership } = await supabase
            .from("tenant_members")
            .select("tenant_id")
            .eq("user_id", existingUser.id)
            .limit(1);

          if (existingMembership && existingMembership.length > 0) {
            return new Response(
              JSON.stringify({ error: "This email is already associated with another organization" }),
              { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }

          ownerUserId = existingUser.id;
          console.log(`Using existing user ${ownerEmail} as owner`);
        } else {
          // Create new user for the gym owner
          console.log(`Creating new user for gym owner: ${ownerEmail}`);
          const { data: newUser, error: createUserError } = await supabase.auth.admin.createUser({
            email: ownerEmail,
            password: ownerPassword,
            email_confirm: true, // Auto-confirm email
          });

          if (createUserError || !newUser?.user) {
            console.error("Error creating owner user:", createUserError);
            return new Response(
              JSON.stringify({ error: createUserError?.message || "Failed to create owner account" }),
              { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }

          ownerUserId = newUser.user.id;
          console.log(`Created new user: ${ownerUserId}`);
        }

        // Create tenant
        const { data: tenant, error: tenantError } = await supabase
          .from("tenants")
          .insert({
            name,
            slug,
            email,
            phone,
          })
          .select()
          .single();

        if (tenantError) {
          console.error("Error creating tenant:", tenantError);
          // If tenant creation fails, we should clean up the user we just created
          // But for now, just return the error
          return new Response(
            JSON.stringify({ error: tenantError.message }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Create tenant limits
        const { error: limitsError } = await supabase
          .from("tenant_limits")
          .insert({
            tenant_id: tenant.id,
            max_branches: limits?.maxBranches ?? 1,
            max_staff_per_branch: limits?.maxStaffPerBranch ?? 5,
            max_members: limits?.maxMembers ?? 500,
            max_trainers: limits?.maxTrainers ?? 10,
            max_monthly_whatsapp_messages: limits?.maxMonthlyWhatsAppMessages ?? 100,
            features: limits?.features ?? { analytics: true, whatsapp: true, daily_pass: true },
          });

        if (limitsError) {
          console.error("Error creating tenant limits:", limitsError);
        }

        // Add owner as admin in tenant_members (admin = gym owner)
        const { error: memberError } = await supabase
          .from("tenant_members")
          .insert({
            tenant_id: tenant.id,
            user_id: ownerUserId,
            role: "admin",
            is_owner: true,
          });

        if (memberError) {
          console.error("Error adding tenant owner:", memberError);
        }

        // Add admin role to user_roles for RLS policy checks
        // Role hierarchy: super_admin (SaaS owner) > admin (gym owner)
        const { error: roleError } = await supabase
          .from("user_roles")
          .insert({
            user_id: ownerUserId,
            role: "admin",
          });

        if (roleError) {
          console.error("Error adding admin role:", roleError);
        }

        // Create default branch for the tenant
        const { data: defaultBranch, error: branchError } = await supabase
          .from("branches")
          .insert({
            tenant_id: tenant.id,
            name: `${name} - Main`,
            is_default: true,
            is_active: true,
          })
          .select()
          .single();

        if (branchError) {
          console.error("Error creating default branch:", branchError);
        } else {
          console.log(`Created default branch: ${defaultBranch.id}`);
          
          // Create default gym_settings for the branch
          const { error: settingsError } = await supabase
            .from("gym_settings")
            .insert({
              branch_id: defaultBranch.id,
              gym_name: name,
              gym_phone: phone,
              monthly_fee: 500,
              joining_fee: 200,
            });

          if (settingsError) {
            console.error("Error creating gym settings:", settingsError);
          }
        }

        // Create billing info placeholder
        const { error: billingError } = await supabase
          .from("tenant_billing_info")
          .insert({
            tenant_id: tenant.id,
            billing_email: email || ownerEmail,
            billing_name: name,
          });

        if (billingError) {
          console.error("Error creating billing info:", billingError);
        }

        // Log platform audit
        await supabase.from("platform_audit_logs").insert({
          actor_user_id: userId,
          action_type: "tenant_created",
          target_tenant_id: tenant.id,
          target_user_id: ownerUserId,
          description: `Created tenant "${name}" with owner ${ownerEmail}`,
          new_value: { tenant, limits, ownerEmail },
        });

        console.log(`Tenant created: ${tenant.id} (${name}) with owner ${ownerEmail}`);

        return new Response(
          JSON.stringify({ 
            data: tenant,
            owner: { id: ownerUserId, email: ownerEmail },
            branch: defaultBranch,
          }),
          { status: 201, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "update-tenant-limits": {
        if (!isSuperAdmin) {
          return new Response(
            JSON.stringify({ error: "Unauthorized: Super admin access required" }),
            { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const { tenantId, ...newLimits } = body;

        if (!tenantId) {
          return new Response(
            JSON.stringify({ error: "Missing tenantId" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Get current limits for audit
        const { data: oldLimits } = await supabase
          .from("tenant_limits")
          .select("*")
          .eq("tenant_id", tenantId)
          .single();

        const updateData: Record<string, unknown> = {};
        if (newLimits.maxBranches !== undefined) updateData.max_branches = newLimits.maxBranches;
        if (newLimits.maxStaffPerBranch !== undefined) updateData.max_staff_per_branch = newLimits.maxStaffPerBranch;
        if (newLimits.maxMembers !== undefined) updateData.max_members = newLimits.maxMembers;
        if (newLimits.maxTrainers !== undefined) updateData.max_trainers = newLimits.maxTrainers;
        if (newLimits.maxMonthlyWhatsAppMessages !== undefined) updateData.max_monthly_whatsapp_messages = newLimits.maxMonthlyWhatsAppMessages;
        if (newLimits.features !== undefined) updateData.features = newLimits.features;

        const { data: updatedLimits, error } = await supabase
          .from("tenant_limits")
          .update(updateData)
          .eq("tenant_id", tenantId)
          .select()
          .single();

        if (error) {
          return new Response(
            JSON.stringify({ error: error.message }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Log platform audit
        await supabase.from("platform_audit_logs").insert({
          actor_user_id: userId,
          action_type: "limits_updated",
          target_tenant_id: tenantId,
          description: `Updated limits for tenant`,
          old_value: oldLimits,
          new_value: updatedLimits,
        });

        return new Response(
          JSON.stringify({ data: updatedLimits }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "suspend-tenant": {
        if (!isSuperAdmin) {
          return new Response(
            JSON.stringify({ error: "Unauthorized: Super admin access required" }),
            { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const { tenantId, suspend } = body;

        const { data: tenant, error } = await supabase
          .from("tenants")
          .update({ is_active: !suspend })
          .eq("id", tenantId)
          .select()
          .single();

        if (error) {
          return new Response(
            JSON.stringify({ error: error.message }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        await supabase.from("platform_audit_logs").insert({
          actor_user_id: userId,
          action_type: suspend ? "tenant_suspended" : "tenant_activated",
          target_tenant_id: tenantId,
          description: suspend ? "Suspended tenant" : "Activated tenant",
        });

        return new Response(
          JSON.stringify({ data: tenant }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "list-tenants": {
        if (!isSuperAdmin) {
          return new Response(
            JSON.stringify({ error: "Unauthorized: Super admin access required" }),
            { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const { data: tenants, error } = await supabase
          .from("tenants")
          .select(`
            *,
            tenant_limits(*),
            tenant_billing_info(*)
          `)
          .is("deleted_at", null)
          .order("created_at", { ascending: false });

        if (error) {
          return new Response(
            JSON.stringify({ error: error.message }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        return new Response(
          JSON.stringify({ data: tenants }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "get-tenant-usage": {
        const { tenantId } = body;

        // Check if user has access to this tenant
        if (!isSuperAdmin && userId) {
          const { data: membership } = await supabase
            .from("tenant_members")
            .select("id")
            .eq("tenant_id", tenantId)
            .eq("user_id", userId)
            .maybeSingle();

          if (!membership) {
            return new Response(
              JSON.stringify({ error: "Unauthorized: No access to this tenant" }),
              { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }
        }

        const { data: usage, error } = await supabase
          .rpc("get_tenant_current_usage", { _tenant_id: tenantId });

        if (error) {
          return new Response(
            JSON.stringify({ error: error.message }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const { data: limits } = await supabase
          .from("tenant_limits")
          .select("*")
          .eq("tenant_id", tenantId)
          .single();

        return new Response(
          JSON.stringify({ data: { usage: usage[0], limits } }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // ========================================
      // LIMIT ENFORCEMENT (Called from other edge functions)
      // ========================================
      case "check-limit": {
        const { tenantId, resourceType } = body as LimitCheckRequest;

        if (!tenantId || !resourceType) {
          return new Response(
            JSON.stringify({ error: "Missing tenantId or resourceType" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Check if tenant is active
        const { data: tenant } = await supabase
          .from("tenants")
          .select("is_active")
          .eq("id", tenantId)
          .single();

        if (!tenant?.is_active) {
          return new Response(
            JSON.stringify({ allowed: false, reason: "Tenant is suspended" }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const { data: canAdd } = await supabase
          .rpc("tenant_can_add_resource", { 
            _tenant_id: tenantId, 
            _resource_type: resourceType 
          });

        if (!canAdd) {
          return new Response(
            JSON.stringify({ 
              allowed: false, 
              reason: `${resourceType} limit reached for this tenant` 
            }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        return new Response(
          JSON.stringify({ allowed: true }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "increment-usage": {
        const { tenantId, resourceType, count = 1 } = body as UsageUpdateRequest;

        if (!tenantId || !resourceType) {
          return new Response(
            JSON.stringify({ error: "Missing tenantId or resourceType" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        if (resourceType === "whatsapp") {
          const { data } = await supabase
            .rpc("increment_whatsapp_usage", { 
              _tenant_id: tenantId, 
              _count: count 
            });

          return new Response(
            JSON.stringify({ success: data }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        return new Response(
          JSON.stringify({ error: "Unsupported resource type for increment" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // ========================================
      // PLATFORM AUDIT LOGS
      // ========================================
      case "get-platform-logs": {
        if (!isSuperAdmin) {
          return new Response(
            JSON.stringify({ error: "Unauthorized: Super admin access required" }),
            { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const limit = body.limit || 100;
        const offset = body.offset || 0;

        const { data: logs, error } = await supabase
          .from("platform_audit_logs")
          .select("*")
          .order("created_at", { ascending: false })
          .range(offset, offset + limit - 1);

        if (error) {
          return new Response(
            JSON.stringify({ error: error.message }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        return new Response(
          JSON.stringify({ data: logs }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      default:
        return new Response(
          JSON.stringify({ error: `Unknown action: ${action}` }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }
  } catch (error) {
    console.error("Tenant operations error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
