import { QueryClient } from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { createSyncStoragePersister } from "@tanstack/query-sync-storage-persister";

// Stale times for different data types (in milliseconds)
export const STALE_TIMES = {
  STATIC: 1000 * 60 * 30, // 30 minutes for rarely changing data
  SEMI_STATIC: 1000 * 60 * 10, // 10 minutes for packages, trainers
  DYNAMIC: 1000 * 60 * 5, // 5 minutes for members, payments (updated per user request)
  REAL_TIME: 1000 * 60 * 5, // 5 minutes for dashboard stats (updated per user request)
} as const;

// Cache time (gcTime) - 30 minutes
export const GC_TIME = 1000 * 60 * 30;

// Create optimized QueryClient
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Data stays fresh for 5 minutes (per user request)
      staleTime: STALE_TIMES.DYNAMIC,
      // Keep unused data in cache for 30 minutes  
      gcTime: GC_TIME,
      // Don't refetch on window focus (per user request)
      refetchOnWindowFocus: false,
      // Don't refetch on reconnect automatically
      refetchOnReconnect: false,
      // Retry failed requests once
      retry: 1,
      // Retry delay
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
    },
    mutations: {
      // Retry failed mutations once
      retry: 1,
    },
  },
});

// Create storage persister for React Query cache
export const queryPersister = createSyncStoragePersister({
  storage: typeof window !== 'undefined' ? window.localStorage : undefined,
  key: "gym-crm-query-cache",
  // Throttle writes to localStorage
  throttleTime: 1000,
});

// Max age for persisted cache - 24 hours
export const PERSIST_MAX_AGE = 1000 * 60 * 60 * 24;

export { PersistQueryClientProvider };
