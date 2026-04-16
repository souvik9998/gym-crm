/**
 * Members Query Hooks
 * TanStack Query hooks for members data with infinite scroll support
 */
import { useQuery, useMutation, useQueryClient, useInfiniteQuery } from "@tanstack/react-query";
import { queryKeys, invalidationGroups } from "@/lib/queryKeys";
import { STALE_TIMES, GC_TIME } from "@/lib/queryClient";
import { useBranch } from "@/contexts/BranchContext";
import { useStaffAuth } from "@/contexts/StaffAuthContext";
import { useAuth } from "@/contexts/AuthContext";
import { useInvalidateQueries } from "@/hooks/useQueryCache";
import * as membersApi from "@/api/members";

const PAGE_SIZE = 50;

/**
 * Hook to fetch members with infinite scroll using useInfiniteQuery
 */
export function useInfiniteMembersQuery() {
  const { currentBranch } = useBranch();
  const { isStaffLoggedIn, permissions, staffUser } = useStaffAuth();
  const { isAdmin } = useAuth();
  const branchId = currentBranch?.id;
  const isAuthenticated = isAdmin || isStaffLoggedIn;
  const accessScope = isStaffLoggedIn
    ? `${staffUser?.id || "staff"}-${permissions?.member_access_type || "all"}`
    : "admin";

  return useInfiniteQuery({
    queryKey: [...queryKeys.members.all(branchId), accessScope, "infinite"],
    queryFn: ({ pageParam = 0 }) => membersApi.fetchMembersPaginated(branchId, pageParam, PAGE_SIZE),
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    initialPageParam: 0,
    staleTime: STALE_TIMES.DYNAMIC,
    gcTime: GC_TIME,
    enabled: isAuthenticated,
  });
}

/**
 * Hook to fetch all members with subscriptions (legacy)
 * @deprecated Use useInfiniteMembersQuery for better performance
 */
export function useMembersQuery() {
  const { currentBranch } = useBranch();
  const { isStaffLoggedIn, permissions, staffUser } = useStaffAuth();
  const { isAdmin } = useAuth();
  const branchId = currentBranch?.id;
  const isAuthenticated = isAdmin || isStaffLoggedIn;
  const accessScope = isStaffLoggedIn
    ? `${staffUser?.id || "staff"}-${permissions?.member_access_type || "all"}`
    : "admin";

  return useQuery({
    queryKey: [...queryKeys.members.all(branchId), accessScope],
    queryFn: () => membersApi.fetchMembers(branchId),
    staleTime: STALE_TIMES.DYNAMIC,
    gcTime: GC_TIME,
    enabled: isAuthenticated,
  });
}

/**
 * Hook to fetch a single member by ID
 */
export function useMemberQuery(memberId: string | undefined) {
  const { isStaffLoggedIn, permissions, staffUser } = useStaffAuth();
  const accessScope = isStaffLoggedIn
    ? `${staffUser?.id || "staff"}-${permissions?.member_access_type || "all"}`
    : "admin";

  return useQuery({
    queryKey: [...queryKeys.members.detail(memberId || ''), accessScope],
    queryFn: () => membersApi.fetchMemberById(memberId!),
    staleTime: STALE_TIMES.DYNAMIC,
    gcTime: GC_TIME,
    enabled: !!memberId,
  });
}

/**
 * Hook to fetch member details
 */
export function useMemberDetailsQuery(memberId: string | undefined) {
  const { isStaffLoggedIn, permissions, staffUser } = useStaffAuth();
  const accessScope = isStaffLoggedIn
    ? `${staffUser?.id || "staff"}-${permissions?.member_access_type || "all"}`
    : "admin";

  return useQuery({
    queryKey: ['member-details', memberId, accessScope],
    queryFn: () => membersApi.fetchMemberDetails(memberId!),
    staleTime: STALE_TIMES.DYNAMIC,
    gcTime: GC_TIME,
    enabled: !!memberId,
  });
}

/**
 * Mutation hook to create a new member
 */
export function useCreateMember() {
  const { invalidateMembers } = useInvalidateQueries();

  return useMutation({
    mutationFn: membersApi.createMember,
    onSuccess: () => {
      invalidateMembers();
    },
  });
}

/**
 * Mutation hook to update a member
 */
export function useUpdateMember() {
  const { invalidateMembers } = useInvalidateQueries();

  return useMutation({
    mutationFn: ({ memberId, updates }: { memberId: string; updates: Parameters<typeof membersApi.updateMember>[1] }) =>
      membersApi.updateMember(memberId, updates),
    onSuccess: () => {
      invalidateMembers();
    },
  });
}

/**
 * Mutation hook to delete a member
 */
export function useDeleteMember() {
  const { invalidateMembers } = useInvalidateQueries();

  return useMutation({
    mutationFn: membersApi.deleteMember,
    onSuccess: () => {
      invalidateMembers();
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
    staleTime: 0,
    enabled: !!phone && phone.length >= 10 && !!branchId,
  });
}
