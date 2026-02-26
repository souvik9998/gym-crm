import { QueryClient } from "@tanstack/react-query";

// Stale times for different data types (in milliseconds)
// DISABLED CACHING: Set to 0 for immediate refetch
export const STALE_TIMES = {
  STATIC: 0, // No caching for now
  SEMI_STATIC: 0, // No caching for now
  DYNAMIC: 0, // No caching - always fresh
  REAL_TIME: 0, // No caching - always fresh
} as const;

// Cache time (gcTime) - 1 minute (minimal)
export const GC_TIME = 1000 * 60;

// Create QueryClient without persistence
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // No stale time - always refetch
      staleTime: 0,
      // Minimal cache time
      gcTime: GC_TIME,
      // Don't refetch on window focus
      refetchOnWindowFocus: false,
      // Don't refetch on reconnect automatically
      refetchOnReconnect: false,
      // Retry failed requests with exponential backoff
      retry: 2,
      retryDelay: (attemptIndex) => Math.min(1500 * 2 ** attemptIndex, 15000),
    },
    mutations: {
      // Retry failed mutations once
      retry: 1,
    },
  },
});
