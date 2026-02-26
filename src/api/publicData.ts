/**
 * Public Data API
 * 
 * Fetches minimal, safe data for public registration flows.
 * Uses direct Supabase client queries (no edge function dependency).
 * Tables have public read-only RLS policies for active records.
 * 
 * All calls use resilientCall() for timeout + retry on mobile networks.
 * Successful responses are cached in sessionStorage to avoid blocking UI.
 */

import { supabase } from "@/integrations/supabase/client";
import { resilientCall } from "@/lib/networkUtils";

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
}

// ── SessionStorage cache helpers ───────────────────────────────────
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

function cacheGet<T>(key: string): T | null {
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    const { data, ts } = JSON.parse(raw);
    if (Date.now() - ts > CACHE_TTL_MS) {
      sessionStorage.removeItem(key);
      return null;
    }
    return data as T;
  } catch {
    return null;
  }
}

function cacheSet<T>(key: string, data: T): void {
  try {
    sessionStorage.setItem(key, JSON.stringify({ data, ts: Date.now() }));
  } catch { /* quota exceeded — ignore */ }
}

// ── Public API functions ───────────────────────────────────────────

/**
 * Fetch packages for public registration (minimal data only)
 */
export async function fetchPublicPackages(branchId?: string): Promise<{
  monthlyPackages: PublicMonthlyPackage[];
  customPackages: PublicCustomPackage[];
}> {
  const cacheKey = `pub-pkgs-${branchId || "all"}`;
  const cached = cacheGet<{ monthlyPackages: PublicMonthlyPackage[]; customPackages: PublicCustomPackage[] }>(cacheKey);
  if (cached) return cached;

  try {
    const result = await resilientCall(async () => {
      let monthlyQuery = supabase
        .from("monthly_packages")
        .select("id, months, price, joining_fee")
        .eq("is_active", true);
      if (branchId) monthlyQuery = monthlyQuery.eq("branch_id", branchId);

      let customQuery = supabase
        .from("custom_packages")
        .select("id, name, duration_days, price")
        .eq("is_active", true);
      if (branchId) customQuery = customQuery.eq("branch_id", branchId);

      const [monthlyResult, customResult] = await Promise.all([monthlyQuery, customQuery]);

      if (monthlyResult.error) throw monthlyResult.error;
      if (customResult.error) throw customResult.error;

      return {
        monthlyPackages: (monthlyResult.data as PublicMonthlyPackage[]) || [],
        customPackages: (customResult.data as PublicCustomPackage[]) || [],
      };
    }, { timeoutMs: 10000, retries: 2, retryDelayMs: 1000, label: "Public packages" });

    cacheSet(cacheKey, result);
    return result;
  } catch (error) {
    console.error("Error fetching public packages:", error);
    return { monthlyPackages: [], customPackages: [] };
  }
}

/**
 * Fetch trainers for public registration (name and fee only)
 */
export async function fetchPublicTrainers(branchId?: string): Promise<PublicTrainer[]> {
  const cacheKey = `pub-trainers-${branchId || "all"}`;
  const cached = cacheGet<PublicTrainer[]>(cacheKey);
  if (cached) return cached;

  try {
    const result = await resilientCall(async () => {
      let query = supabase
        .from("personal_trainers")
        .select("id, name, monthly_fee")
        .eq("is_active", true);
      if (branchId) query = query.eq("branch_id", branchId);

      const { data, error } = await query;
      if (error) throw error;
      return (data as PublicTrainer[]) || [];
    }, { timeoutMs: 10000, retries: 2, retryDelayMs: 1000, label: "Public trainers" });

    cacheSet(cacheKey, result);
    return result;
  } catch (error) {
    console.error("Error fetching public trainers:", error);
    return [];
  }
}

/**
 * Fetch branch info for public display (name only)
 */
export async function fetchPublicBranch(branchId: string): Promise<PublicBranch | null> {
  const cacheKey = `pub-branch-${branchId}`;
  const cached = cacheGet<PublicBranch>(cacheKey);
  if (cached) return cached;

  try {
    const result = await resilientCall(async () => {
      const { data, error } = await supabase
        .from("branches")
        .select("id, name")
        .eq("id", branchId)
        .eq("is_active", true)
        .is("deleted_at", null)
        .maybeSingle();

      if (error) throw error;
      return data as PublicBranch | null;
    }, { timeoutMs: 10000, retries: 2, retryDelayMs: 1000, label: "Public branch" });

    if (result) cacheSet(cacheKey, result);
    return result;
  } catch (error) {
    console.error("Error fetching public branch:", error);
    return null;
  }
}

/**
 * Fetch default branch for redirects
 */
export async function fetchDefaultBranch(): Promise<PublicBranch | null> {
  const cacheKey = "pub-default-branch";
  const cached = cacheGet<PublicBranch>(cacheKey);
  if (cached) return cached;

  try {
    const result = await resilientCall(async () => {
      const { data, error } = await supabase
        .from("branches")
        .select("id, name")
        .eq("is_default", true)
        .eq("is_active", true)
        .is("deleted_at", null)
        .maybeSingle();

      if (error) throw error;
      return data as PublicBranch | null;
    }, { timeoutMs: 10000, retries: 2, retryDelayMs: 1000, label: "Default branch" });

    if (result) cacheSet(cacheKey, result);
    return result;
  } catch (error) {
    console.error("Error fetching default branch:", error);
    return null;
  }
}
