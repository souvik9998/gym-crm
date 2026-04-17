/**
 * Public Data API
 * 
 * Fetches minimal, safe data for public registration flows.
 * Uses the public-data edge function which doesn't require authentication.
 * Includes sessionStorage caching to avoid redundant API calls.
 */

import { SUPABASE_ANON_KEY, getEdgeFunctionUrl } from "@/lib/supabaseConfig";

export interface PublicMonthlyPackage {
  id: string;
  months: number;
  price: number;
  joining_fee: number;
}

export interface PublicCustomPackage {
  id: string;
  name: string;
  duration_days: number;
  price: number;
}

export interface PublicTrainer {
  id: string;
  name: string;
  monthly_fee: number;
}

export interface PublicBranch {
  id: string;
  name: string;
  logo_url?: string | null;
  slug?: string | null;
  registrationFieldSettings?: Record<string, any>;
  allowSelfSelectTrainer?: boolean;
  allowDailyPass?: boolean;
}

const CACHE_TTL = 5 * 60 * 1000;
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

try {
  if (typeof window !== "undefined" && !sessionStorage.getItem("__public-data-cache-purged-v2")) {
    ["public-packages-all", "public-trainers-all"].forEach((k) => sessionStorage.removeItem(k));
    Object.keys(sessionStorage)
      .filter((key) => key.startsWith("branch-info-"))
      .forEach((key) => {
        try {
          const raw = sessionStorage.getItem(key);
          if (!raw) return;
          const parsed = JSON.parse(raw);
          if (!parsed?.id || !UUID_REGEX.test(parsed.id)) {
            sessionStorage.removeItem(key);
          }
        } catch {
          sessionStorage.removeItem(key);
        }
      });
    sessionStorage.setItem("__public-data-cache-purged-v2", "1");
  }
} catch { /* ignore */ }

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

function getCached<T>(key: string): T | null {
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    const entry: CacheEntry<T> = JSON.parse(raw);
    if (Date.now() - entry.timestamp > CACHE_TTL) {
      sessionStorage.removeItem(key);
      return null;
    }
    return entry.data;
  } catch {
    return null;
  }
}

function setCache<T>(key: string, data: T): void {
  try {
    const entry: CacheEntry<T> = { data, timestamp: Date.now() };
    sessionStorage.setItem(key, JSON.stringify(entry));
  } catch { /* storage full, ignore */ }
}

export interface PublicTaxSettings {
  taxRate: number;
  taxEnabled: boolean;
  gymGst: string;
}

export async function fetchPublicPackages(branchId?: string): Promise<{
  monthlyPackages: PublicMonthlyPackage[];
  customPackages: PublicCustomPackage[];
  taxSettings?: PublicTaxSettings;
  allowSelfSelectTrainer?: boolean;
  allowDailyPass?: boolean;
}> {
  if (!branchId) {
    console.warn("[fetchPublicPackages] called without branchId — returning empty result to preserve tenant isolation");
    return { monthlyPackages: [], customPackages: [] };
  }
  const cacheKey = `public-packages-${branchId}`;
  const cached = getCached<{
    monthlyPackages: PublicMonthlyPackage[];
    customPackages: PublicCustomPackage[];
    taxSettings?: PublicTaxSettings;
    allowSelfSelectTrainer?: boolean;
    allowDailyPass?: boolean;
  }>(cacheKey);
  if (cached) return cached;

  try {
    const params = new URLSearchParams({ action: "packages", branchId });

    const response = await fetch(`${getEdgeFunctionUrl("public-data")}?${params.toString()}`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      },
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || "Failed to fetch packages");
    }

    const data = await response.json();
    const result = {
      monthlyPackages: data.monthlyPackages || [],
      customPackages: data.customPackages || [],
      taxSettings: data.taxSettings || undefined,
      allowSelfSelectTrainer: data.allowSelfSelectTrainer !== false,
      allowDailyPass: data.allowDailyPass !== false,
    };
    setCache(cacheKey, result);
    return result;
  } catch (error) {
    console.error("Error fetching public packages:", error);
    return { monthlyPackages: [], customPackages: [] };
  }
}

export async function fetchPublicTrainers(branchId?: string): Promise<PublicTrainer[]> {
  if (!branchId) {
    console.warn("[fetchPublicTrainers] called without branchId — returning empty result to preserve tenant isolation");
    return [];
  }
  const cacheKey = `public-trainers-${branchId}`;
  const cached = getCached<PublicTrainer[]>(cacheKey);
  if (cached) return cached;

  try {
    const params = new URLSearchParams({ action: "trainers", branchId });

    const response = await fetch(`${getEdgeFunctionUrl("public-data")}?${params.toString()}`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      },
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || "Failed to fetch trainers");
    }

    const data = await response.json();
    const trainers = data.trainers || [];
    setCache(cacheKey, trainers);
    return trainers;
  } catch (error) {
    console.error("Error fetching public trainers:", error);
    return [];
  }
}

export async function fetchPublicBranch(branchIdentifier: string): Promise<PublicBranch | null> {
  const cacheKey = `public-branch-${branchIdentifier}`;
  const cached = getCached<PublicBranch>(cacheKey);
  if (cached) return cached;

  try {
    const params = new URLSearchParams({ action: "branch", branchId: branchIdentifier });

    const response = await fetch(`${getEdgeFunctionUrl("public-data")}?${params.toString()}`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      },
    });

    if (!response.ok) {
      if (response.status === 404) return null;
      const error = await response.json();
      throw new Error(error.error || "Failed to fetch branch");
    }

    const data = await response.json();
    const branch = data.branch || null;
    if (branch) setCache(cacheKey, branch);
    return branch;
  } catch (error) {
    console.error("Error fetching public branch:", error);
    return null;
  }
}

export async function fetchDefaultBranch(): Promise<PublicBranch | null> {
  const cacheKey = "public-default-branch";
  const cached = getCached<PublicBranch>(cacheKey);
  if (cached) return cached;

  try {
    const params = new URLSearchParams({ action: "default-branch" });

    const response = await fetch(`${getEdgeFunctionUrl("public-data")}?${params.toString()}`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      },
    });

    if (!response.ok) {
      if (response.status === 404) return null;
      const error = await response.json();
      throw new Error(error.error || "Failed to fetch default branch");
    }

    const data = await response.json();
    const branch = data.branch || null;
    if (branch) setCache(cacheKey, branch);
    return branch;
  } catch (error) {
    console.error("Error fetching default branch:", error);
    return null;
  }
}
