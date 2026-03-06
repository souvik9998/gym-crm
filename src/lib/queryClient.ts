import { QueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

/**
 * Stale times for different data types (in milliseconds)
 */
export const STALE_TIMES = {
  STATIC: 1000 * 60 * 60,       // 1 hour - branches
  SEMI_STATIC: 1000 * 60 * 5,   // 5 minutes - packages, trainers
  DYNAMIC: 1000 * 30,           // 30 seconds - members, subscriptions
  REAL_TIME: 1000 * 15,         // 15 seconds - dashboard stats, payments
} as const;

// Cache time (gcTime) - how long unused data stays in memory
export const GC_TIME = 1000 * 60 * 30; // 30 minutes

/**
 * Handle rate limit errors globally.
 * Returns true if the error was a rate limit error (handled).
 */
export function handleRateLimitError(error: unknown): boolean {
  if (error instanceof Error && error.message.startsWith("RATE_LIMITED:")) {
    const retryAfter = parseInt(error.message.split(":")[1]) || 30;
    toast.error("Too many requests", {
      description: `Please wait ${retryAfter} seconds and try again.`,
      duration: 5000,
    });
    return true;
  }
  return false;
}

// Create QueryClient with optimized defaults
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: STALE_TIMES.DYNAMIC,
      gcTime: GC_TIME,
      refetchOnWindowFocus: true,
      refetchOnReconnect: true,
      retry: (failureCount, error) => {
        // Don't retry rate-limited requests
        if (error instanceof Error && error.message.startsWith("RATE_LIMITED:")) {
          return false;
        }
        return failureCount < 1;
      },
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
    },
    mutations: {
      retry: (failureCount, error) => {
        if (error instanceof Error && error.message.startsWith("RATE_LIMITED:")) {
          return false;
        }
        return failureCount < 1;
      },
      onError: (error) => {
        handleRateLimitError(error);
      },
    },
  },
});
