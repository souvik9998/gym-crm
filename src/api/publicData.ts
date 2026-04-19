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

/**
 * Cross-tab cache bust signal. Admin mutations (packages/trainers/settings)
 * call `invalidatePublicDataCache(branchId)` which both clears local
 * sessionStorage and broadcasts a storage event so other open tabs
 * (e.g. a public registration tab) immediately drop their cache too.
 */
const CACHE_BUST_KEY = "__public-data-cache-bust";

export function invalidatePublicDataCache(branchIdentifier?: string): void {
  try {
    if (typeof window === "undefined") return;
    const keys = Object.keys(sessionStorage);
    keys.forEach((key) => {
      if (
        key.startsWith("public-packages-") ||
        key.startsWith("public-trainers-") ||
        key.startsWith("public-branch-") ||
        key.startsWith("public-bootstrap-") ||
        key === "public-default-branch"
      ) {
        if (!branchIdentifier || key.includes(branchIdentifier) || key === "public-default-branch") {
          sessionStorage.removeItem(key);
        }
      }
    });
    // Notify other tabs (storage event only fires across tabs, not same tab).
    localStorage.setItem(CACHE_BUST_KEY, JSON.stringify({ branchIdentifier: branchIdentifier || "*", at: Date.now() }));
  } catch { /* ignore */ }
}

if (typeof window !== "undefined") {
  window.addEventListener("storage", (e) => {
    if (e.key !== CACHE_BUST_KEY || !e.newValue) return;
    try {
      const { branchIdentifier } = JSON.parse(e.newValue);
      const wildcard = !branchIdentifier || branchIdentifier === "*";
      Object.keys(sessionStorage).forEach((key) => {
        if (
          key.startsWith("public-packages-") ||
          key.startsWith("public-trainers-") ||
          key.startsWith("public-branch-") ||
          key.startsWith("public-bootstrap-") ||
          key === "public-default-branch"
        ) {
          if (wildcard || key.includes(branchIdentifier)) {
            sessionStorage.removeItem(key);
          }
        }
      });
    } catch { /* ignore */ }
  });
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

export interface RegistrationBootstrap {
  branch: PublicBranch;
  monthlyPackages: PublicMonthlyPackage[];
  customPackages: PublicCustomPackage[];
  trainers: PublicTrainer[];
  taxSettings?: PublicTaxSettings;
  allowSelfSelectTrainer: boolean;
  allowDailyPass: boolean;
}

/**
 * Unified endpoint that fetches branch info + packages + trainers + tax settings
 * in a SINGLE network round trip. Use this for the registration flow instead of
 * calling fetchPublicBranch + fetchPublicPackages + fetchPublicTrainers separately.
 */
export async function fetchRegistrationBootstrap(branchIdentifier: string): Promise<RegistrationBootstrap | null> {
  const cacheKey = `public-bootstrap-${branchIdentifier}`;
  const cached = getCached<RegistrationBootstrap>(cacheKey);
  if (cached) return cached;

  try {
    const params = new URLSearchParams({ action: "bootstrap", branchId: branchIdentifier });

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
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error || "Failed to fetch registration data");
    }

    const data = await response.json();
    if (!data.branch) return null;

    const result: RegistrationBootstrap = {
      branch: data.branch,
      monthlyPackages: data.monthlyPackages || [],
      customPackages: data.customPackages || [],
      trainers: data.trainers || [],
      taxSettings: data.taxSettings,
      allowSelfSelectTrainer: data.allowSelfSelectTrainer !== false,
      allowDailyPass: data.allowDailyPass !== false,
    };

    setCache(cacheKey, result);

    // Warm individual caches so older callers (Index page, Register page) get
    // instant hits without firing additional requests.
    setCache(`public-branch-${branchIdentifier}`, result.branch);
    if (result.branch.id && result.branch.id !== branchIdentifier) {
      setCache(`public-branch-${result.branch.id}`, result.branch);
    }
    setCache(`public-packages-${result.branch.id}`, {
      monthlyPackages: result.monthlyPackages,
      customPackages: result.customPackages,
      taxSettings: result.taxSettings,
      allowSelfSelectTrainer: result.allowSelfSelectTrainer,
      allowDailyPass: result.allowDailyPass,
    });
    setCache(`public-trainers-${result.branch.id}`, result.trainers);

    return result;
  } catch (error) {
    console.error("Error fetching registration bootstrap:", error);
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
