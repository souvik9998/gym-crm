import { QueryClient } from "@tanstack/react-query";

/**
 * Stale times for different data types (in milliseconds)
 * 
 * STATIC: Data that rarely changes (gym details, plans, branches, settings)
 * SEMI_STATIC: Data that changes occasionally (packages, trainers list)
 * DYNAMIC: Data that changes with user actions (members list, subscriptions)
 * REAL_TIME: Data that must always be fresh (dashboard stats, live payments)
 */
export const STALE_TIMES = {
  STATIC: 1000 * 60 * 10,      // 10 minutes - gym settings, branches, plans
  SEMI_STATIC: 1000 * 60 * 5,  // 5 minutes - packages, trainers
  DYNAMIC: 1000 * 60 * 2,      // 2 minutes - members, subscriptions
  REAL_TIME: 1000 * 30,         // 30 seconds - dashboard stats, payments
} as const;

// Cache time (gcTime) - how long unused data stays in memory
export const GC_TIME = 1000 * 60 * 30; // 30 minutes

// Create QueryClient with optimized defaults
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Default to DYNAMIC stale time (components override per data type)
      staleTime: STALE_TIMES.DYNAMIC,
      // Keep unused data in memory for 30 minutes
      gcTime: GC_TIME,
      // Don't refetch on window focus (use explicit invalidation instead)
      refetchOnWindowFocus: false,
      // Don't refetch on reconnect automatically
      refetchOnReconnect: false,
      // Retry failed requests once
      retry: 1,
      // Retry delay with exponential backoff
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
    },
    mutations: {
      retry: 1,
    },
  },
});
