/**
 * Hook to fetch and cache tenant module permissions for the current gym owner.
 * 
 * NOW DELEGATES to the centralized AuthProvider instead of making
 * its own Supabase API calls. This eliminates redundant auth checks.
 */
import { useAuth } from "@/contexts/AuthContext";

export type { TenantFeaturePermissions } from "@/contexts/AuthContext";

export function useTenantPermissions() {
  const { tenantPermissions, tenantId, planExpired, isLoading, isModuleEnabled } = useAuth();
  return {
    permissions: tenantPermissions,
    tenantId,
    planExpired,
    isLoading,
    isModuleEnabled,
  };
}
