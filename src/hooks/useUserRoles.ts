import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";

// Re-export type from AuthContext
export type { AppRole } from "@/contexts/AuthContext";

/**
 * Hook to check all roles for the current user
 * NOW DELEGATES to the centralized AuthProvider.
 */
export const useUserRoles = () => {
  const auth = useAuth();

  return {
    roles: auth.roles,
    isAdmin: auth.isAdmin,
    isSuperAdmin: auth.isSuperAdmin,
    isGymOwner: auth.isGymOwner,
    isLoading: auth.isLoading,
    userId: auth.user?.id || null,
    tenantId: auth.tenantId,
    refreshRoles: auth.refreshAuth,
    hasRole: auth.hasRole,
    hasAnyRole: auth.hasAnyRole,
  };
};

/**
 * Simple hook to check if current user is a super admin
 * NOW DELEGATES to the centralized AuthProvider.
 */
export const useIsSuperAdmin = () => {
  const { isSuperAdmin, isLoading } = useAuth();
  return { isSuperAdmin, isLoading };
};
