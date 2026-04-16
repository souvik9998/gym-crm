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
import { useAssignedMemberIds } from "@/hooks/useAssignedMembers";
import * as dashboardApi from "@/api/dashboard";

// Re-export types
export type { DashboardStats } from "@/api/dashboard";

/**
 * Hook to fetch dashboard statistics
 * For staff with assigned-only access, forces edge function path to filter by assigned members
 */
export function useDashboardStats() {
  const { currentBranch } = useBranch();
  const { isStaffLoggedIn, permissions, staffUser } = useStaffAuth();
  const { isAdmin } = useAuth();
  const branchId = currentBranch?.id;
  const isAuthenticated = isAdmin || isStaffLoggedIn;
  const isLimitedAccess = isStaffLoggedIn && permissions?.member_access_type === "assigned";
  const { assignedMemberIds } = useAssignedMemberIds();
  const assignedScope = isLimitedAccess
    ? (assignedMemberIds === null ? "all" : assignedMemberIds.join(",") || "none")
    : "all";

  return useQuery({
    queryKey: [...queryKeys.dashboardStats(branchId), isLimitedAccess ? "assigned" : "all", staffUser?.id || "admin", assignedScope],
    queryFn: () => dashboardApi.fetchDashboardStats(branchId, isLimitedAccess),
    staleTime: STALE_TIMES.REAL_TIME,
    gcTime: GC_TIME,
    enabled: isAuthenticated && (!isLimitedAccess || assignedMemberIds !== undefined),
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
