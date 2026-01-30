/**
 * Query Hooks Index
 * Re-export all query hooks for easy imports
 */

// Members
export {
  useMembersQuery,
  useInfiniteMembersQuery,
  useMemberQuery,
  useMemberDetailsQuery,
  useCreateMember,
  useUpdateMember,
  useDeleteMember,
  useCheckMemberByPhone,
} from './useMembers';
export type { MemberWithSubscription, PaginatedMembersResponse } from '@/api/members';

// Payments
export {
  usePaymentsQuery,
  usePaymentQuery,
  useMemberPaymentsQuery,
  useCreatePayment,
  useUpdatePayment,
} from './usePayments';
export type { PaymentWithDetails, PaymentMode, PaymentStatus } from './usePayments';

// Daily Pass
export {
  useDailyPassQuery,
  useDailyPassUserQuery,
  useCreateDailyPassUser,
  useDeleteDailyPassUser,
  useCheckDailyPassUserByPhone,
} from './useDailyPass';
export type { DailyPassUserWithSubscription } from './useDailyPass';

// Dashboard
export {
  useDashboardStats,
  useInvalidateDashboard,
} from './useDashboard';
export type { DashboardStats } from './useDashboard';
