/**
 * Daily Pass Query Hooks
 * TanStack Query hooks for daily pass users data
 */
import { useQuery, useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { queryKeys, invalidationGroups } from "@/lib/queryKeys";
import { STALE_TIMES, GC_TIME } from "@/lib/queryClient";
import { useBranch } from "@/contexts/BranchContext";
import { useStaffAuth } from "@/contexts/StaffAuthContext";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import * as dailyPassApi from "@/api/dailyPass";

// Re-export types
export type { DailyPassUserWithSubscription, PaginatedDailyPassResponse } from "@/api/dailyPass";

/**
 * Hook to fetch all daily pass users with subscriptions
 * Auth-aware: only fetches when user is authenticated and branch is selected
 */
export function useDailyPassQuery() {
  const { currentBranch } = useBranch();
  const { isStaffLoggedIn } = useStaffAuth();
  const { isAdmin } = useIsAdmin();
  const branchId = currentBranch?.id;
  
  const isAuthenticated = isAdmin || isStaffLoggedIn;

  return useQuery({
    queryKey: queryKeys.dailyPass.users(branchId),
    queryFn: () => dailyPassApi.fetchDailyPassUsers(branchId),
    staleTime: STALE_TIMES.DYNAMIC,
    gcTime: GC_TIME,
    refetchOnWindowFocus: false,
    enabled: isAuthenticated && !!branchId,
  });
}

/**
 * Infinite scroll hook for daily pass users with pagination
 */
export function useInfiniteDailyPassQuery() {
  const { currentBranch } = useBranch();
  const { isStaffLoggedIn } = useStaffAuth();
  const { isAdmin } = useIsAdmin();
  const branchId = currentBranch?.id;
  
  const isAuthenticated = isAdmin || isStaffLoggedIn;

  return useInfiniteQuery({
    queryKey: [...queryKeys.dailyPass.users(branchId), "infinite"],
    queryFn: ({ pageParam = 0 }) => dailyPassApi.fetchDailyPassUsersPaginated(branchId, pageParam, 25),
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    initialPageParam: 0,
    staleTime: STALE_TIMES.DYNAMIC,
    gcTime: GC_TIME,
    refetchOnWindowFocus: false,
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
    refetchOnWindowFocus: false,
    enabled: !!userId,
  });
}

/**
 * Mutation hook to create a new daily pass user
 */
export function useCreateDailyPassUser() {
  const queryClient = useQueryClient();
  const { currentBranch } = useBranch();

  return useMutation({
    mutationFn: dailyPassApi.createDailyPassUser,
    onSuccess: () => {
      // Invalidate related queries
      const keysToInvalidate = invalidationGroups.dailyPass(currentBranch?.id);
      keysToInvalidate.forEach(key => {
        queryClient.invalidateQueries({ queryKey: key });
      });
    },
  });
}

/**
 * Mutation hook to delete a daily pass user
 */
export function useDeleteDailyPassUser() {
  const queryClient = useQueryClient();
  const { currentBranch } = useBranch();

  return useMutation({
    mutationFn: dailyPassApi.deleteDailyPassUser,
    onSuccess: () => {
      // Invalidate related queries
      const keysToInvalidate = invalidationGroups.dailyPass(currentBranch?.id);
      keysToInvalidate.forEach(key => {
        queryClient.invalidateQueries({ queryKey: key });
      });
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
    staleTime: 0, // Always fresh for checks
    enabled: !!phone && phone.length >= 10 && !!branchId,
  });
}
