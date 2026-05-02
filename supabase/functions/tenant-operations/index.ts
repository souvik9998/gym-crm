import { createClient } from "npm:@supabase/supabase-js@2";
import { enforceRateLimit } from "../_shared/rate-limit.ts";
import {
  parseAndValidateBody,
  handleSecurityError,
  validateInput,
  validationErrorResponse,
  CreateTenantSchema,
  OwnerCreateBranchSchema,
  UpdateTenantLimitsSchema,
  SuspendTenantSchema,
  UUIDSchema,
} from "../_shared/validation.ts";

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
    maxMonthlyCheckins?: number;
    maxStorageMb?: number;
    planExpiryDate?: string | null;
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

  // Rate limit: 5 requests per 5 minutes per IP (tenant ops are high-cost)
  const rateLimited = enforceRateLimit(req, "tenant-ops", 5, 300, corsHeaders);
  if (rateLimited) return rateLimited;

  try {
    const url = new URL(req.url);
    const action = url.searchParams.get("action");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Parse request body with size limit and injection scanning
    let body: Record<string, unknown> = {};
    try {
      body = await parseAndValidateBody(req);
    } catch (securityError) {
      const secResponse = handleSecurityError(securityError, corsHeaders);
      if (secResponse) return secResponse;
      throw securityError;
    }

    // Get auth token for user verification
    const authHeader = req.headers.get("Authorization");
    let userId: string | null = null;
    let isSuperAdmin = false;
    let isGymOwner = false;

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

        // Check if user is gym owner (admin role)
        const { data: gymOwnerRole } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", userId)
          .eq("role", "admin")
          .maybeSingle();
        isGymOwner = !!gymOwnerRole;
      }
    }

    switch (action) {
      // ========================================
      // GYM OWNER ACTIONS
      // ========================================
      case "owner-create-branch": {
        if (!userId || !isGymOwner) {
          return new Response(
            JSON.stringify({ error: "Unauthorized: Gym owner access required" }),
            { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const branchValidation = validateInput(OwnerCreateBranchSchema, body);
        if (!branchValidation.success) {
          return validationErrorResponse(branchValidation.error!, corsHeaders, branchValidation.details);
        }

        const { name, address, phone, email, isDefault } = branchValidation.data!;

        // Resolve tenant from membership (owner/admin)
        const { data: membership, error: membershipError } = await supabase
          .from("tenant_members")
          .select("tenant_id, role, is_owner")
          .eq("user_id", userId)
          .in("role", ["admin", "tenant_admin"])
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (membershipError) {
          return new Response(
            JSON.stringify({ error: membershipError.message }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        if (!membership?.tenant_id) {
          return new Response(
            JSON.stringify({ error: "No organization found for this user" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const tenantId = membership.tenant_id;

        // Check tenant is active
        const { data: tenant } = await supabase
          .from("tenants")
          .select("is_active")
          .eq("id", tenantId)
          .single();

        if (!tenant?.is_active) {
          return new Response(
            JSON.stringify({ error: "Organization is suspended" }),
            { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Enforce branch limit
        const { data: canAdd } = await supabase
          .rpc("tenant_can_add_resource", {
            _tenant_id: tenantId,
            _resource_type: "branch",
          });

        if (!canAdd) {
          return new Response(
            JSON.stringify({ error: "Branch limit reached for this organization" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Create branch
        const { data: branch, error: branchError } = await supabase
          .from("branches")
          .insert({
            tenant_id: tenantId,
            name: name.trim(),
            address: address?.trim() || null,
            phone: phone?.trim() || null,
            email: email?.trim() || null,
            is_default: isDefault || false,
            is_active: true,
          })
          .select()
          .single();

        if (branchError) {
          return new Response(
            JSON.stringify({ error: branchError.message }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Create gym_settings for the new branch
        await supabase.from("gym_settings").insert({
          branch_id: branch.id,
          gym_name: name.trim(),
          gym_phone: phone?.trim() || null,
          gym_address: address?.trim() || null,
          whatsapp_enabled: false,
        });

        return new Response(
          JSON.stringify({ data: branch }),
          { status: 201, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

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

        const tenantValidation = validateInput(CreateTenantSchema, body);
        if (!tenantValidation.success) {
          return validationErrorResponse(tenantValidation.error!, corsHeaders, tenantValidation.details);
        }

        const { name, slug, email, phone, ownerEmail, ownerPassword, limits } = tenantValidation.data!;
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
            max_monthly_checkins: limits?.maxMonthlyCheckins ?? 10000,
            max_storage_mb: limits?.maxStorageMb ?? 500,
            plan_expiry_date: limits?.planExpiryDate ?? null,
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
      // SUPER ADMIN: CREATE BRANCH FOR TENANT (bypasses limits)
      // ========================================
      case "create-branch": 
      case "superadmin-create-branch": {
        if (!isSuperAdmin) {
          return new Response(
            JSON.stringify({ error: "Unauthorized: Super admin access required" }),
            { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const { tenantId, name, address, phone, email, isDefault, bypassLimits } = body;

        if (!tenantId || !name) {
          return new Response(
            JSON.stringify({ error: "Missing required fields: tenantId and name" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Super admin bypasses limit checks when bypassLimits is true or action is superadmin-create-branch
        const shouldBypass = bypassLimits === true || action === "superadmin-create-branch";
        
        if (!shouldBypass) {
          // Check tenant limit only if not bypassing
          const { data: canAdd } = await supabase
            .rpc("tenant_can_add_resource", { 
              _tenant_id: tenantId, 
              _resource_type: "branch" 
            });

          if (!canAdd) {
            return new Response(
              JSON.stringify({ error: "Branch limit reached for this tenant" }),
              { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }
        }

        // Create the branch
        const { data: branch, error: branchError } = await supabase
          .from("branches")
          .insert({
            tenant_id: tenantId,
            name: name.trim(),
            address: address?.trim() || null,
            phone: phone?.trim() || null,
            email: email?.trim() || null,
            is_default: isDefault || false,
            is_active: true,
          })
          .select()
          .single();

        if (branchError) {
          return new Response(
            JSON.stringify({ error: branchError.message }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Create gym_settings for the new branch
        await supabase.from("gym_settings").insert({
          branch_id: branch.id,
          gym_name: name.trim(),
          gym_phone: phone?.trim() || null,
          gym_address: address?.trim() || null,
          whatsapp_enabled: false,
        });

        // Log the action
        await supabase.from("platform_audit_logs").insert({
          actor_user_id: userId,
          action_type: "branch_created",
          target_tenant_id: tenantId,
          description: `Super admin created branch "${name}" for tenant${shouldBypass ? " (bypassed limits)" : ""}`,
          new_value: { branch, bypassedLimits: shouldBypass },
        });

        return new Response(
          JSON.stringify({ data: branch }),
          { status: 201, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // ========================================
      // SUPER ADMIN: UPDATE BRANCH (bypasses all restrictions)
      // ========================================
      case "superadmin-update-branch": {
        if (!isSuperAdmin) {
          return new Response(
            JSON.stringify({ error: "Unauthorized: Super admin access required" }),
            { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const { branchId, updates } = body;

        if (!branchId) {
          return new Response(
            JSON.stringify({ error: "Missing branchId" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const { data: branch, error } = await supabase
          .from("branches")
          .update({ ...updates, updated_at: new Date().toISOString() })
          .eq("id", branchId)
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
          action_type: "branch_updated",
          target_tenant_id: branch.tenant_id,
          description: `Super admin updated branch "${branch.name}"`,
          new_value: updates,
        });

        return new Response(
          JSON.stringify({ data: branch }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // ========================================
      // SUPER ADMIN: DELETE BRANCH (bypasses all restrictions)
      // ========================================
      case "superadmin-delete-branch": {
        if (!isSuperAdmin) {
          return new Response(
            JSON.stringify({ error: "Unauthorized: Super admin access required" }),
            { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const { branchId, hardDelete } = body;

        if (!branchId) {
          return new Response(
            JSON.stringify({ error: "Missing branchId" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Get branch info for audit log
        const { data: branchInfo } = await supabase
          .from("branches")
          .select("name, tenant_id")
          .eq("id", branchId)
          .single();

        if (hardDelete) {
          // Hard delete - remove completely
          const { error } = await supabase
            .from("branches")
            .delete()
            .eq("id", branchId);

          if (error) {
            return new Response(
              JSON.stringify({ error: error.message }),
              { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }
        } else {
          // Soft delete
          const { error } = await supabase
            .from("branches")
            .update({ 
              deleted_at: new Date().toISOString(), 
              is_active: false,
              updated_at: new Date().toISOString() 
            })
            .eq("id", branchId);

          if (error) {
            return new Response(
              JSON.stringify({ error: error.message }),
              { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }
        }

        await supabase.from("platform_audit_logs").insert({
          actor_user_id: userId,
          action_type: hardDelete ? "branch_hard_deleted" : "branch_deleted",
          target_tenant_id: branchInfo?.tenant_id,
          description: `Super admin ${hardDelete ? "permanently deleted" : "deleted"} branch "${branchInfo?.name}"`,
        });

        return new Response(
          JSON.stringify({ success: true }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // ========================================
      // SUPER ADMIN: TOGGLE FEATURE FOR TENANT
      // ========================================
      case "superadmin-toggle-feature": {
        if (!isSuperAdmin) {
          return new Response(
            JSON.stringify({ error: "Unauthorized: Super admin access required" }),
            { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const { tenantId, feature, enabled } = body;

        if (!tenantId || !feature) {
          return new Response(
            JSON.stringify({ error: "Missing tenantId or feature" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Get current features
        const { data: limits } = await supabase
          .from("tenant_limits")
          .select("features")
          .eq("tenant_id", tenantId)
          .single();

        const currentFeatures = (limits?.features as Record<string, boolean>) || {};
        const updatedFeatures = { ...currentFeatures, [feature]: enabled };

        const { data: updatedLimits, error } = await supabase
          .from("tenant_limits")
          .update({ features: updatedFeatures, updated_at: new Date().toISOString() })
          .eq("tenant_id", tenantId)
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
          action_type: "feature_toggled",
          target_tenant_id: tenantId,
          description: `Super admin ${enabled ? "enabled" : "disabled"} feature "${feature}" for tenant`,
          old_value: { [feature]: currentFeatures[feature] },
          new_value: { [feature]: enabled },
        });

        return new Response(
          JSON.stringify({ data: updatedLimits }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // ========================================
      // SUPER ADMIN: GET ALL USERS ACROSS TENANTS
      // ========================================
      case "superadmin-list-all-users": {
        if (!isSuperAdmin) {
          return new Response(
            JSON.stringify({ error: "Unauthorized: Super admin access required" }),
            { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const limit = body.limit || 100;
        const offset = body.offset || 0;
        const searchQuery = body.search || "";

        // Get all tenant members with tenant info
        let query = supabase
          .from("tenant_members")
          .select(`
            *,
            tenants!inner(name, slug)
          `)
          .order("created_at", { ascending: false })
          .range(offset, offset + limit - 1);

        const { data: members, error } = await query;

        if (error) {
          return new Response(
            JSON.stringify({ error: error.message }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        return new Response(
          JSON.stringify({ data: members }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // ========================================
      // SUPER ADMIN: MOVE BRANCH TO DIFFERENT TENANT
      // ========================================
      case "superadmin-move-branch": {
        if (!isSuperAdmin) {
          return new Response(
            JSON.stringify({ error: "Unauthorized: Super admin access required" }),
            { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const { branchId, newTenantId } = body;

        if (!branchId || !newTenantId) {
          return new Response(
            JSON.stringify({ error: "Missing branchId or newTenantId" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Get current branch info
        const { data: branch } = await supabase
          .from("branches")
          .select("name, tenant_id")
          .eq("id", branchId)
          .single();

        const oldTenantId = branch?.tenant_id;

        // Move the branch
        const { data: updatedBranch, error } = await supabase
          .from("branches")
          .update({ tenant_id: newTenantId, updated_at: new Date().toISOString() })
          .eq("id", branchId)
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
          action_type: "branch_moved",
          target_tenant_id: newTenantId,
          description: `Super admin moved branch "${branch?.name}" from tenant ${oldTenantId} to ${newTenantId}`,
          old_value: { tenant_id: oldTenantId },
          new_value: { tenant_id: newTenantId },
        });

        return new Response(
          JSON.stringify({ data: updatedBranch }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
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

      // ========================================
      // RAZORPAY CREDENTIAL MANAGEMENT (Super Admin only)
      // ========================================
      case "save-razorpay-credentials": {
        if (!isSuperAdmin) {
          return new Response(
            JSON.stringify({ error: "Unauthorized: Super admin access required" }),
            { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const { tenantId, keyId: rzpKeyId, keySecret: rzpKeySecret } = body;

        if (!tenantId || !rzpKeyId || !rzpKeySecret) {
          return new Response(
            JSON.stringify({ error: "Missing required fields: tenantId, keyId, keySecret" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Validate key format
        if (!rzpKeyId.startsWith("rzp_")) {
          return new Response(
            JSON.stringify({ error: "Invalid Razorpay Key ID format" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Verify credentials by creating a test order
        try {
          const testResponse = await fetch("https://api.razorpay.com/v1/orders", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Basic ${btoa(`${rzpKeyId}:${rzpKeySecret}`)}`,
            },
            body: JSON.stringify({
              amount: 100, // 1 rupee in paise
              currency: "INR",
              receipt: `test_${Date.now()}`,
              notes: { purpose: "credential_verification" },
            }),
          });

          if (!testResponse.ok) {
            const errorText = await testResponse.text();
            console.error("Razorpay verification failed:", errorText);
            return new Response(
              JSON.stringify({ error: "Invalid Razorpay credentials - verification failed" }),
              { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }

          console.log("Razorpay credentials verified successfully");
        } catch (err) {
          console.error("Razorpay verification error:", err);
          return new Response(
            JSON.stringify({ error: "Failed to verify Razorpay credentials" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Encrypt the key secret
        const encryptionKey = Deno.env.get("RAZORPAY_ENCRYPTION_KEY");
        if (!encryptionKey) {
          return new Response(
            JSON.stringify({ error: "Encryption not configured" }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Import encryption module dynamically
        const { encrypt } = await import("../_shared/encryption.ts");
        const { ciphertext, iv } = await encrypt(rzpKeySecret, encryptionKey);

        // Upsert credentials
        const { error: upsertError } = await supabase
          .from("razorpay_credentials")
          .upsert({
            tenant_id: tenantId,
            key_id: rzpKeyId,
            encrypted_key_secret: ciphertext,
            encryption_iv: iv,
            is_verified: true,
            verified_at: new Date().toISOString(),
            created_by: userId,
          }, { onConflict: "tenant_id" });

        if (upsertError) {
          console.error("Error saving credentials:", upsertError);
          return new Response(
            JSON.stringify({ error: "Failed to save credentials" }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Audit log (never log the secret)
        await supabase.from("platform_audit_logs").insert({
          actor_user_id: userId,
          action_type: "razorpay_credentials_saved",
          target_tenant_id: tenantId,
          description: `Super admin configured Razorpay credentials (Key ID: ${rzpKeyId.substring(0, 8)}****)`,
        });

        return new Response(
          JSON.stringify({ data: { success: true, isConnected: true } }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "get-razorpay-status": {
        if (!isSuperAdmin) {
          return new Response(
            JSON.stringify({ error: "Unauthorized: Super admin access required" }),
            { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const { tenantId } = body;
        if (!tenantId) {
          return new Response(
            JSON.stringify({ error: "Missing tenantId" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const { data: creds } = await supabase
          .from("razorpay_credentials")
          .select("key_id, is_verified, verified_at")
          .eq("tenant_id", tenantId)
          .maybeSingle();

        if (!creds) {
          return new Response(
            JSON.stringify({ data: { isConnected: false, maskedKeyId: null, isVerified: false, verifiedAt: null } }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Mask key_id: show first 8 and last 4 chars
        const maskedKeyId = creds.key_id.length > 12
          ? `${creds.key_id.substring(0, 8)}****${creds.key_id.slice(-4)}`
          : `${creds.key_id.substring(0, 4)}****`;

        return new Response(
          JSON.stringify({
            data: {
              isConnected: true,
              maskedKeyId,
              isVerified: creds.is_verified,
              verifiedAt: creds.verified_at,
            },
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "remove-razorpay-credentials": {
        if (!isSuperAdmin) {
          return new Response(
            JSON.stringify({ error: "Unauthorized: Super admin access required" }),
            { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const { tenantId } = body;
        if (!tenantId) {
          return new Response(
            JSON.stringify({ error: "Missing tenantId" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const { error: deleteError } = await supabase
          .from("razorpay_credentials")
          .delete()
          .eq("tenant_id", tenantId);

        if (deleteError) {
          return new Response(
            JSON.stringify({ error: "Failed to remove credentials" }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        await supabase.from("platform_audit_logs").insert({
          actor_user_id: userId,
          action_type: "razorpay_credentials_removed",
          target_tenant_id: tenantId,
          description: "Super admin removed Razorpay credentials",
        });

        return new Response(
          JSON.stringify({ data: { success: true } }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "get-messaging-config": {
        if (!isSuperAdmin) {
          return new Response(
            JSON.stringify({ error: "Unauthorized: Super admin access required" }),
            { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        const { tenantId } = body as { tenantId?: string };
        if (!tenantId) {
          return new Response(
            JSON.stringify({ error: "Missing tenantId" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const { data: cfg } = await supabase
          .from("tenant_messaging_config")
          .select(
            "active_provider, periskope_api_key_encrypted, periskope_phone, periskope_verified_at, " +
              "zavu_api_key_encrypted, zavu_sender_id, zavu_verified_at, zavu_templates, promotional_templates"
          )
          .eq("tenant_id", tenantId)
          .maybeSingle();

        const periskopeConnected = !!cfg?.periskope_api_key_encrypted;
        const zavuConnected = !!cfg?.zavu_api_key_encrypted;

        return new Response(
          JSON.stringify({
            data: {
              active_provider: cfg?.active_provider ?? "periskope",
              periskope: {
                connected: periskopeConnected,
                phone: cfg?.periskope_phone ?? null,
                verified_at: cfg?.periskope_verified_at ?? null,
              },
              zavu: {
                connected: zavuConnected,
                sender_id: cfg?.zavu_sender_id ?? null,
                verified_at: cfg?.zavu_verified_at ?? null,
              },
              zavu_templates: (cfg?.zavu_templates as Record<string, string>) ?? {},
              promotional_templates: Array.isArray(cfg?.promotional_templates)
                ? (cfg!.promotional_templates as unknown[])
                : [],
            },
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "get-promotional-templates": {
        const { branchId } = body as { branchId?: string };
        if (!userId || !branchId) {
          return new Response(
            JSON.stringify({ error: "Missing branch or user session" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const { data: branch } = await supabase
          .from("branches")
          .select("tenant_id")
          .eq("id", branchId)
          .maybeSingle();
        if (!branch?.tenant_id) {
          return new Response(
            JSON.stringify({ error: "Branch not found" }),
            { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const tenantIdForAuth = branch.tenant_id as string;
        let authorized = isSuperAdmin;
        if (!authorized) {
          const { data: isAdminTenant } = await supabase.rpc("is_tenant_admin", {
            _user_id: userId,
            _tenant_id: tenantIdForAuth,
          });
          authorized = !!isAdminTenant;
        }
        if (!authorized) {
          const { data: staffSettingsPerm } = await supabase
            .from("staff")
            .select("id, staff_branch_assignments!inner(branch_id), staff_permissions(can_change_settings)")
            .eq("auth_user_id", userId)
            .eq("is_active", true)
            .eq("staff_branch_assignments.branch_id", branchId)
            .maybeSingle();
          authorized = (staffSettingsPerm as any)?.staff_permissions?.can_change_settings === true;
        }

        if (!authorized) {
          return new Response(
            JSON.stringify({ error: "Unauthorized" }),
            { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const [{ data: cfg }, { data: settings }] = await Promise.all([
          supabase
            .from("tenant_messaging_config")
            .select("promotional_templates")
            .eq("tenant_id", branch.tenant_id)
            .maybeSingle(),
          supabase
            .from("gym_settings")
            .select("active_promotional_slot")
            .eq("branch_id", branchId)
            .maybeSingle(),
        ]);

        const promotionalTemplates = Array.isArray(cfg?.promotional_templates)
          ? (cfg!.promotional_templates as unknown[])
          : [];

        return new Response(
          JSON.stringify({
            data: {
              promotional_templates: promotionalTemplates,
              active_promotional_slot: settings?.active_promotional_slot ?? null,
            },
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "set-active-promotional-slot": {
        const { branchId, activeSlot } = body as { branchId?: string; activeSlot?: number | null };
        if (!userId || !branchId) {
          return new Response(
            JSON.stringify({ error: "Missing branch or user session" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        const nextSlot = activeSlot == null ? null : Number(activeSlot);
        if (nextSlot !== null && (!Number.isInteger(nextSlot) || nextSlot < 1 || nextSlot > 4)) {
          return new Response(
            JSON.stringify({ error: "Invalid promotional template slot" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const { data: hasBranchAccess } = await supabase.rpc("user_has_branch_access", {
          _user_id: userId,
          _branch_id: branchId,
        });
        if (!isSuperAdmin && !hasBranchAccess) {
          return new Response(
            JSON.stringify({ error: "Unauthorized" }),
            { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        if (nextSlot !== null) {
          const { data: tenantId } = await supabase.rpc("get_tenant_from_branch", { _branch_id: branchId });
          const { data: cfg } = await supabase
            .from("tenant_messaging_config")
            .select("promotional_templates")
            .eq("tenant_id", tenantId)
            .maybeSingle();
          const configured = (Array.isArray(cfg?.promotional_templates) ? cfg!.promotional_templates : []).some(
            (t: any) => Number(t?.slot) === nextSlot && typeof t?.templateId === "string" && t.templateId.trim().length > 0,
          );
          if (!configured) {
            return new Response(
              JSON.stringify({ error: "Selected promotional template is not configured" }),
              { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }
        }

        const { data: existing } = await supabase
          .from("gym_settings")
          .select("id")
          .eq("branch_id", branchId)
          .maybeSingle();
        const { error } = existing?.id
          ? await supabase.from("gym_settings").update({ active_promotional_slot: nextSlot }).eq("id", existing.id)
          : await supabase.from("gym_settings").insert({ branch_id: branchId, active_promotional_slot: nextSlot });
        if (error) {
          return new Response(
            JSON.stringify({ error: "Failed to save promotional template selection" }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        return new Response(
          JSON.stringify({ data: { success: true, active_promotional_slot: nextSlot } }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "save-messaging-config": {
        if (!isSuperAdmin) {
          return new Response(
            JSON.stringify({ error: "Unauthorized: Super admin access required" }),
            { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const {
          tenantId,
          active_provider,
          periskope,
          zavu,
          zavu_templates,
          promotional_templates,
        } = body as {
          tenantId?: string;
          active_provider?: "periskope" | "zavu" | "none";
          periskope?: { apiKey?: string; phone?: string };
          zavu?: { apiKey?: string; senderId?: string };
          zavu_templates?: Record<string, string>;
          promotional_templates?: Array<{
            slot: number;
            enabled?: boolean;
            name?: string;
            templateId?: string;
            description?: string;
            variables?: Array<{ key: string; description?: string }>;
            previewBody?: string;
          }>;
        };

        if (!tenantId) {
          return new Response(
            JSON.stringify({ error: "Missing tenantId" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const encryptionKey = Deno.env.get("RAZORPAY_ENCRYPTION_KEY");
        if (!encryptionKey) {
          return new Response(
            JSON.stringify({ error: "Encryption not configured" }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const { encrypt } = await import("../_shared/encryption.ts");
        const { verifyPeriskopeCredentials, verifyZavuCredentials } = await import(
          "../_shared/whatsapp-provider.ts"
        );

        const updates: Record<string, unknown> = { tenant_id: tenantId };

        if (typeof active_provider === "string") {
          if (!["periskope", "zavu", "none"].includes(active_provider)) {
            return new Response(
              JSON.stringify({ error: "Invalid active_provider" }),
              { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }
          updates.active_provider = active_provider;
        }

        // Periskope save (with verification)
        if (periskope?.apiKey || typeof periskope?.phone === "string") {
          if (periskope.apiKey) {
            const phoneForVerify = periskope.phone ?? "";
            if (!phoneForVerify) {
              return new Response(
                JSON.stringify({ error: "Periskope phone is required when saving an API key" }),
                { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
              );
            }
            const v = await verifyPeriskopeCredentials(periskope.apiKey, phoneForVerify);
            if (!v.ok) {
              return new Response(
                JSON.stringify({ error: `Periskope verification failed: ${v.error}` }),
                { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
              );
            }
            const enc = await encrypt(periskope.apiKey, encryptionKey);
            updates.periskope_api_key_encrypted = enc.ciphertext;
            updates.periskope_api_key_iv = enc.iv;
            updates.periskope_verified_at = new Date().toISOString();
          }
          if (typeof periskope.phone === "string") {
            updates.periskope_phone = periskope.phone || null;
          }
        }

        // Zavu save (with verification)
        if (zavu?.apiKey || typeof zavu?.senderId === "string") {
          if (zavu.apiKey) {
            const v = await verifyZavuCredentials(zavu.apiKey);
            if (!v.ok) {
              return new Response(
                JSON.stringify({ error: `Zavu verification failed: ${v.error}` }),
                { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
              );
            }
            const enc = await encrypt(zavu.apiKey, encryptionKey);
            updates.zavu_api_key_encrypted = enc.ciphertext;
            updates.zavu_api_key_iv = enc.iv;
            updates.zavu_verified_at = new Date().toISOString();
          }
          if (typeof zavu.senderId === "string") {
            updates.zavu_sender_id = zavu.senderId || null;
          }
        }

        if (zavu_templates && typeof zavu_templates === "object") {
          // Sanitize: only string values
          const cleaned: Record<string, string> = {};
          for (const [k, v] of Object.entries(zavu_templates)) {
            if (typeof v === "string" && v.trim().length > 0) cleaned[k] = v.trim();
          }
          updates.zavu_templates = cleaned;
        }

        if (Array.isArray(promotional_templates)) {
          // Sanitize: keep only slots 1-4, clamp fields, drop empty entries
          const cleaned = promotional_templates
            .filter((t) => t && Number.isInteger(t.slot) && t.slot >= 1 && t.slot <= 4)
            .map((t) => ({
              slot: t.slot,
              enabled: t.enabled !== false,
              name: typeof t.name === "string" ? t.name.trim().slice(0, 80) : "",
              templateId: typeof t.templateId === "string" ? t.templateId.trim().slice(0, 200) : "",
              description: typeof t.description === "string" ? t.description.trim().slice(0, 500) : "",
              previewBody: typeof t.previewBody === "string" ? t.previewBody.slice(0, 2000) : "",
              variables: Array.isArray(t.variables)
                ? t.variables
                    .filter((v) => v && typeof v.key === "string" && v.key.trim().length > 0)
                    .slice(0, 12)
                    .map((v) => ({
                      key: v.key.trim().slice(0, 60),
                      description: typeof v.description === "string" ? v.description.trim().slice(0, 200) : "",
                    }))
                : [],
            }));
          updates.promotional_templates = cleaned;
        }

        const { error: upsertError } = await supabase
          .from("tenant_messaging_config")
          .upsert(updates, { onConflict: "tenant_id" });

        if (upsertError) {
          console.error("Save messaging config failed:", upsertError);
          return new Response(
            JSON.stringify({ error: "Failed to save messaging config" }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        await supabase.from("platform_audit_logs").insert({
          actor_user_id: userId,
          action_type: "messaging_config_saved",
          target_tenant_id: tenantId,
          description: `Super admin updated messaging config (provider=${active_provider ?? "unchanged"})`,
        });

        return new Response(
          JSON.stringify({ data: { success: true } }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "remove-messaging-credentials": {
        if (!isSuperAdmin) {
          return new Response(
            JSON.stringify({ error: "Unauthorized: Super admin access required" }),
            { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        const { tenantId, provider } = body as {
          tenantId?: string;
          provider?: "periskope" | "zavu";
        };
        if (!tenantId || !provider) {
          return new Response(
            JSON.stringify({ error: "Missing tenantId or provider" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        const updates: Record<string, unknown> =
          provider === "periskope"
            ? {
                periskope_api_key_encrypted: null,
                periskope_api_key_iv: null,
                periskope_phone: null,
                periskope_verified_at: null,
              }
            : {
                zavu_api_key_encrypted: null,
                zavu_api_key_iv: null,
                zavu_sender_id: null,
                zavu_verified_at: null,
              };
        const { error } = await supabase
          .from("tenant_messaging_config")
          .update(updates)
          .eq("tenant_id", tenantId);
        if (error) {
          return new Response(
            JSON.stringify({ error: "Failed to remove credentials" }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        await supabase.from("platform_audit_logs").insert({
          actor_user_id: userId,
          action_type: "messaging_credentials_removed",
          target_tenant_id: tenantId,
          description: `Super admin removed ${provider} credentials`,
        });
        return new Response(
          JSON.stringify({ data: { success: true } }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "test-messaging": {
        if (!isSuperAdmin) {
          return new Response(
            JSON.stringify({ error: "Unauthorized: Super admin access required" }),
            { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        const { tenantId, toPhone, category } = body as {
          tenantId?: string;
          toPhone?: string;
          category?: string;
        };
        if (!tenantId || !toPhone) {
          return new Response(
            JSON.stringify({ error: "Missing tenantId or toPhone" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const { sendWhatsAppForTenant } = await import("../_shared/whatsapp-provider.ts");
        const result = await sendWhatsAppForTenant(supabase, {
          toPhone: toPhone.replace(/\D/g, ""),
          category: (category as never) ?? "promotional",
          variables: {
            name: "GymKloud Test",
            branch_name: "GymKloud",
            expiry_date: new Date().toLocaleDateString("en-IN"),
          },
          fallbackText:
            "✅ This is a test WhatsApp message from GymKloud. If you received this, your messaging provider is configured correctly.",
          tenantId,
        });

        return new Response(
          JSON.stringify({ data: result }),
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
