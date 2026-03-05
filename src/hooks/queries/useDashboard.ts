/**
 * Dashboard Query Hooks
 * TanStack Query hooks for dashboard statistics
 */
import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";
import { STALE_TIMES, GC_TIME } from "@/lib/queryClient";
import { useBranch } from "@/contexts/BranchContext";
import { useStaffAuth } from "@/contexts/StaffAuthContext";
import { useAuth } from "@/contexts/AuthContext";
import { useInvalidateQueries } from "@/hooks/useQueryCache";
import * as dashboardApi from "@/api/dashboard";

// Re-export types
export type { DashboardStats } from "@/api/dashboard";

/**
 * Hook to fetch dashboard statistics
 */
export function useDashboardStats() {
  const { currentBranch } = useBranch();
  const { isStaffLoggedIn } = useStaffAuth();
  const { isAdmin } = useAuth();
  const branchId = currentBranch?.id;
  const isAuthenticated = isAdmin || isStaffLoggedIn;

  return useQuery({
    queryKey: queryKeys.dashboardStats(branchId),
    queryFn: () => dashboardApi.fetchDashboardStats(branchId),
    staleTime: STALE_TIMES.REAL_TIME,
    gcTime: GC_TIME,
    enabled: isAuthenticated,
  });
}

/**
 * Hook to invalidate all dashboard-related queries
 */
export function useInvalidateDashboard() {
  const { invalidateMembers, invalidatePayments, invalidateDailyPass } = useInvalidateQueries();

  return {
    invalidateMembers,
    invalidatePayments,
    invalidateDailyPass,
    invalidateAll: async () => {
      await Promise.all([
        invalidateMembers(),
        invalidatePayments(),
        invalidateDailyPass(),
      ]);
    },
  };
}
