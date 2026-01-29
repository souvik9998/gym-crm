import { useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";

// Cache keys for different data types
export const CACHE_KEYS = {
  MEMBERS: "members",
  PAYMENTS: "payments",
  SUBSCRIPTIONS: "subscriptions",
  DASHBOARD_STATS: "dashboard-stats",
  BRANCHES: "branches",
  TRAINERS: "trainers",
  PACKAGES: "packages",
  MONTHLY_PACKAGES: "monthly-packages",
  CUSTOM_PACKAGES: "custom-packages",
  DAILY_PASS_USERS: "daily-pass-users",
  GYM_SETTINGS: "gym-settings",
  STAFF: "staff",
  LEDGER: "ledger",
  PT_SUBSCRIPTIONS: "pt-subscriptions",
} as const;

// Re-export STALE_TIMES from queryClient for backward compatibility
export { STALE_TIMES, GC_TIME } from "@/lib/queryClient";

/**
 * Hook for invalidating related queries after mutations
 */
export function useInvalidateQueries() {
  const queryClient = useQueryClient();

  const invalidate = useCallback(
    async (keys: string | string[]) => {
      const keysArray = Array.isArray(keys) ? keys : [keys];
      await Promise.all(
        keysArray.map((key) =>
          queryClient.invalidateQueries({ queryKey: [key] })
        )
      );
    },
    [queryClient]
  );

  const invalidateMembers = useCallback(() => {
    invalidate([CACHE_KEYS.MEMBERS, CACHE_KEYS.DASHBOARD_STATS, CACHE_KEYS.SUBSCRIPTIONS]);
  }, [invalidate]);

  const invalidatePayments = useCallback(() => {
    invalidate([CACHE_KEYS.PAYMENTS, CACHE_KEYS.DASHBOARD_STATS, CACHE_KEYS.LEDGER]);
  }, [invalidate]);

  const invalidateSettings = useCallback(() => {
    invalidate([
      CACHE_KEYS.GYM_SETTINGS,
      CACHE_KEYS.PACKAGES,
      CACHE_KEYS.MONTHLY_PACKAGES,
      CACHE_KEYS.CUSTOM_PACKAGES,
      CACHE_KEYS.TRAINERS,
    ]);
  }, [invalidate]);

  const invalidateStaff = useCallback(() => {
    invalidate([CACHE_KEYS.STAFF]);
  }, [invalidate]);

  const invalidateAll = useCallback(() => {
    queryClient.invalidateQueries();
  }, [queryClient]);

  return {
    invalidate,
    invalidateMembers,
    invalidatePayments,
    invalidateSettings,
    invalidateStaff,
    invalidateAll,
  };
}

/**
 * Request deduplication - prevents duplicate concurrent requests
 */
const pendingRequests = new Map<string, Promise<any>>();

export async function deduplicatedFetch<T>(
  key: string,
  fetcher: () => Promise<T>
): Promise<T> {
  if (pendingRequests.has(key)) {
    return pendingRequests.get(key) as Promise<T>;
  }

  const promise = fetcher().finally(() => {
    pendingRequests.delete(key);
  });

  pendingRequests.set(key, promise);
  return promise;
}
