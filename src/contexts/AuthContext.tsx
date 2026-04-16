/**
 * Centralized AuthProvider
 * 
 * Single source of truth for authentication state across the entire app.
 * Gets session ONCE at bootstrap, listens for auth changes, and provides
 * user, roles, tenantId, and permissions to all components.
 * 
 * This eliminates redundant supabase.auth.getSession() / getUser() calls
 * scattered across useIsAdmin, useUserRoles, useTenantPermissions,
 * ProtectedRoute, and BranchContext.
 */

import React, { createContext, useContext, useState, useEffect, useCallback, useRef, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { queryClient } from "@/lib/queryClient";
import type { User, Session } from "@supabase/supabase-js";

export type AppRole = "admin" | "member" | "staff" | "super_admin" | "tenant_admin";

export interface TenantFeaturePermissions {
  members_management: boolean;
  attendance: boolean;
  attendance_manual: boolean;
  attendance_qr: boolean;
  attendance_biometric: boolean;
  payments_billing: boolean;
  staff_management: boolean;
  reports_analytics: boolean;
  branch_analytics: boolean;
  event_management: boolean;
  workout_diet_plans: boolean;
  notifications: boolean;
  integrations: boolean;
  leads_crm: boolean;
}

const DEFAULT_PERMISSIONS: TenantFeaturePermissions = {
  members_management: true,
  attendance: true,
  attendance_manual: true,
  attendance_qr: false,
  attendance_biometric: false,
  payments_billing: true,
  staff_management: true,
  reports_analytics: true,
  branch_analytics: false,
  event_management: false,
  workout_diet_plans: false,
  notifications: true,
  integrations: true,
  leads_crm: false,
};

const ALL_PERMISSIONS: TenantFeaturePermissions = {
  members_management: true,
  attendance: true,
  attendance_manual: true,
  attendance_qr: true,
  attendance_biometric: true,
  payments_billing: true,
  staff_management: true,
  reports_analytics: true,
  branch_analytics: true,
  event_management: true,
  workout_diet_plans: true,
  notifications: true,
  integrations: true,
  leads_crm: true,
};

interface AuthState {
  user: User | null;
  session: Session | null;
  roles: AppRole[];
  isAdmin: boolean;
  isSuperAdmin: boolean;
  isGymOwner: boolean;
  tenantId: string | null;
  tenantPermissions: TenantFeaturePermissions;
  planExpired: boolean;
  isLoading: boolean;
  isAuthenticated: boolean;
}

interface AuthContextType extends AuthState {
  refreshAuth: () => Promise<void>;
  isModuleEnabled: (module: keyof TenantFeaturePermissions) => boolean;
  hasRole: (role: AppRole) => boolean;
  hasAnyRole: (roles: AppRole[]) => boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

function isStaffEmail(email: string | undefined): boolean {
  if (!email) return false;
  return email.startsWith("staff_") && email.endsWith("@gym.local");
}

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [state, setState] = useState<AuthState>({
    user: null,
    session: null,
    roles: [],
    isAdmin: false,
    isSuperAdmin: false,
    isGymOwner: false,
    tenantId: null,
    tenantPermissions: DEFAULT_PERMISSIONS,
    planExpired: false,
    isLoading: true,
    isAuthenticated: false,
  });

  const isMounted = useRef(true);
  const lastLoadedUserId = useRef<string | null>(null);

  const loadUserData = useCallback(async (user: User, force = false) => {
    // Skip if same user already loaded (prevents redundant calls on token refresh)
    if (!force && lastLoadedUserId.current === user.id && !state.isLoading) {
      return;
    }
    try {
      // For staff emails, skip role loading but STILL load tenant permissions
      // so that tenant module flags (event_management, etc.) are available for sidebar filtering
      if (isStaffEmail(user.email)) {
        // Get staff record to find their branch → tenant
        let staffTenantPermissions = DEFAULT_PERMISSIONS;
        let staffPlanExpired = false;
        try {
          const { data: staffList } = await supabase
            .from("staff")
            .select("id")
            .eq("auth_user_id", user.id)
            .eq("is_active", true)
            .limit(1);
          const staffId = staffList?.[0]?.id;
          if (staffId) {
            const { data: branchAssignment } = await supabase
              .from("staff_branch_assignments")
              .select("branch_id, branches(tenant_id)")
              .eq("staff_id", staffId)
              .limit(1)
              .maybeSingle();
            const tenantId = (branchAssignment?.branches as any)?.tenant_id;
            if (tenantId) {
              const { data: limits } = await supabase
                .from("tenant_limits")
                .select("features, plan_expiry_date")
                .eq("tenant_id", tenantId)
                .single();
              if (limits) {
                const features = limits.features as Record<string, boolean> | null;
                if (features) {
                  const attendanceEnabled = features.attendance ?? true;
                  staffTenantPermissions = {
                    members_management: features.members_management ?? true,
                    attendance: attendanceEnabled,
                    attendance_manual: attendanceEnabled && (features.attendance_manual ?? attendanceEnabled),
                    attendance_qr: attendanceEnabled && (features.attendance_qr ?? false),
                    attendance_biometric: attendanceEnabled && (features.attendance_biometric ?? false),
                    payments_billing: features.payments_billing ?? true,
                    staff_management: features.staff_management ?? true,
                    reports_analytics: features.reports_analytics ?? true,
                    branch_analytics: features.branch_analytics ?? false,
                    event_management: features.event_management ?? false,
                    workout_diet_plans: features.workout_diet_plans ?? false,
                    notifications: features.notifications ?? true,
                    integrations: features.integrations ?? true,
                    leads_crm: features.leads_crm ?? false,
                  };
                }
                if (limits.plan_expiry_date) {
                  const expiry = new Date(limits.plan_expiry_date);
                  const today = new Date();
                  today.setHours(0, 0, 0, 0);
                  staffPlanExpired = expiry < today;
                }
              }
            }
          }
        } catch (err) {
          console.warn("[AuthProvider] Failed to load tenant permissions for staff:", err);
        }

        if (isMounted.current) {
          lastLoadedUserId.current = user.id;
          setState(prev => ({
            ...prev,
            user,
            roles: [],
            isAdmin: false,
            isSuperAdmin: false,
            isGymOwner: false,
            tenantId: null,
            tenantPermissions: staffTenantPermissions,
            planExpired: staffPlanExpired,
            isAuthenticated: true,
            isLoading: false,
          }));
        }
        return;
      }

      // Fetch roles + tenant membership in parallel
      const [rolesResult, tenantResult] = await Promise.all([
        supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", user.id),
        supabase
          .from("tenant_members")
          .select("tenant_id, role, is_owner")
          .eq("user_id", user.id)
          .maybeSingle(),
      ]);

      if (!isMounted.current) return;

      const roles = (rolesResult.data || []).map(r => r.role as AppRole);
      const isSuperAdmin = roles.includes("super_admin");
      const isAdminRole = roles.includes("admin");
      const isGymOwner = isAdminRole || tenantResult.data?.is_owner === true;
      const effectiveTenantId = tenantResult.data?.tenant_id || null;

      // Check impersonation for super admins
      const impersonatedTenantId = localStorage.getItem("superadmin-impersonated-tenant");

      // Fetch tenant permissions if we have a tenant
      let tenantPermissions = DEFAULT_PERMISSIONS;
      let planExpired = false;

      if (isSuperAdmin && !impersonatedTenantId) {
        tenantPermissions = ALL_PERMISSIONS;
      } else {
        const targetTenantId = impersonatedTenantId || effectiveTenantId;
        if (targetTenantId) {
          const { data: limits } = await supabase
            .from("tenant_limits")
            .select("features, plan_expiry_date")
            .eq("tenant_id", targetTenantId)
            .single();

          if (!isMounted.current) return;

          if (limits) {
            const features = limits.features as Record<string, boolean> | null;
            if (features) {
              const attendanceEnabled = features.attendance ?? true;
              tenantPermissions = {
                members_management: features.members_management ?? true,
                attendance: attendanceEnabled,
                // Sub-flags: only enabled if explicitly set AND parent attendance is on
                attendance_manual: attendanceEnabled && (features.attendance_manual ?? attendanceEnabled),
                attendance_qr: attendanceEnabled && (features.attendance_qr ?? false),
                attendance_biometric: attendanceEnabled && (features.attendance_biometric ?? false),
                payments_billing: features.payments_billing ?? true,
                staff_management: features.staff_management ?? true,
                reports_analytics: features.reports_analytics ?? true,
                // New keys default to false when missing from DB
                branch_analytics: features.branch_analytics ?? false,
                event_management: features.event_management ?? false,
                workout_diet_plans: features.workout_diet_plans ?? false,
                notifications: features.notifications ?? true,
                integrations: features.integrations ?? true,
                leads_crm: features.leads_crm ?? false,
              };
            }
            if (limits.plan_expiry_date) {
              const expiry = new Date(limits.plan_expiry_date);
              const today = new Date();
              today.setHours(0, 0, 0, 0);
              planExpired = expiry < today;
            }
          }
        }
      }

      if (isMounted.current) {
        lastLoadedUserId.current = user.id;
        setState({
          user,
          session: null, // will be set by the session handler
          roles,
          isAdmin: isAdminRole || isSuperAdmin,
          isSuperAdmin,
          isGymOwner,
          tenantId: effectiveTenantId,
          tenantPermissions,
          planExpired,
          isLoading: false,
          isAuthenticated: true,
        });
      }
    } catch (error) {
      console.error("[AuthProvider] Error loading user data:", error);
      if (isMounted.current) {
        setState(prev => ({
          ...prev,
          user,
          isAuthenticated: true,
          isLoading: false,
        }));
      }
    }
  }, []);

  const clearAuthState = useCallback(() => {
    if (isMounted.current) {
      // Clear all cached queries to prevent cross-tenant data leakage
      queryClient.clear();
      lastLoadedUserId.current = null;
      setState({
        user: null,
        session: null,
        roles: [],
        isAdmin: false,
        isSuperAdmin: false,
        isGymOwner: false,
        tenantId: null,
        tenantPermissions: DEFAULT_PERMISSIONS,
        planExpired: false,
        isLoading: false,
        isAuthenticated: false,
      });
    }
  }, []);

  useEffect(() => {
    isMounted.current = true;

    // 1. Set up auth listener FIRST (per Supabase docs)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (!isMounted.current) return;

        if (event === "SIGNED_OUT") {
          lastLoadedUserId.current = null;
          clearAuthState();
          return;
        }

        if (session?.user) {
          // Update session immediately
          setState(prev => ({ ...prev, session }));
          // Only reload user data on actual sign-in, not token refresh
          if (event === "SIGNED_IN" || event === "USER_UPDATED") {
            setTimeout(() => {
              if (isMounted.current) loadUserData(session.user);
            }, 0);
          } else if (event === "TOKEN_REFRESHED") {
            // Token refresh: update user/session but skip full data reload
            setState(prev => ({ ...prev, user: session.user, session }));
          } else {
            setTimeout(() => {
              if (isMounted.current) loadUserData(session.user);
            }, 0);
          }
        }
      }
    );

    // 2. THEN get initial session
    const initAuth = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!isMounted.current) return;

        if (session?.user) {
          setState(prev => ({ ...prev, session }));
          await loadUserData(session.user);
        } else {
          clearAuthState();
        }
      } catch (error) {
        console.error("[AuthProvider] Init error:", error);
        if (isMounted.current) clearAuthState();
      }
    };

    initAuth();

    return () => {
      isMounted.current = false;
      subscription.unsubscribe();
    };
  }, [loadUserData, clearAuthState]);

  const refreshAuth = useCallback(async () => {
    if (state.user) {
      await loadUserData(state.user, true);
    }
  }, [state.user, loadUserData]);

  const isModuleEnabled = useCallback((module: keyof TenantFeaturePermissions): boolean => {
    if (state.planExpired) return false;
    return state.tenantPermissions[module] ?? false;
  }, [state.planExpired, state.tenantPermissions]);

  const hasRole = useCallback((role: AppRole) => state.roles.includes(role), [state.roles]);
  const hasAnyRole = useCallback((roles: AppRole[]) => roles.some(r => state.roles.includes(r)), [state.roles]);

  const value: AuthContextType = {
    ...state,
    refreshAuth,
    isModuleEnabled,
    hasRole,
    hasAnyRole,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

/**
 * Hook to access the centralized auth state.
 * Use this instead of useIsAdmin, useUserRoles, useTenantPermissions.
 */
export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};

/**
 * Backward-compatible hook for components that only need isAdmin check.
 * Delegates to the centralized AuthProvider instead of making its own API calls.
 */
export const useIsAdminFromAuth = () => {
  const { isAdmin, isSuperAdmin, isGymOwner, isLoading } = useAuth();
  return { isAdmin, isSuperAdmin, isGymOwner, isLoading };
};

/**
 * Backward-compatible hook for tenant permissions.
 * Delegates to the centralized AuthProvider.
 */
export const useTenantPermissionsFromAuth = () => {
  const { tenantPermissions, tenantId, planExpired, isLoading, isModuleEnabled } = useAuth();
  return {
    permissions: tenantPermissions,
    tenantId,
    planExpired,
    isLoading,
    isModuleEnabled,
  };
};
