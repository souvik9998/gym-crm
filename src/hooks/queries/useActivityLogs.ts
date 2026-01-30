/**
 * Activity Logs Query Hooks
 * TanStack Query hooks for activity logs (admin, user, staff, whatsapp)
 */
import { useInfiniteQuery } from "@tanstack/react-query";
import { STALE_TIMES, GC_TIME } from "@/lib/queryClient";
import { useBranch } from "@/contexts/BranchContext";
import { useStaffAuth } from "@/contexts/StaffAuthContext";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import * as logsApi from "@/api/activityLogs";

// Re-export types
export type {
  AdminActivityLog,
  UserActivityLog,
  StaffActivityLog,
  WhatsAppLog,
  PaginatedAdminLogsResponse,
  PaginatedUserLogsResponse,
  PaginatedStaffLogsResponse,
  PaginatedWhatsAppLogsResponse,
} from "@/api/activityLogs";

/**
 * Infinite scroll hook for admin activity logs
 */
export function useInfiniteAdminLogsQuery(filters?: {
  categoryFilter?: string;
  dateFrom?: string;
  dateTo?: string;
}) {
  const { currentBranch } = useBranch();
  const { isStaffLoggedIn } = useStaffAuth();
  const { isAdmin } = useIsAdmin();
  const branchId = currentBranch?.id;
  
  const isAuthenticated = isAdmin || isStaffLoggedIn;

  return useInfiniteQuery({
    queryKey: ["admin-activity-logs", branchId, "infinite", filters],
    queryFn: ({ pageParam = 0 }) => logsApi.fetchAdminActivityLogsPaginated(branchId, pageParam, 25, filters),
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    initialPageParam: 0,
    staleTime: STALE_TIMES.DYNAMIC,
    gcTime: GC_TIME,
    refetchOnWindowFocus: false,
    enabled: isAuthenticated && !!branchId,
  });
}

/**
 * Infinite scroll hook for user activity logs
 */
export function useInfiniteUserLogsQuery(filters?: {
  typeFilter?: string;
  dateFrom?: string;
  dateTo?: string;
}) {
  const { currentBranch } = useBranch();
  const { isStaffLoggedIn } = useStaffAuth();
  const { isAdmin } = useIsAdmin();
  const branchId = currentBranch?.id;
  
  const isAuthenticated = isAdmin || isStaffLoggedIn;

  return useInfiniteQuery({
    queryKey: ["user-activity-logs", branchId, "infinite", filters],
    queryFn: ({ pageParam = 0 }) => logsApi.fetchUserActivityLogsPaginated(branchId, pageParam, 25, filters),
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    initialPageParam: 0,
    staleTime: STALE_TIMES.DYNAMIC,
    gcTime: GC_TIME,
    refetchOnWindowFocus: false,
    enabled: isAuthenticated && !!branchId,
  });
}

/**
 * Infinite scroll hook for staff activity logs
 */
export function useInfiniteStaffLogsQuery(filters?: {
  typeFilter?: string;
  staffFilter?: string;
  dateFrom?: string;
  dateTo?: string;
}) {
  const { currentBranch } = useBranch();
  const { isStaffLoggedIn } = useStaffAuth();
  const { isAdmin } = useIsAdmin();
  const branchId = currentBranch?.id;
  
  const isAuthenticated = isAdmin || isStaffLoggedIn;

  return useInfiniteQuery({
    queryKey: ["staff-activity-logs", branchId, "infinite", filters],
    queryFn: ({ pageParam = 0 }) => logsApi.fetchStaffActivityLogsPaginated(branchId, pageParam, 25, filters),
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    initialPageParam: 0,
    staleTime: STALE_TIMES.DYNAMIC,
    gcTime: GC_TIME,
    refetchOnWindowFocus: false,
    enabled: isAuthenticated && !!branchId,
  });
}

/**
 * Infinite scroll hook for WhatsApp logs
 */
export function useInfiniteWhatsAppLogsQuery(filters?: {
  typeFilter?: string;
  statusFilter?: string;
  manualFilter?: string;
  dateFrom?: string;
  dateTo?: string;
}) {
  const { currentBranch } = useBranch();
  const { isStaffLoggedIn } = useStaffAuth();
  const { isAdmin } = useIsAdmin();
  const branchId = currentBranch?.id;
  
  const isAuthenticated = isAdmin || isStaffLoggedIn;

  return useInfiniteQuery({
    queryKey: ["whatsapp-logs", branchId, "infinite", filters],
    queryFn: ({ pageParam = 0 }) => logsApi.fetchWhatsAppLogsPaginated(branchId, pageParam, 25, filters),
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    initialPageParam: 0,
    staleTime: STALE_TIMES.DYNAMIC,
    gcTime: GC_TIME,
    refetchOnWindowFocus: false,
    enabled: isAuthenticated && !!branchId,
  });
}
