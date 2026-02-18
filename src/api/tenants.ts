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
  max_monthly_checkins: number;
  max_storage_mb: number;
  plan_expiry_date: string | null;
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
  monthly_checkins: number;
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
        ownerEmail: params.ownerEmail,
        ownerPassword: params.ownerPassword,
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
    owner: result.owner || { id: "", email: params.ownerEmail } 
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
 * Create a branch for a specific tenant (super_admin only)
 */
export async function createBranchForTenant(params: {
  tenantId: string;
  name: string;
  address?: string;
  phone?: string;
  email?: string;
  isDefault?: boolean;
}): Promise<any> {
  const { data: { session } } = await supabase.auth.getSession();
  
  if (!session?.access_token) {
    throw new Error("Authentication required");
  }

  const response = await fetch(
    `${getEdgeFunctionUrl("tenant-operations")}?action=create-branch`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({
        tenantId: params.tenantId,
        name: params.name,
        address: params.address,
        phone: params.phone,
        email: params.email,
        isDefault: params.isDefault,
      }),
    }
  );

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Failed to create branch");
  }

  const result = await response.json();
  return result.data;
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

  // Count staff - using staff_branch_assignments to get unique staff
  const { data: staffData } = await supabase
    .from("staff")
    .select("id")
    .eq("is_active", true);

  const totalStaff = staffData?.length || 0;

  return {
    totalTenants: totalTenants || 0,
    activeTenants: activeTenants || 0,
    totalBranches: totalBranches || 0,
    totalMembers: totalMembers || 0,
    totalStaff,
  };
}

/**
 * Fetch platform stats filtered by tenant and/or branch
 */
export async function fetchFilteredPlatformStats(tenantId?: string, branchId?: string): Promise<{
  totalMembers: number;
  activeMembers: number;
  totalStaff: number;
  totalBranches: number;
  monthlyRevenue: number;
}> {
  let branchIds: string[] = [];

  if (branchId) {
    branchIds = [branchId];
  } else if (tenantId) {
    // Get all branches for this tenant
    const { data: branches } = await supabase
      .from("branches")
      .select("id")
      .eq("tenant_id", tenantId)
      .is("deleted_at", null);
    branchIds = branches?.map(b => b.id) || [];
  }

  // Count members
  let membersQuery = supabase.from("members").select("*", { count: "exact", head: true });
  if (branchIds.length > 0) {
    membersQuery = membersQuery.in("branch_id", branchIds);
  }
  const { count: totalMembers } = await membersQuery;

  // Count active members (with active subscriptions)
  let activeSubsQuery = supabase
    .from("subscriptions")
    .select("member_id")
    .in("status", ["active", "expiring_soon"]);
  if (branchIds.length > 0) {
    activeSubsQuery = activeSubsQuery.in("branch_id", branchIds);
  }
  const { data: activeSubsData } = await activeSubsQuery;
  const uniqueActiveMembers = new Set(activeSubsData?.map(s => s.member_id) || []);

  // Count staff
  let staffQuery = supabase
    .from("staff_branch_assignments")
    .select("staff_id, staff!inner(is_active)");
  if (branchIds.length > 0) {
    staffQuery = staffQuery.in("branch_id", branchIds);
  }
  const { data: staffData } = await staffQuery;
  const uniqueStaff = new Set(
    staffData?.filter((s: any) => s.staff?.is_active).map((s: any) => s.staff_id) || []
  );

  // Count branches
  let branchCount = branchIds.length;
  if (!tenantId && !branchId) {
    const { count } = await supabase
      .from("branches")
      .select("*", { count: "exact", head: true })
      .is("deleted_at", null);
    branchCount = count || 0;
  }

  // Monthly revenue
  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  let paymentsQuery = supabase
    .from("payments")
    .select("amount")
    .eq("status", "success")
    .gte("created_at", startOfMonth.toISOString());
  if (branchIds.length > 0) {
    paymentsQuery = paymentsQuery.in("branch_id", branchIds);
  }
  const { data: payments } = await paymentsQuery;
  const monthlyRevenue = payments?.reduce((sum, p) => sum + Number(p.amount), 0) || 0;

  return {
    totalMembers: totalMembers || 0,
    activeMembers: uniqueActiveMembers.size,
    totalStaff: uniqueStaff.size,
    totalBranches: branchCount,
    monthlyRevenue,
  };
}

/**
 * Fetch all branches for super admin (across all tenants or for a specific tenant)
 */
export async function fetchAllBranches(tenantId?: string): Promise<Array<{
  id: string;
  name: string;
  tenant_id: string;
  tenant_name?: string;
  is_active: boolean;
}>> {
  let query = supabase
    .from("branches")
    .select("id, name, tenant_id, is_active, tenants(name)")
    .is("deleted_at", null)
    .order("name");

  if (tenantId) {
    query = query.eq("tenant_id", tenantId);
  }

  const { data, error } = await query;

  if (error) {
    console.error("Error fetching branches:", error);
    throw error;
  }

  return (data || []).map((b: any) => ({
    id: b.id,
    name: b.name,
    tenant_id: b.tenant_id,
    tenant_name: b.tenants?.name,
    is_active: b.is_active,
  }));
}
