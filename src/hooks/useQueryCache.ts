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

// Re-export STALE_TIMES from queryClient for backward compatibility
export { STALE_TIMES, GC_TIME } from "@/lib/queryClient";

/**
 * Hook for invalidating related queries after mutations
 * Now branch-aware - invalidates only current branch queries by default
 */
export function useInvalidateQueries() {
  const queryClient = useQueryClient();
  const { currentBranch } = useBranch();
  const branchId = currentBranch?.id;

  // Invalidate with branch context - only invalidates queries for current branch
  const invalidate = useCallback(
    async (keys: string | string[], allBranches = false) => {
      const keysArray = Array.isArray(keys) ? keys : [keys];
      await Promise.all(
        keysArray.map((key) => {
          if (allBranches) {
            // Invalidate all queries with this key regardless of branch
            return queryClient.invalidateQueries({ queryKey: [key] });
          }
          // Invalidate only queries for current branch
          return queryClient.invalidateQueries({ 
            queryKey: [key, branchId || "all"],
            exact: false 
          });
        })
      );
    },
    [queryClient, branchId]
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
    invalidate([CACHE_KEYS.STAFF], true); // Staff is often cross-branch
  }, [invalidate]);

  const invalidateAll = useCallback(() => {
    queryClient.invalidateQueries();
  }, [queryClient]);

  // Invalidate all cached data for a specific branch (useful when switching branches)
  const invalidateBranch = useCallback(
    async (targetBranchId: string) => {
      const allKeys = Object.values(CACHE_KEYS);
      await Promise.all(
        allKeys.map((key) =>
          queryClient.invalidateQueries({
            queryKey: [key, targetBranchId],
            exact: false,
          })
        )
      );
    },
    [queryClient]
  );

  return {
    invalidate,
    invalidateMembers,
    invalidatePayments,
    invalidateSettings,
    invalidateStaff,
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
