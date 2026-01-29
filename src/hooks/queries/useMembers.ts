/**
 * Members Query Hooks
 * TanStack Query hooks for members data
 */
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { queryKeys, invalidationGroups } from "@/lib/queryKeys";
import { STALE_TIMES, GC_TIME } from "@/lib/queryClient";
import { useBranch } from "@/contexts/BranchContext";
import { useStaffAuth } from "@/contexts/StaffAuthContext";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import * as membersApi from "@/api/members";

/**
 * Hook to fetch all members with subscriptions
 * Auth-aware: only fetches when user is authenticated
 */
export function useMembersQuery() {
  const { currentBranch } = useBranch();
  const { isStaffLoggedIn } = useStaffAuth();
  const { isAdmin } = useIsAdmin();
  const branchId = currentBranch?.id;
  
  const isAuthenticated = isAdmin || isStaffLoggedIn;

  return useQuery({
    queryKey: queryKeys.members.all(branchId),
    queryFn: () => membersApi.fetchMembers(branchId),
    staleTime: STALE_TIMES.DYNAMIC,
    gcTime: GC_TIME,
    refetchOnWindowFocus: false,
    enabled: isAuthenticated,
  });
}

/**
 * Hook to fetch a single member by ID
 */
export function useMemberQuery(memberId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.members.detail(memberId || ''),
    queryFn: () => membersApi.fetchMemberById(memberId!),
    staleTime: STALE_TIMES.DYNAMIC,
    gcTime: GC_TIME,
    refetchOnWindowFocus: false,
    enabled: !!memberId,
  });
}

/**
 * Hook to fetch member details
 */
export function useMemberDetailsQuery(memberId: string | undefined) {
  return useQuery({
    queryKey: ['member-details', memberId],
    queryFn: () => membersApi.fetchMemberDetails(memberId!),
    staleTime: STALE_TIMES.DYNAMIC,
    gcTime: GC_TIME,
    refetchOnWindowFocus: false,
    enabled: !!memberId,
  });
}

/**
 * Mutation hook to create a new member
 */
export function useCreateMember() {
  const queryClient = useQueryClient();
  const { currentBranch } = useBranch();

  return useMutation({
    mutationFn: membersApi.createMember,
    onSuccess: () => {
      // Invalidate related queries
      const keysToInvalidate = invalidationGroups.members(currentBranch?.id);
      keysToInvalidate.forEach(key => {
        queryClient.invalidateQueries({ queryKey: key });
      });
    },
  });
}

/**
 * Mutation hook to update a member
 */
export function useUpdateMember() {
  const queryClient = useQueryClient();
  const { currentBranch } = useBranch();

  return useMutation({
    mutationFn: ({ memberId, updates }: { memberId: string; updates: Parameters<typeof membersApi.updateMember>[1] }) =>
      membersApi.updateMember(memberId, updates),
    onSuccess: (_, { memberId }) => {
      // Invalidate related queries
      queryClient.invalidateQueries({ queryKey: queryKeys.members.detail(memberId) });
      const keysToInvalidate = invalidationGroups.members(currentBranch?.id);
      keysToInvalidate.forEach(key => {
        queryClient.invalidateQueries({ queryKey: key });
      });
    },
  });
}

/**
 * Mutation hook to delete a member
 */
export function useDeleteMember() {
  const queryClient = useQueryClient();
  const { currentBranch } = useBranch();

  return useMutation({
    mutationFn: membersApi.deleteMember,
    onSuccess: () => {
      // Invalidate related queries
      const keysToInvalidate = invalidationGroups.members(currentBranch?.id);
      keysToInvalidate.forEach(key => {
        queryClient.invalidateQueries({ queryKey: key });
      });
    },
  });
}

/**
 * Hook to check if member exists by phone
 */
export function useCheckMemberByPhone(phone: string, branchId: string) {
  return useQuery({
    queryKey: ['check-member-phone', phone, branchId],
    queryFn: () => membersApi.checkMemberByPhone(phone, branchId),
    staleTime: 0, // Always fresh for checks
    enabled: !!phone && phone.length >= 10 && !!branchId,
  });
}
