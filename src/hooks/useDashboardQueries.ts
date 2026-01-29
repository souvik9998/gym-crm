/**
 * @deprecated Use hooks from @/hooks/queries instead
 * This file is kept for backward compatibility during migration
 */

// Re-export from new location
export { 
  useMembersQuery,
  useDailyPassQuery,
  usePaymentsQuery,
} from "@/hooks/queries";

export type { 
  DailyPassUserWithSubscription,
  PaymentWithDetails,
} from "@/hooks/queries";

// Keep the old type exports for backward compatibility
export type { MemberWithSubscription } from "@/api/members";

