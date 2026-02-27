/**
 * Shared Authentication Utilities for Edge Functions
 * 
 * Provides consistent JWT validation and role-based access control
 * across all edge functions. Uses Supabase Auth as the single source of truth.
 * 
 * Security principles:
 * - All auth validation happens server-side in edge functions
 * - Service role is only used AFTER successful authentication
 * - Role checks query database directly (no client-side trust)
 * - Staff permissions are granular and branch-scoped
 */

import { createClient, SupabaseClient } from "npm:@supabase/supabase-js@2";

// ============================================================================
// Types
// ============================================================================

export interface StaffPermissions {
  can_view_members: boolean;
  can_manage_members: boolean;
  can_access_ledger: boolean;
  can_access_payments: boolean;
  can_access_analytics: boolean;
  can_change_settings: boolean;
}

export interface AuthResult {
  valid: boolean;
  userId?: string;
  isAdmin: boolean;
  isSuperAdmin: boolean;
  isStaff: boolean;
  staffId?: string;
  permissions?: StaffPermissions;
  branchIds?: string[];
  tenantId?: string;
  error?: string;
}

export interface AuthClients {
  anonClient: SupabaseClient;
  serviceClient: SupabaseClient;
}

// ============================================================================
// Client Factory
// ============================================================================

/**
 * Create Supabase clients for authentication flow.
 * - anonClient: Used for JWT validation (has user context)
 * - serviceClient: Used for data access after auth (bypasses RLS)
 */
export function createAuthClients(authHeader?: string | null): AuthClients {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceRoleKey) {
    throw new Error("Missing Supabase configuration");
  }

  const anonClient = createClient(supabaseUrl, supabaseAnonKey, {
    global: authHeader ? { headers: { Authorization: authHeader } } : undefined,
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const serviceClient = createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  return { anonClient, serviceClient };
}

// ============================================================================
// JWT Validation
// ============================================================================

/**
 * Validate JWT token and extract user identity.
 * Uses Supabase Auth's getClaims for Lovable Cloud compatibility.
 */
export async function validateJWT(
  anonClient: SupabaseClient,
  authHeader: string | null
): Promise<{ valid: boolean; userId?: string; error?: string }> {
  if (!authHeader?.startsWith("Bearer ")) {
    return { valid: false, error: "Missing or invalid Authorization header" };
  }

  const token = authHeader.replace("Bearer ", "").trim();
  if (!token) {
    return { valid: false, error: "Empty token" };
  }

  try {
    // Use getClaims for Lovable Cloud compatibility
    const { data: claimsData, error: claimsError } = await anonClient.auth.getClaims(token);
    
    if (claimsError || !claimsData?.claims?.sub) {
      console.warn("JWT validation failed:", claimsError?.message);
      return { valid: false, error: claimsError?.message || "Invalid token" };
    }

    return { valid: true, userId: String(claimsData.claims.sub) };
  } catch (error) {
    console.error("JWT validation error:", error);
    return { valid: false, error: "Token validation failed" };
  }
}

// ============================================================================
// Role Checking
// ============================================================================

/**
 * Check if user has admin or super_admin role in user_roles table.
 * Also resolves tenant membership for gym owners.
 */
export async function checkAdminRole(
  serviceClient: SupabaseClient,
  userId: string
): Promise<{ isAdmin: boolean; isSuperAdmin: boolean; tenantId?: string }> {
  // Query user_roles for admin-type roles
  const { data: roles, error: rolesError } = await serviceClient
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .in("role", ["admin", "tenant_admin", "super_admin"]);

  if (rolesError) {
    console.error("Error checking admin roles:", rolesError);
    return { isAdmin: false, isSuperAdmin: false };
  }

  const roleList = (roles || []).map((r: { role: string }) => r.role);
  const isSuperAdmin = roleList.includes("super_admin");
  const isAdmin = roleList.length > 0;

  // If admin (gym owner), resolve tenant membership
  let tenantId: string | undefined;
  if (isAdmin && !isSuperAdmin) {
    const { data: membership } = await serviceClient
      .from("tenant_members")
      .select("tenant_id")
      .eq("user_id", userId)
      .limit(1)
      .maybeSingle();
    
    tenantId = membership?.tenant_id;
  }

  return { isAdmin, isSuperAdmin, tenantId };
}

/**
 * Check if user is staff and get their permissions/branches.
 */
export async function checkStaffAccess(
  serviceClient: SupabaseClient,
  userId: string
): Promise<{
  isStaff: boolean;
  staffId?: string;
  permissions?: StaffPermissions;
  branchIds?: string[];
}> {
  // Find staff record linked to this auth user
  const { data: staffData, error: staffError } = await serviceClient
    .from("staff")
    .select("id, is_active")
    .eq("auth_user_id", userId)
    .single();

  if (staffError || !staffData || !staffData.is_active) {
    return { isStaff: false };
  }

  const staffId = staffData.id;

  // Get permissions
  const { data: permissionsData } = await serviceClient
    .from("staff_permissions")
    .select("can_view_members, can_manage_members, can_access_ledger, can_access_payments, can_access_analytics, can_change_settings")
    .eq("staff_id", staffId)
    .single();

  // Get branch assignments
  const { data: assignments } = await serviceClient
    .from("staff_branch_assignments")
    .select("branch_id")
    .eq("staff_id", staffId);

  const branchIds = (assignments || []).map((a: { branch_id: string }) => a.branch_id);

  return {
    isStaff: true,
    staffId,
    permissions: permissionsData as StaffPermissions || {
      can_view_members: false,
      can_manage_members: false,
      can_access_ledger: false,
      can_access_payments: false,
      can_access_analytics: false,
      can_change_settings: false,
    },
    branchIds,
  };
}

// ============================================================================
// Complete Auth Flow
// ============================================================================

/**
 * Full authentication and authorization flow.
 * Validates JWT, then checks admin/staff roles.
 */
export async function validateAuth(
  authHeader: string | null
): Promise<AuthResult> {
  const { anonClient, serviceClient } = createAuthClients(authHeader);

  // Step 1: Validate JWT
  const jwtResult = await validateJWT(anonClient, authHeader);
  if (!jwtResult.valid || !jwtResult.userId) {
    return {
      valid: false,
      isAdmin: false,
      isSuperAdmin: false,
      isStaff: false,
      error: jwtResult.error,
    };
  }

  const userId = jwtResult.userId;

  // Step 2: Check admin role
  const adminCheck = await checkAdminRole(serviceClient, userId);
  if (adminCheck.isAdmin) {
    return {
      valid: true,
      userId,
      isAdmin: true,
      isSuperAdmin: adminCheck.isSuperAdmin,
      isStaff: false,
      tenantId: adminCheck.tenantId,
    };
  }

  // Step 3: Check staff access
  const staffCheck = await checkStaffAccess(serviceClient, userId);
  if (staffCheck.isStaff) {
    return {
      valid: true,
      userId,
      isAdmin: false,
      isSuperAdmin: false,
      isStaff: true,
      staffId: staffCheck.staffId,
      permissions: staffCheck.permissions,
      branchIds: staffCheck.branchIds,
    };
  }

  // Not admin or staff
  return {
    valid: false,
    isAdmin: false,
    isSuperAdmin: false,
    isStaff: false,
    error: "User has no valid role",
  };
}

// ============================================================================
// Authorization Helpers
// ============================================================================

/**
 * Require valid authentication. Throws if not authenticated.
 */
export function requireAuth(auth: AuthResult): void {
  if (!auth.valid) {
    throw new Error(auth.error || "Authentication required");
  }
}

/**
 * Require admin role. Throws if not admin.
 */
export function requireAdmin(auth: AuthResult): void {
  requireAuth(auth);
  if (!auth.isAdmin) {
    throw new Error("Admin access required");
  }
}

/**
 * Require super admin role. Throws if not super admin.
 */
export function requireSuperAdmin(auth: AuthResult): void {
  requireAuth(auth);
  if (!auth.isSuperAdmin) {
    throw new Error("Super admin access required");
  }
}

/**
 * Require specific staff permission. Admins bypass permission checks.
 */
export function requireStaffPermission(
  auth: AuthResult,
  permission: keyof StaffPermissions
): void {
  requireAuth(auth);
  
  // Admins have all permissions
  if (auth.isAdmin) return;
  
  // Must be staff with the required permission
  if (!auth.isStaff) {
    throw new Error("Staff access required");
  }
  
  if (!auth.permissions?.[permission]) {
    throw new Error(`Permission denied: ${permission}`);
  }
}

/**
 * Check if user has access to a specific branch.
 */
export function hasBranchAccess(auth: AuthResult, branchId: string | null): boolean {
  // Admins have access to all branches (within their tenant)
  if (auth.isAdmin) return true;
  
  // No branch specified = allowed
  if (!branchId) return true;
  
  // Staff must be assigned to the branch
  return auth.branchIds?.includes(branchId) || false;
}

/**
 * Require access to a specific branch. Throws if no access.
 */
export function requireBranchAccess(auth: AuthResult, branchId: string | null): void {
  if (!hasBranchAccess(auth, branchId)) {
    throw new Error("Access denied to this branch");
  }
}

// ============================================================================
// Tenant Scoping Helpers
// ============================================================================

/**
 * Get allowed branch IDs based on user's tenant/branch assignments.
 * Returns null for super admins (no scoping), array for others.
 */
export async function resolveAllowedBranchIds(
  serviceClient: SupabaseClient,
  auth: AuthResult,
  requestedBranchId: string | null
): Promise<string[] | null> {
  // Specific branch requested
  if (requestedBranchId) return [requestedBranchId];

  // Staff: restricted to assigned branches
  if (auth.isStaff) return auth.branchIds || [];

  // Super admin: no restrictions
  if (auth.isSuperAdmin) return null;

  // Gym owner: branches in their tenant
  if (auth.isAdmin && auth.tenantId) {
    const { data: branches } = await serviceClient
      .from("branches")
      .select("id")
      .eq("tenant_id", auth.tenantId)
      .eq("is_active", true);

    return (branches || []).map((b: { id: string }) => b.id);
  }

  // Admin without tenant: resolve from tenant_members
  if (auth.isAdmin && auth.userId) {
    const { data: membership } = await serviceClient
      .from("tenant_members")
      .select("tenant_id")
      .eq("user_id", auth.userId)
      .limit(1)
      .maybeSingle();

    if (!membership?.tenant_id) return [];

    const { data: branches } = await serviceClient
      .from("branches")
      .select("id")
      .eq("tenant_id", membership.tenant_id)
      .eq("is_active", true);

    return (branches || []).map((b: { id: string }) => b.id);
  }

  return [];
}

// ============================================================================
// Response Helpers
// ============================================================================

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
};

/**
 * Create an error response with consistent format.
 */
export function errorResponse(message: string, status: number): Response {
  return new Response(
    JSON.stringify({ error: message }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" }, status }
  );
}

/**
 * Create a success response with consistent format.
 */
export function successResponse(data: unknown, status: number = 200): Response {
  return new Response(
    JSON.stringify(data),
    { headers: { ...corsHeaders, "Content-Type": "application/json" }, status }
  );
}

/**
 * Handle CORS preflight request.
 */
export function handleCorsRequest(): Response {
  return new Response(null, { headers: corsHeaders });
}
