import { useQuery, useQueryClient, useMutation, UseQueryOptions } from "@tanstack/react-query";
import { useCallback, useRef, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

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

// Stale times for different data types (in milliseconds)
export const STALE_TIMES = {
  STATIC: 1000 * 60 * 30, // 30 minutes for rarely changing data
  SEMI_STATIC: 1000 * 60 * 10, // 10 minutes for packages, trainers
  DYNAMIC: 1000 * 60 * 2, // 2 minutes for members, payments
  REAL_TIME: 1000 * 30, // 30 seconds for dashboard stats
} as const;

// Local storage persistence keys
const CACHE_STORAGE_KEY = "gym-crm-cache";
const CACHE_TIMESTAMP_KEY = "gym-crm-cache-timestamp";
const CACHE_MAX_AGE = 1000 * 60 * 60 * 24; // 24 hours

interface CacheData {
  [key: string]: any;
}

// Persist cache to localStorage
export const persistCache = (key: string, data: any) => {
  try {
    const existing = localStorage.getItem(CACHE_STORAGE_KEY);
    const cache: CacheData = existing ? JSON.parse(existing) : {};
    cache[key] = data;
    localStorage.setItem(CACHE_STORAGE_KEY, JSON.stringify(cache));
    localStorage.setItem(CACHE_TIMESTAMP_KEY, Date.now().toString());
  } catch (error) {
    console.warn("Failed to persist cache:", error);
  }
};

// Get cached data from localStorage
export const getCachedData = <T>(key: string): T | null => {
  try {
    const timestamp = localStorage.getItem(CACHE_TIMESTAMP_KEY);
    if (timestamp && Date.now() - parseInt(timestamp) > CACHE_MAX_AGE) {
      localStorage.removeItem(CACHE_STORAGE_KEY);
      localStorage.removeItem(CACHE_TIMESTAMP_KEY);
      return null;
    }
    const cache = localStorage.getItem(CACHE_STORAGE_KEY);
    if (cache) {
      const parsed = JSON.parse(cache);
      return parsed[key] || null;
    }
  } catch (error) {
    console.warn("Failed to read cache:", error);
  }
  return null;
};

// Clear specific cache key
export const clearCache = (key?: string) => {
  try {
    if (key) {
      const existing = localStorage.getItem(CACHE_STORAGE_KEY);
      if (existing) {
        const cache = JSON.parse(existing);
        delete cache[key];
        localStorage.setItem(CACHE_STORAGE_KEY, JSON.stringify(cache));
      }
    } else {
      localStorage.removeItem(CACHE_STORAGE_KEY);
      localStorage.removeItem(CACHE_TIMESTAMP_KEY);
    }
  } catch (error) {
    console.warn("Failed to clear cache:", error);
  }
};

/**
 * Hook to use cached query with automatic persistence
 */
export function useCachedQuery<T>(
  key: string[],
  fetcher: () => Promise<T>,
  options?: Omit<UseQueryOptions<T, Error>, "queryKey" | "queryFn">
) {
  const cacheKey = key.join("-");
  
  return useQuery<T, Error>({
    queryKey: key,
    queryFn: async () => {
      const data = await fetcher();
      persistCache(cacheKey, data);
      return data;
    },
    initialData: () => getCachedData<T>(cacheKey) ?? undefined,
    staleTime: STALE_TIMES.DYNAMIC,
    gcTime: 1000 * 60 * 30, // Keep in cache for 30 minutes
    refetchOnWindowFocus: false,
    ...options,
  });
}

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
    clearCache(`${CACHE_KEYS.MEMBERS}-`);
    clearCache(CACHE_KEYS.DASHBOARD_STATS);
  }, [invalidate]);

  const invalidatePayments = useCallback(() => {
    invalidate([CACHE_KEYS.PAYMENTS, CACHE_KEYS.DASHBOARD_STATS, CACHE_KEYS.LEDGER]);
    clearCache(`${CACHE_KEYS.PAYMENTS}-`);
    clearCache(CACHE_KEYS.DASHBOARD_STATS);
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
    clearCache(CACHE_KEYS.STAFF);
  }, [invalidate]);

  const invalidateAll = useCallback(() => {
    queryClient.invalidateQueries();
    clearCache();
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

/**
 * Hook to track if component is mounted (for async operations)
 */
export function useIsMounted() {
  const isMounted = useRef(true);

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);

  return isMounted;
}
