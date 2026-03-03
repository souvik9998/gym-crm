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

// Analytics (aggregated - single API call)
export {
  useAggregatedAnalyticsQuery,
  useAggregatedAnalyticsTotals,
  useAggregatedAnalyticsRevenue,
  useAggregatedAnalyticsMemberGrowth,
  useAggregatedAnalyticsTrainerStats,
  useAggregatedAnalyticsPackageSales,
} from './useAnalyticsData';
export type {
  AnalyticsData,
  AnalyticsTotals,
  MonthlyRevenue,
  MemberGrowth,
  TrainerStats,
  PackageSalesData,
  PackageInfo,
} from './useAnalyticsData';

// Legacy Analytics (kept for backward compat)
export {
  useAnalyticsQuery,
  useAnalyticsTotals,
  useAnalyticsRevenue,
  useAnalyticsMemberGrowth,
  useAnalyticsTrainerStats,
  useAnalyticsPackageSales,
} from './useAnalytics';

// Branch Analytics
export {
  useBranchAnalyticsData,
  useBranchTimeSeriesQuery,
} from './useBranchAnalytics';
export type {
  BranchMetrics,
  Insight,
  TimeSeriesData,
  TrainerMetrics,
} from './useBranchAnalytics';

// Log Stats (aggregated - single API call per tab)
export {
  useAdminLogStats,
  useUserLogStats,
  useStaffLogStats,
  useWhatsAppLogStats,
} from './useLogStats';
export type {
  AdminLogStats,
  UserLogStats,
  StaffLogStats,
  WhatsAppLogStats,
} from './useLogStats';

// Settings Page Data (aggregated - single API call)
export { useSettingsPageData } from './useSettingsPageData';
export type { GymSettings, MonthlyPackage, CustomPackage } from './useSettingsPageData';