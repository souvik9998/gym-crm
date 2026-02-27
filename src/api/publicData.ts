/**
 * Public Data API
 * 
 * Fetches minimal, safe data for public registration flows.
 * ALL calls go through the public-data edge function to avoid
 * CORS issues with the custom domain REST API proxy.
 */

import { SUPABASE_ANON_KEY, getEdgeFunctionUrl } from "@/lib/supabaseConfig";

// ─── Types ──────────────────────────────────────────────────────────────

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

// ─── Internal helpers ───────────────────────────────────────────────────

const publicDataHeaders: Record<string, string> = {
  "Content-Type": "application/json",
  apikey: SUPABASE_ANON_KEY,
  Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
};

async function callPublicData<T>(params: Record<string, string>): Promise<T | null> {
  const qs = new URLSearchParams(params).toString();
  const response = await fetch(`${getEdgeFunctionUrl("public-data")}?${qs}`, {
    method: "GET",
    headers: publicDataHeaders,
  });
  if (!response.ok) {
    if (response.status === 404) return null;
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || `HTTP ${response.status}`);
  }
  return response.json();
}

// ─── Existing helpers ───────────────────────────────────────────────────

export async function fetchPublicPackages(branchId?: string): Promise<{
  monthlyPackages: PublicMonthlyPackage[];
  customPackages: PublicCustomPackage[];
}> {
  try {
    const params: Record<string, string> = { action: "packages" };
    if (branchId) params.branchId = branchId;
    const data = await callPublicData<any>(params);
    return {
      monthlyPackages: data?.monthlyPackages || [],
      customPackages: data?.customPackages || [],
    };
  } catch (error) {
    console.error("Error fetching public packages:", error);
    return { monthlyPackages: [], customPackages: [] };
  }
}

export async function fetchPublicTrainers(branchId?: string): Promise<PublicTrainer[]> {
  try {
    const params: Record<string, string> = { action: "trainers" };
    if (branchId) params.branchId = branchId;
    const data = await callPublicData<any>(params);
    return data?.trainers || [];
  } catch (error) {
    console.error("Error fetching public trainers:", error);
    return [];
  }
}

export async function fetchPublicBranch(branchId: string): Promise<PublicBranch | null> {
  try {
    const data = await callPublicData<any>({ action: "branch", branchId });
    return data?.branch || null;
  } catch (error) {
    console.error("Error fetching public branch:", error);
    return null;
  }
}

export async function fetchDefaultBranch(): Promise<PublicBranch | null> {
  try {
    const data = await callPublicData<any>({ action: "default-branch" });
    return data?.branch || null;
  } catch (error) {
    console.error("Error fetching default branch:", error);
    return null;
  }
}

// ─── New helpers (replace REST API calls) ───────────────────────────────

/**
 * Check if a phone number exists as a member (replaces supabase.rpc("check_phone_exists"))
 */
export async function checkPhoneExists(phone: string, branchId?: string | null): Promise<{
  member_exists: boolean;
  member_id?: string;
  member_name?: string;
  member_phone?: string;
  member_email?: string;
  has_active_subscription?: boolean;
}> {
  try {
    const params: Record<string, string> = { action: "check-phone", phone };
    if (branchId) params.branchId = branchId;
    const data = await callPublicData<any>(params);
    return data?.result || { member_exists: false };
  } catch (error) {
    console.error("Error checking phone:", error);
    throw error;
  }
}

/**
 * Get member subscription info (replaces supabase.rpc("get_member_subscription_info"))
 */
export async function fetchSubscriptionInfo(memberId: string): Promise<{
  subscription_id?: string;
  start_date?: string;
  end_date?: string;
  status?: string;
} | null> {
  try {
    const data = await callPublicData<any>({ action: "subscription-info", memberId });
    return data?.subscription || null;
  } catch (error) {
    console.error("Error fetching subscription info:", error);
    return null;
  }
}

/**
 * Get active gym and PT subscriptions for a member
 * (replaces queryTable("subscriptions") and queryTable("pt_subscriptions"))
 */
export async function fetchMemberSubscriptions(memberId: string): Promise<{
  gymSubscription: { end_date: string } | null;
  ptSubscription: { end_date: string } | null;
}> {
  try {
    const data = await callPublicData<any>({ action: "member-subscriptions", memberId });
    return {
      gymSubscription: data?.gymSubscription || null,
      ptSubscription: data?.ptSubscription || null,
    };
  } catch (error) {
    console.error("Error fetching member subscriptions:", error);
    return { gymSubscription: null, ptSubscription: null };
  }
}

/**
 * Get WhatsApp auto-send settings for a branch
 * (replaces queryTable("gym_settings"))
 */
export async function fetchGymSettings(branchId: string): Promise<{
  whatsapp_auto_send: Record<string, boolean> | null;
}> {
  try {
    const data = await callPublicData<any>({ action: "gym-settings", branchId });
    return { whatsapp_auto_send: data?.whatsapp_auto_send || null };
  } catch (error) {
    console.error("Error fetching gym settings:", error);
    return { whatsapp_auto_send: null };
  }
}
