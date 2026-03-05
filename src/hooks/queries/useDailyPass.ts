/**
 * Daily Pass Query Hooks
 * TanStack Query hooks for daily pass users data
 */
import { useQuery, useInfiniteQuery, useMutation } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";
import { STALE_TIMES, GC_TIME } from "@/lib/queryClient";
import { useBranch } from "@/contexts/BranchContext";
import { useStaffAuth } from "@/contexts/StaffAuthContext";
import { useAuth } from "@/contexts/AuthContext";
import { useInvalidateQueries } from "@/hooks/useQueryCache";
import * as dailyPassApi from "@/api/dailyPass";

// Re-export types
export type { DailyPassUserWithSubscription, PaginatedDailyPassResponse } from "@/api/dailyPass";

/**
 * Hook to fetch all daily pass users with subscriptions
 */
export function useDailyPassQuery() {
  const { currentBranch } = useBranch();
  const { isStaffLoggedIn } = useStaffAuth();
  const { isAdmin } = useAuth();
  const branchId = currentBranch?.id;
  const isAuthenticated = isAdmin || isStaffLoggedIn;

  return useQuery({
    queryKey: queryKeys.dailyPass.users(branchId),
    queryFn: () => dailyPassApi.fetchDailyPassUsers(branchId),
    staleTime: STALE_TIMES.DYNAMIC,
    gcTime: GC_TIME,
    enabled: isAuthenticated && !!branchId,
  });
}

/**
 * Infinite scroll hook for daily pass users with pagination
 */
export function useInfiniteDailyPassQuery() {
  const { currentBranch } = useBranch();
  const { isStaffLoggedIn } = useStaffAuth();
  const { isAdmin } = useAuth();
  const branchId = currentBranch?.id;
  const isAuthenticated = isAdmin || isStaffLoggedIn;

  return useInfiniteQuery({
    queryKey: [...queryKeys.dailyPass.users(branchId), "infinite"],
    queryFn: ({ pageParam = 0 }) => dailyPassApi.fetchDailyPassUsersPaginated(branchId, pageParam, 25),
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    initialPageParam: 0,
    staleTime: STALE_TIMES.DYNAMIC,
    gcTime: GC_TIME,
    enabled: isAuthenticated && !!branchId,
  });
}

/**
 * Hook to fetch a single daily pass user by ID
 */
export function useDailyPassUserQuery(userId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.dailyPass.detail(userId || ''),
    queryFn: () => dailyPassApi.fetchDailyPassUserById(userId!),
    staleTime: STALE_TIMES.DYNAMIC,
    gcTime: GC_TIME,
    enabled: !!userId,
  });
}

/**
 * Mutation hook to create a new daily pass user
 */
export function useCreateDailyPassUser() {
  const { invalidateDailyPass } = useInvalidateQueries();

  return useMutation({
    mutationFn: dailyPassApi.createDailyPassUser,
    onSuccess: () => {
      invalidateDailyPass();
    },
  });
}

/**
 * Mutation hook to delete a daily pass user
 */
export function useDeleteDailyPassUser() {
  const { invalidateDailyPass } = useInvalidateQueries();

  return useMutation({
    mutationFn: dailyPassApi.deleteDailyPassUser,
    onSuccess: () => {
      invalidateDailyPass();
    },
  });
}

/**
 * Hook to check if daily pass user exists by phone
 */
export function useCheckDailyPassUserByPhone(phone: string, branchId: string) {
  return useQuery({
    queryKey: ['check-daily-pass-phone', phone, branchId],
    queryFn: () => dailyPassApi.checkDailyPassUserByPhone(phone, branchId),
    staleTime: 0,
    enabled: !!phone && phone.length >= 10 && !!branchId,
  });
}
