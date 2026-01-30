/**
 * Payments Query Hooks
 * TanStack Query hooks for payments data
 */
import { useQuery, useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { queryKeys, invalidationGroups } from "@/lib/queryKeys";
import { STALE_TIMES, GC_TIME } from "@/lib/queryClient";
import { useBranch } from "@/contexts/BranchContext";
import { useStaffAuth } from "@/contexts/StaffAuthContext";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import * as paymentsApi from "@/api/payments";

// Re-export types
export type { PaymentWithDetails, PaymentMode, PaymentStatus, PaginatedPaymentsResponse } from "@/api/payments";

/**
 * Hook to fetch all payments
 * Auth-aware: only fetches when user is authenticated
 */
export function usePaymentsQuery() {
  const { currentBranch } = useBranch();
  const { isStaffLoggedIn } = useStaffAuth();
  const { isAdmin } = useIsAdmin();
  const branchId = currentBranch?.id;
  
  const isAuthenticated = isAdmin || isStaffLoggedIn;

  return useQuery({
    queryKey: queryKeys.payments.all(branchId),
    queryFn: () => paymentsApi.fetchPayments(branchId),
    staleTime: STALE_TIMES.DYNAMIC,
    gcTime: GC_TIME,
    refetchOnWindowFocus: false,
    enabled: isAuthenticated,
  });
}

/**
 * Infinite scroll hook for payments with pagination
 */
export function useInfinitePaymentsQuery() {
  const { currentBranch } = useBranch();
  const { isStaffLoggedIn } = useStaffAuth();
  const { isAdmin } = useIsAdmin();
  const branchId = currentBranch?.id;
  
  const isAuthenticated = isAdmin || isStaffLoggedIn;

  return useInfiniteQuery({
    queryKey: [...queryKeys.payments.all(branchId), "infinite"],
    queryFn: ({ pageParam = 0 }) => paymentsApi.fetchPaymentsPaginated(branchId, pageParam, 25),
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    initialPageParam: 0,
    staleTime: STALE_TIMES.DYNAMIC,
    gcTime: GC_TIME,
    refetchOnWindowFocus: false,
    enabled: isAuthenticated && !!branchId,
  });
}

/**
 * Hook to fetch a single payment by ID
 */
export function usePaymentQuery(paymentId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.payments.detail(paymentId || ''),
    queryFn: () => paymentsApi.fetchPaymentById(paymentId!),
    staleTime: STALE_TIMES.DYNAMIC,
    gcTime: GC_TIME,
    refetchOnWindowFocus: false,
    enabled: !!paymentId,
  });
}

/**
 * Hook to fetch payments for a specific member
 */
export function useMemberPaymentsQuery(memberId: string | undefined) {
  return useQuery({
    queryKey: ['member-payments', memberId],
    queryFn: () => paymentsApi.fetchMemberPayments(memberId!),
    staleTime: STALE_TIMES.DYNAMIC,
    gcTime: GC_TIME,
    refetchOnWindowFocus: false,
    enabled: !!memberId,
  });
}

/**
 * Mutation hook to create a new payment
 */
export function useCreatePayment() {
  const queryClient = useQueryClient();
  const { currentBranch } = useBranch();

  return useMutation({
    mutationFn: paymentsApi.createPayment,
    onSuccess: () => {
      // Invalidate related queries
      const keysToInvalidate = invalidationGroups.payments(currentBranch?.id);
      keysToInvalidate.forEach(key => {
        queryClient.invalidateQueries({ queryKey: key });
      });
    },
  });
}

/**
 * Mutation hook to update a payment
 */
export function useUpdatePayment() {
  const queryClient = useQueryClient();
  const { currentBranch } = useBranch();

  return useMutation({
    mutationFn: ({ paymentId, updates }: { paymentId: string; updates: Parameters<typeof paymentsApi.updatePayment>[1] }) =>
      paymentsApi.updatePayment(paymentId, updates),
    onSuccess: (_, { paymentId }) => {
      // Invalidate related queries
      queryClient.invalidateQueries({ queryKey: queryKeys.payments.detail(paymentId) });
      const keysToInvalidate = invalidationGroups.payments(currentBranch?.id);
      keysToInvalidate.forEach(key => {
        queryClient.invalidateQueries({ queryKey: key });
      });
    },
  });
}
