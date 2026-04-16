import { useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { useBranch } from "@/contexts/BranchContext";

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

// Check if PT_SUBSCRIPTIONS already exists, if not this adds it

// Re-export STALE_TIMES from queryClient for backward compatibility
export { STALE_TIMES, GC_TIME } from "@/lib/queryClient";

/**
 * Hook for invalidating related queries after mutations.
 * Uses refetchType: 'all' to force immediate refetch of active queries.
 * Branch-aware - invalidates only current branch queries by default.
 */
export function useInvalidateQueries() {
  const queryClient = useQueryClient();
  const { currentBranch } = useBranch();
  const branchId = currentBranch?.id;

  // Force-invalidate with immediate refetch
  const forceInvalidate = useCallback(
    async (queryKey: string | readonly unknown[]) => {
      const key = typeof queryKey === "string" ? [queryKey] : queryKey;
      await queryClient.invalidateQueries({
        queryKey: key as unknown[],
        refetchType: "all", // Force refetch even if not actively observed
      });
    },
    [queryClient]
  );

  const invalidateMembers = useCallback(async () => {
    await Promise.all([
      forceInvalidate([CACHE_KEYS.MEMBERS]),
      forceInvalidate([CACHE_KEYS.DASHBOARD_STATS]),
      forceInvalidate([CACHE_KEYS.SUBSCRIPTIONS]),
      forceInvalidate(["member-details"]),
      forceInvalidate(["member-payments"]),
    ]);
  }, [forceInvalidate]);

  const invalidatePayments = useCallback(async () => {
    await Promise.all([
      forceInvalidate([CACHE_KEYS.PAYMENTS]),
      forceInvalidate([CACHE_KEYS.DASHBOARD_STATS]),
      forceInvalidate([CACHE_KEYS.LEDGER]),
      forceInvalidate(["ledger-entries"]),
      forceInvalidate(["member-payments"]),
    ]);
  }, [forceInvalidate]);

  const invalidateDailyPass = useCallback(async () => {
    await Promise.all([
      forceInvalidate([CACHE_KEYS.DAILY_PASS_USERS]),
      forceInvalidate([CACHE_KEYS.DASHBOARD_STATS]),
    ]);
  }, [forceInvalidate]);

  const invalidateSettings = useCallback(async () => {
    await Promise.all([
      forceInvalidate([CACHE_KEYS.GYM_SETTINGS]),
      forceInvalidate([CACHE_KEYS.PACKAGES]),
      forceInvalidate([CACHE_KEYS.MONTHLY_PACKAGES]),
      forceInvalidate([CACHE_KEYS.CUSTOM_PACKAGES]),
      forceInvalidate([CACHE_KEYS.TRAINERS]),
      forceInvalidate(["settings-page-data"]),
    ]);
  }, [forceInvalidate]);

  const invalidateStaff = useCallback(async () => {
    await Promise.all([
      forceInvalidate([CACHE_KEYS.STAFF]),
      forceInvalidate(["staff-page-data"]),
    ]);
  }, [forceInvalidate]);

  const invalidatePtSubscriptions = useCallback(async () => {
    await Promise.all([
      forceInvalidate([CACHE_KEYS.PT_SUBSCRIPTIONS]),
      forceInvalidate([CACHE_KEYS.DASHBOARD_STATS]),
      forceInvalidate([CACHE_KEYS.MEMBERS]),
      forceInvalidate([CACHE_KEYS.TRAINERS]),
      forceInvalidate(["staff-page-data"]),
      forceInvalidate(["time-slot-members"]),
    ]);
  }, [forceInvalidate]);

  const invalidateAll = useCallback(() => {
    queryClient.invalidateQueries({ refetchType: "all" });
  }, [queryClient]);

  // Invalidate all cached data for a specific branch (useful when switching branches)
  const invalidateBranch = useCallback(
    async (targetBranchId: string) => {
      const allKeys = Object.values(CACHE_KEYS);
      await Promise.all(
        allKeys.map((key) =>
          queryClient.invalidateQueries({
            queryKey: [key, targetBranchId],
            refetchType: "all",
          })
        )
      );
    },
    [queryClient]
  );

  return {
    invalidate: forceInvalidate,
    invalidateMembers,
    invalidatePayments,
    invalidateDailyPass,
    invalidateSettings,
    invalidateStaff,
    invalidatePtSubscriptions,
    invalidateAll,
    invalidateBranch,
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
