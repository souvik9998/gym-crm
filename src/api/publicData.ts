/**
 * Public Data API
 * 
 * Fetches minimal, safe data for public registration flows.
 * Uses the public-data edge function which doesn't require authentication.
 */

import { SUPABASE_URL, SUPABASE_ANON_KEY, getEdgeFunctionUrl } from "@/lib/supabaseConfig";

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
}

/**
 * Fetch packages for public registration (minimal data only)
 */
export async function fetchPublicPackages(branchId?: string): Promise<{
  monthlyPackages: PublicMonthlyPackage[];
  customPackages: PublicCustomPackage[];
}> {
  try {
    const params = new URLSearchParams({ action: "packages" });
    if (branchId) params.append("branchId", branchId);

    const response = await fetch(
      `${getEdgeFunctionUrl("public-data")}?${params.toString()}`,
      {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        },
      }
    );

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || "Failed to fetch packages");
    }

    const data = await response.json();
    return {
      monthlyPackages: data.monthlyPackages || [],
      customPackages: data.customPackages || [],
    };
  } catch (error) {
    console.error("Error fetching public packages:", error);
    return { monthlyPackages: [], customPackages: [] };
  }
}

/**
 * Fetch trainers for public registration (name and fee only)
 */
export async function fetchPublicTrainers(branchId?: string): Promise<PublicTrainer[]> {
  try {
    const params = new URLSearchParams({ action: "trainers" });
    if (branchId) params.append("branchId", branchId);

    const response = await fetch(
      `${getEdgeFunctionUrl("public-data")}?${params.toString()}`,
      {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        },
      }
    );

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || "Failed to fetch trainers");
    }

    const data = await response.json();
    return data.trainers || [];
  } catch (error) {
    console.error("Error fetching public trainers:", error);
    return [];
  }
}

/**
 * Fetch branch info for public display (name only)
 */
export async function fetchPublicBranch(branchId: string): Promise<PublicBranch | null> {
  try {
    const params = new URLSearchParams({ action: "branch", branchId });

    const response = await fetch(
      `${getEdgeFunctionUrl("public-data")}?${params.toString()}`,
      {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        },
      }
    );

    if (!response.ok) {
      if (response.status === 404) return null;
      const error = await response.json();
      throw new Error(error.error || "Failed to fetch branch");
    }

    const data = await response.json();
    return data.branch || null;
  } catch (error) {
    console.error("Error fetching public branch:", error);
    return null;
  }
}

/**
 * Fetch default branch for redirects
 */
export async function fetchDefaultBranch(): Promise<PublicBranch | null> {
  try {
    const params = new URLSearchParams({ action: "default-branch" });

    const response = await fetch(
      `${getEdgeFunctionUrl("public-data")}?${params.toString()}`,
      {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        },
      }
    );

    if (!response.ok) {
      if (response.status === 404) return null;
      const error = await response.json();
      throw new Error(error.error || "Failed to fetch default branch");
    }

    const data = await response.json();
    return data.branch || null;
  } catch (error) {
    console.error("Error fetching default branch:", error);
    return null;
  }
}
