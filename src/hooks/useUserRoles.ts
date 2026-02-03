import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

// Role hierarchy: super_admin (SaaS owner) > admin (gym owner) > staff > member
export type AppRole = "admin" | "member" | "staff" | "super_admin";

interface UserRolesState {
  roles: AppRole[];
  isAdmin: boolean;        // admin = gym owner
  isSuperAdmin: boolean;   // super_admin = SaaS owner
  isGymOwner: boolean;     // Alias for isAdmin (gym owner)
  isLoading: boolean;
  userId: string | null;
  tenantId: string | null;
}

/**
 * Hook to check all roles for the current user
 * Supports the multi-tenant SaaS architecture with super_admin and tenant_admin roles
 */
export const useUserRoles = () => {
  const [state, setState] = useState<UserRolesState>({
    roles: [],
    isAdmin: false,
    isSuperAdmin: false,
    isGymOwner: false,
    isLoading: true,
    userId: null,
    tenantId: null,
  });

  const checkRoles = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        setState({
          roles: [],
          isAdmin: false,
          isSuperAdmin: false,
          isGymOwner: false,
          isLoading: false,
          userId: null,
          tenantId: null,
        });
        return;
      }

      // Fetch all roles for the user
      const { data: rolesData, error: rolesError } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id);

      if (rolesError) {
        console.error("Error fetching user roles:", rolesError);
        setState(prev => ({ ...prev, isLoading: false, userId: user.id }));
        return;
      }

      const roles = (rolesData || []).map(r => r.role as AppRole);
      
      // Fetch tenant membership
      const { data: tenantData } = await supabase
        .from("tenant_members")
        .select("tenant_id, role, is_owner")
        .eq("user_id", user.id)
        .maybeSingle();

      // Role hierarchy: super_admin (SaaS owner) > admin (gym owner)
      const isAdminRole = roles.includes("admin");
      const isSuperAdminRole = roles.includes("super_admin");
      
      setState({
        roles,
        isAdmin: isAdminRole,           // admin = gym owner
        isSuperAdmin: isSuperAdminRole, // super_admin = SaaS owner
        isGymOwner: isAdminRole || tenantData?.is_owner === true, // gym owner check
        isLoading: false,
        userId: user.id,
        tenantId: tenantData?.tenant_id || null,
      });
    } catch (error) {
      console.error("Error checking user roles:", error);
      setState(prev => ({ ...prev, isLoading: false }));
    }
  }, []);

  useEffect(() => {
    checkRoles();

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {
      checkRoles();
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [checkRoles]);

  return {
    ...state,
    refreshRoles: checkRoles,
    hasRole: (role: AppRole) => state.roles.includes(role),
    hasAnyRole: (roles: AppRole[]) => roles.some(r => state.roles.includes(r)),
  };
};

/**
 * Simple hook to check if current user is a super admin
 */
export const useIsSuperAdmin = () => {
  const [isSuperAdmin, setIsSuperAdmin] = useState<boolean | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const checkStatus = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        
        if (!user) {
          setIsSuperAdmin(false);
          setIsLoading(false);
          return;
        }

        const { data, error } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", user.id)
          .eq("role", "super_admin")
          .maybeSingle();

        if (error) {
          console.error("Error checking super admin status:", error);
          setIsSuperAdmin(false);
        } else {
          setIsSuperAdmin(!!data);
        }
      } catch (error) {
        console.error("Error checking super admin status:", error);
        setIsSuperAdmin(false);
      } finally {
        setIsLoading(false);
      }
    };

    checkStatus();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {
      checkStatus();
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  return { isSuperAdmin: isSuperAdmin ?? false, isLoading };
};
