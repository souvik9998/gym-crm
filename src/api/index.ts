/**
 * API Index - Re-export all API functions
 * This provides a single import point for all API functions
 */

// Members
export * from './members';

// Payments
export * from './payments';

// Daily Pass
export * from './dailyPass';

// Dashboard
export * from './dashboard';

// Activity Logs
export * from './activityLogs';

// Public Data (unauthenticated, minimal data for registration)
export * from './publicData';

// Protected Data (authenticated admin/staff data)
export * from './protectedData';
export { fetchProtectedMembersPaginated, fetchProtectedMember, fetchProtectedDailyPassUsers } from './protectedMembers';
export { fetchProtectedPayments } from './protectedPayments';
export { fetchProtectedLedger } from './protectedLedger';

// Authenticated fetch utility
export { getAuthToken, protectedFetch, isAuthenticated } from './authenticatedFetch';
