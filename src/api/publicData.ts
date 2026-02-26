/**
 * Public Data API
 * 
 * Fetches minimal, safe data for public registration flows.
 * Uses direct Supabase client queries (no edge function dependency).
 * Tables have public read-only RLS policies for active records.
 */

import { supabase } from "@/integrations/supabase/client";

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

/**
 * Fetch packages for public registration (minimal data only)
 */
export async function fetchPublicPackages(branchId?: string): Promise<{
  monthlyPackages: PublicMonthlyPackage[];
  customPackages: PublicCustomPackage[];
}> {
  try {
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

    return {
      monthlyPackages: (monthlyResult.data as PublicMonthlyPackage[]) || [],
      customPackages: (customResult.data as PublicCustomPackage[]) || [],
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
    let query = supabase
      .from("personal_trainers")
      .select("id, name, monthly_fee")
      .eq("is_active", true);
    if (branchId) query = query.eq("branch_id", branchId);

    const { data, error } = await query;
    if (error) throw error;
    return (data as PublicTrainer[]) || [];
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
    const { data, error } = await supabase
      .from("branches")
      .select("id, name")
      .eq("id", branchId)
      .eq("is_active", true)
      .is("deleted_at", null)
      .maybeSingle();

    if (error) throw error;
    return data as PublicBranch | null;
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
    const { data, error } = await supabase
      .from("branches")
      .select("id, name")
      .eq("is_default", true)
      .eq("is_active", true)
      .is("deleted_at", null)
      .maybeSingle();

    if (error) throw error;
    return data as PublicBranch | null;
  } catch (error) {
    console.error("Error fetching default branch:", error);
    return null;
  }
}
