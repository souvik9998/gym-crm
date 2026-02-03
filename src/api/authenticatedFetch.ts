/**
 * Authenticated Fetch Utility
 * 
 * Provides authenticated API calls to protected edge functions.
 * Uses Supabase Auth token for both admin and staff sessions.
 */

import { supabase } from "@/integrations/supabase/client";
import { SUPABASE_URL, SUPABASE_ANON_KEY, getEdgeFunctionUrl } from "@/lib/supabaseConfig";

interface FetchOptions {
  action: string;
  params?: Record<string, string | number | undefined>;
  method?: "GET" | "POST";
  body?: any;
}

/**
 * Get the current authentication token from Supabase Auth
 * Works for both admin and staff users
 */
export async function getAuthToken(): Promise<string | null> {
  const { data: { session } } = await supabase.auth.getSession();
  if (session?.access_token) return session.access_token;

  // If the access token is missing/expired, attempt a refresh once.
  // This helps avoid intermittent 401 "Invalid JWT" responses from backend functions.
  const { data: refreshData, error: refreshError } = await supabase.auth.refreshSession();
  if (refreshError) return null;
  return refreshData.session?.access_token || null;
}

/**
 * Make an authenticated request to the protected-data edge function
 */
export async function protectedFetch<T>(options: FetchOptions): Promise<T> {
  const makeRequest = async (token: string) => {
    const params = new URLSearchParams({ action: options.action });
    if (options.params) {
      Object.entries(options.params).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          params.append(key, String(value));
        }
      });
    }

    return fetch(
      `${getEdgeFunctionUrl("protected-data")}?${params.toString()}`,
      {
        method: options.method || "GET",
        headers: {
          "Content-Type": "application/json",
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${token}`,
        },
        body: options.body ? JSON.stringify(options.body) : undefined,
      }
    );
  };

  let token = await getAuthToken();
  if (!token) throw new Error("Authentication required");

  let response = await makeRequest(token);

  if (!response.ok) {
    const parsed = await response.json().catch(() => ({ error: "Request failed" }));

    // If the gateway reports an invalid/expired token, refresh and retry once.
    // NOTE: Some backends return { code: 401, message: "Invalid JWT" }.
    const maybeInvalidJwt =
      response.status === 401 &&
      (parsed?.message === "Invalid JWT" || parsed?.error === "Invalid JWT" || parsed?.code === 401);

    if (maybeInvalidJwt) {
      const { data: refreshed, error: refreshError } = await supabase.auth.refreshSession();
      if (!refreshError && refreshed.session?.access_token) {
        token = refreshed.session.access_token;
        response = await makeRequest(token);
        if (response.ok) return response.json();
      }
    }

    throw new Error(parsed.error || parsed.message || `HTTP ${response.status}`);
  }

  return response.json();
}

/**
 * Check if user is currently authenticated (admin or staff)
 */
export async function isAuthenticated(): Promise<boolean> {
  const token = await getAuthToken();
  return !!token;
}
