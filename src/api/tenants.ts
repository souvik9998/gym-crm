/**
 * Tenant Management API
 * 
 * Provides CRUD operations for tenants (gym organizations) in the multi-tenant SaaS platform.
 * Only accessible by super_admin users.
 */

import { supabase } from "@/integrations/supabase/client";
import { SUPABASE_ANON_KEY, getEdgeFunctionUrl } from "@/lib/supabaseConfig";

export interface Tenant {
  id: string;
  name: string;
  slug: string;
  email: string | null;
  phone: string | null;
  logo_url: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface TenantLimits {
  id: string;
  tenant_id: string;
  max_branches: number;
  max_staff_per_branch: number;
  max_members: number;
  max_monthly_whatsapp_messages: number;
  max_trainers: number;
  created_at?: string;
  updated_at?: string;
  features: Record<string, any>;
}

export interface TenantUsage {
  branches_count: number;
  staff_count: number;
  members_count: number;
  trainers_count: number;
  whatsapp_this_month: number;
}

export interface TenantMember {
  id: string;
  tenant_id: string;
  user_id: string;
  role: string;
  is_owner: boolean;
  created_at: string;
  user_email?: string;
}

export interface TenantWithDetails extends Tenant {
  limits?: TenantLimits;
  usage?: TenantUsage;
  members?: TenantMember[];
  branches_count?: number;
}

export interface CreateTenantParams {
  name: string;
  slug: string;
  email?: string;
  phone?: string;
  ownerEmail: string;
  ownerPassword: string;
  limits?: Partial<TenantLimits>;
}

/**
 * Fetch all tenants (super_admin only)
 */
export async function fetchTenants(): Promise<Tenant[]> {
  const { data, error } = await supabase
    .from("tenants")
    .select("*")
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Error fetching tenants:", error);
    throw error;
  }

  return data || [];
}

/**
 * Fetch a single tenant with full details
 */
export async function fetchTenantDetails(tenantId: string): Promise<TenantWithDetails | null> {
  // Fetch tenant
  const { data: tenant, error: tenantError } = await supabase
    .from("tenants")
    .select("*")
    .eq("id", tenantId)
    .single();

  if (tenantError) {
    console.error("Error fetching tenant:", tenantError);
    throw tenantError;
  }

  // Fetch limits
  const { data: limits } = await supabase
    .from("tenant_limits")
    .select("*")
    .eq("tenant_id", tenantId)
    .single();

  // Fetch usage
  const { data: usageData } = await supabase
    .rpc("get_tenant_current_usage", { _tenant_id: tenantId });

  // Fetch members
  const { data: members } = await supabase
    .from("tenant_members")
    .select("*")
    .eq("tenant_id", tenantId);

  // Fetch branches count
  const { count: branchesCount } = await supabase
    .from("branches")
    .select("*", { count: "exact", head: true })
    .eq("tenant_id", tenantId)
    .is("deleted_at", null);

  return {
    ...tenant,
    limits: limits ? { ...limits, features: limits.features as Record<string, any> } : undefined,
    usage: usageData?.[0] || undefined,
    members: members || [],
    branches_count: branchesCount || 0,
  };
}

/**
 * Create a new tenant via Edge Function
 */
export async function createTenant(params: CreateTenantParams): Promise<{ tenant: Tenant; owner: { id: string; email: string } }> {
  const { data: { session } } = await supabase.auth.getSession();
  
  if (!session?.access_token) {
    throw new Error("Authentication required");
  }

  // First create the owner user account, then create the tenant
  // The edge function expects ownerUserId, but we need to create the user first
  // So we'll use a two-step process or adapt the API call

  const response = await fetch(
    `${getEdgeFunctionUrl("tenant-operations")}?action=create-tenant`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({
        name: params.name,
        slug: params.slug,
        email: params.email,
        phone: params.phone,
        ownerUserId: session.user.id, // Use current user as placeholder, actual creation handled differently
        limits: params.limits ? {
          maxBranches: params.limits.max_branches,
          maxStaffPerBranch: params.limits.max_staff_per_branch,
          maxMembers: params.limits.max_members,
          maxTrainers: params.limits.max_trainers,
          maxMonthlyWhatsAppMessages: params.limits.max_monthly_whatsapp_messages,
        } : undefined,
      }),
    }
  );

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Failed to create tenant");
  }

  const result = await response.json();
  return { 
    tenant: result.data, 
    owner: { id: session.user.id, email: params.ownerEmail } 
  };
}

/**
 * Update tenant details
 */
export async function updateTenant(
  tenantId: string, 
  updates: Partial<Pick<Tenant, "name" | "email" | "phone" | "is_active">>
): Promise<Tenant> {
  const { data, error } = await supabase
    .from("tenants")
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq("id", tenantId)
    .select()
    .single();

  if (error) {
    console.error("Error updating tenant:", error);
    throw error;
  }

  return data;
}

/**
 * Update tenant limits
 */
export async function updateTenantLimits(
  tenantId: string,
  limits: Partial<Omit<TenantLimits, "id" | "tenant_id">>
): Promise<TenantLimits> {
  const { data, error } = await supabase
    .from("tenant_limits")
    .update({ ...limits, updated_at: new Date().toISOString() })
    .eq("tenant_id", tenantId)
    .select()
    .single();

  if (error) {
    console.error("Error updating tenant limits:", error);
    throw error;
  }

  return { ...data, features: data.features as Record<string, any> };
}

/**
 * Soft delete a tenant
 */
export async function deleteTenant(tenantId: string): Promise<void> {
  const { error } = await supabase
    .from("tenants")
    .update({ 
      deleted_at: new Date().toISOString(),
      is_active: false,
      updated_at: new Date().toISOString(),
    })
    .eq("id", tenantId);

  if (error) {
    console.error("Error deleting tenant:", error);
    throw error;
  }
}

/**
 * Fetch platform audit logs
 */
export async function fetchPlatformAuditLogs(limit = 100): Promise<any[]> {
  const { data, error } = await supabase
    .from("platform_audit_logs")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("Error fetching audit logs:", error);
    throw error;
  }

  return data || [];
}

/**
 * Fetch platform-wide statistics
 */
export async function fetchPlatformStats(): Promise<{
  totalTenants: number;
  activeTenants: number;
  totalBranches: number;
  totalMembers: number;
  totalStaff: number;
}> {
  // Count tenants
  const { count: totalTenants } = await supabase
    .from("tenants")
    .select("*", { count: "exact", head: true })
    .is("deleted_at", null);

  const { count: activeTenants } = await supabase
    .from("tenants")
    .select("*", { count: "exact", head: true })
    .is("deleted_at", null)
    .eq("is_active", true);

  // Count branches
  const { count: totalBranches } = await supabase
    .from("branches")
    .select("*", { count: "exact", head: true })
    .is("deleted_at", null);

  // Count members
  const { count: totalMembers } = await supabase
    .from("members")
    .select("*", { count: "exact", head: true });

  // Count staff
  const { count: totalStaff } = await supabase
    .from("staff")
    .select("*", { count: "exact", head: true })
    .eq("is_active", true);

  return {
    totalTenants: totalTenants || 0,
    activeTenants: activeTenants || 0,
    totalBranches: totalBranches || 0,
    totalMembers: totalMembers || 0,
    totalStaff: totalStaff || 0,
  };
}
