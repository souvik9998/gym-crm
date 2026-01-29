/**
 * Dashboard Query Hooks
 * TanStack Query hooks for dashboard statistics
 */
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { queryKeys, invalidationGroups } from "@/lib/queryKeys";
import { STALE_TIMES, GC_TIME } from "@/lib/queryClient";
import { useBranch } from "@/contexts/BranchContext";
import { useStaffAuth } from "@/contexts/StaffAuthContext";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { useCallback } from "react";
import * as dashboardApi from "@/api/dashboard";

// Re-export types
export type { DashboardStats } from "@/api/dashboard";

/**
 * Hook to fetch dashboard statistics
 * Auth-aware: only fetches when user is authenticated
 */
export function useDashboardStats() {
  const { currentBranch } = useBranch();
  const { isStaffLoggedIn } = useStaffAuth();
  const { isAdmin } = useIsAdmin();
  const branchId = currentBranch?.id;
  
  const isAuthenticated = isAdmin || isStaffLoggedIn;

  return useQuery({
    queryKey: queryKeys.dashboardStats(branchId),
    queryFn: () => dashboardApi.fetchDashboardStats(branchId),
    staleTime: STALE_TIMES.REAL_TIME,
    gcTime: GC_TIME,
    refetchOnWindowFocus: false,
    enabled: isAuthenticated,
  });
}

/**
 * Hook to invalidate all dashboard-related queries
 */
export function useInvalidateDashboard() {
  const queryClient = useQueryClient();
  const { currentBranch } = useBranch();

  const invalidateMembers = useCallback(() => {
    const keys = invalidationGroups.members(currentBranch?.id);
    keys.forEach(key => {
      queryClient.invalidateQueries({ queryKey: key });
    });
  }, [queryClient, currentBranch?.id]);

  const invalidatePayments = useCallback(() => {
    const keys = invalidationGroups.payments(currentBranch?.id);
    keys.forEach(key => {
      queryClient.invalidateQueries({ queryKey: key });
    });
  }, [queryClient, currentBranch?.id]);

  const invalidateDailyPass = useCallback(() => {
    const keys = invalidationGroups.dailyPass(currentBranch?.id);
    keys.forEach(key => {
      queryClient.invalidateQueries({ queryKey: key });
    });
  }, [queryClient, currentBranch?.id]);

  const invalidateAll = useCallback(() => {
    invalidateMembers();
    invalidatePayments();
    invalidateDailyPass();
  }, [invalidateMembers, invalidatePayments, invalidateDailyPass]);

  return {
    invalidateMembers,
    invalidatePayments,
    invalidateDailyPass,
    invalidateAll,
  };
}
