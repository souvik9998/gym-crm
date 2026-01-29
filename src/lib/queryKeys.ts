/**
 * Centralized Query Keys for TanStack Query
 * All query keys are defined here for consistency and reusability
 */

export const queryKeys = {
  // Dashboard
  dashboardStats: (branchId?: string) => ['dashboard-stats', branchId || 'all'] as const,
  
  // Members
  members: {
    all: (branchId?: string) => ['members', branchId || 'all'] as const,
    detail: (memberId: string) => ['members', 'detail', memberId] as const,
    subscriptions: (memberId: string) => ['members', 'subscriptions', memberId] as const,
  },
  
  // Payments
  payments: {
    all: (branchId?: string) => ['payments', branchId || 'all'] as const,
    detail: (paymentId: string) => ['payments', 'detail', paymentId] as const,
  },
  
  // Daily Pass
  dailyPass: {
    users: (branchId?: string) => ['daily-pass-users', branchId || 'all'] as const,
    detail: (userId: string) => ['daily-pass-users', 'detail', userId] as const,
  },
  
  // Subscriptions
  subscriptions: {
    all: (branchId?: string) => ['subscriptions', branchId || 'all'] as const,
    member: (memberId: string) => ['subscriptions', 'member', memberId] as const,
  },
  
  // PT Subscriptions
  ptSubscriptions: {
    all: (branchId?: string) => ['pt-subscriptions', branchId || 'all'] as const,
    member: (memberId: string) => ['pt-subscriptions', 'member', memberId] as const,
  },
  
  // Packages
  packages: {
    monthly: (branchId?: string) => ['monthly-packages', branchId || 'all'] as const,
    custom: (branchId?: string) => ['custom-packages', branchId || 'all'] as const,
  },
  
  // Trainers
  trainers: {
    all: (branchId?: string) => ['trainers', branchId || 'all'] as const,
    detail: (trainerId: string) => ['trainers', 'detail', trainerId] as const,
  },
  
  // Branches
  branches: {
    all: () => ['branches'] as const,
    detail: (branchId: string) => ['branches', branchId] as const,
  },
  
  // Staff
  staff: {
    all: () => ['staff'] as const,
    detail: (staffId: string) => ['staff', staffId] as const,
    permissions: (staffId: string) => ['staff', 'permissions', staffId] as const,
  },
  
  // Ledger
  ledger: {
    entries: (branchId?: string) => ['ledger', branchId || 'all'] as const,
  },
  
  // Settings
  gymSettings: (branchId?: string) => ['gym-settings', branchId || 'all'] as const,
  
  // Activity Logs
  activityLogs: {
    admin: (branchId?: string) => ['admin-activity-logs', branchId || 'all'] as const,
    user: (branchId?: string) => ['user-activity-logs', branchId || 'all'] as const,
    staff: (staffId?: string) => ['staff-activity-logs', staffId || 'all'] as const,
  },
  
  // WhatsApp
  whatsapp: {
    notifications: (branchId?: string) => ['whatsapp-notifications', branchId || 'all'] as const,
  },
} as const;

/**
 * Helper to get all keys that should be invalidated for a data type
 */
export const invalidationGroups = {
  members: (branchId?: string) => [
    queryKeys.members.all(branchId),
    queryKeys.dashboardStats(branchId),
    queryKeys.subscriptions.all(branchId),
  ],
  payments: (branchId?: string) => [
    queryKeys.payments.all(branchId),
    queryKeys.dashboardStats(branchId),
    queryKeys.ledger.entries(branchId),
  ],
  dailyPass: (branchId?: string) => [
    queryKeys.dailyPass.users(branchId),
    queryKeys.dashboardStats(branchId),
  ],
  settings: (branchId?: string) => [
    queryKeys.gymSettings(branchId),
    queryKeys.packages.monthly(branchId),
    queryKeys.packages.custom(branchId),
    queryKeys.trainers.all(branchId),
  ],
  staff: () => [
    queryKeys.staff.all(),
  ],
};
