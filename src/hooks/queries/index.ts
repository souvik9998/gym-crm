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
  useInfinitePaymentsQuery,
  usePaymentQuery,
  useMemberPaymentsQuery,
  useCreatePayment,
  useUpdatePayment,
} from './usePayments';
export type { PaymentWithDetails, PaymentMode, PaymentStatus, PaginatedPaymentsResponse } from './usePayments';

// Daily Pass
export {
  useDailyPassQuery,
  useInfiniteDailyPassQuery,
  useDailyPassUserQuery,
  useCreateDailyPassUser,
  useDeleteDailyPassUser,
  useCheckDailyPassUserByPhone,
} from './useDailyPass';
export type { DailyPassUserWithSubscription, PaginatedDailyPassResponse } from './useDailyPass';

// Dashboard
export {
  useDashboardStats,
  useInvalidateDashboard,
} from './useDashboard';
export type { DashboardStats } from './useDashboard';

// Activity Logs
export {
  useInfiniteAdminLogsQuery,
  useInfiniteUserLogsQuery,
  useInfiniteStaffLogsQuery,
  useInfiniteWhatsAppLogsQuery,
} from './useActivityLogs';
export type {
  AdminActivityLog,
  UserActivityLog,
  StaffActivityLog,
  WhatsAppLog,
  PaginatedAdminLogsResponse,
  PaginatedUserLogsResponse,
  PaginatedStaffLogsResponse,
  PaginatedWhatsAppLogsResponse,
} from './useActivityLogs';

// Analytics
export {
  useAnalyticsQuery,
  useAnalyticsTotals,
  useAnalyticsRevenue,
  useAnalyticsMemberGrowth,
  useAnalyticsTrainerStats,
  useAnalyticsPackageSales,
} from './useAnalytics';
export type {
  AnalyticsData,
  AnalyticsTotals,
  MonthlyRevenue,
  MemberGrowth,
  TrainerStats,
  PackageSalesData,
  PackageInfo,
} from './useAnalytics';

// Branch Analytics
export {
  useBranchMetricsQuery,
  useBranchTimeSeriesQuery,
  useBranchTrainerMetricsQuery,
} from './useBranchAnalytics';
export type {
  BranchMetrics,
  Insight,
  TimeSeriesData,
  TrainerMetrics,
} from './useBranchAnalytics';