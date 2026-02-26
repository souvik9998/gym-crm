/**
 * Authenticated Fetch Utility
 * 
 * Provides authenticated API calls to protected edge functions.
 * Uses Supabase Auth token for both admin and staff sessions.
 * Includes timeout handling for mobile network resilience.
 */

import { supabase } from "@/integrations/supabase/client";
import { SUPABASE_URL, SUPABASE_ANON_KEY, getEdgeFunctionUrl } from "@/lib/supabaseConfig";
import { withTimeout, AUTH_TIMEOUT_MS, DEFAULT_TIMEOUT_MS } from "@/lib/networkUtils";

interface FetchOptions {
  action: string;
  params?: Record<string, string | number | undefined>;
  method?: "GET" | "POST";
  body?: any;
  timeoutMs?: number;
}

/**
 * Get the current authentication token from Supabase Auth
 * Works for both admin and staff users
 */
export async function getAuthToken(): Promise<string | null> {
  try {
    const { data: { session } } = await withTimeout(
      supabase.auth.getSession(),
      AUTH_TIMEOUT_MS,
      "Get session"
    );
    if (session?.access_token) return session.access_token;

    // If the access token is missing/expired, attempt a refresh once.
    const { data: refreshData, error: refreshError } = await withTimeout(
      supabase.auth.refreshSession(),
      AUTH_TIMEOUT_MS,
      "Refresh session"
    );
    if (refreshError) return null;
    return refreshData.session?.access_token || null;
  } catch (error) {
    console.error("getAuthToken failed:", error);
    return null;
  }
}

/**
 * Make an authenticated request to the protected-data edge function
 */
export async function protectedFetch<T>(options: FetchOptions): Promise<T> {
  const requestTimeout = options.timeoutMs || DEFAULT_TIMEOUT_MS;

  const makeRequest = async (token: string) => {
    const params = new URLSearchParams({ action: options.action });
    if (options.params) {
      Object.entries(options.params).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          params.append(key, String(value));
        }
      });
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), requestTimeout);

    try {
      const response = await fetch(
        `${getEdgeFunctionUrl("protected-data")}?${params.toString()}`,
        {
          method: options.method || "GET",
          headers: {
            "Content-Type": "application/json",
            apikey: SUPABASE_ANON_KEY,
            Authorization: `Bearer ${token}`,
          },
          body: options.body ? JSON.stringify(options.body) : undefined,
          signal: controller.signal,
        }
      );
      clearTimeout(timeoutId);
      return response;
    } catch (error: any) {
      clearTimeout(timeoutId);
      if (error.name === "AbortError") {
        throw new Error(`Request timed out after ${Math.round(requestTimeout / 1000)}s. Please check your network connection.`);
      }
      throw error;
    }
  };

  let token = await getAuthToken();
  if (!token) throw new Error("Authentication required");

  let response = await makeRequest(token);

  if (!response.ok) {
    const parsed = await response.json().catch(() => ({ error: "Request failed" }));

    const maybeInvalidJwt =
      response.status === 401 &&
      (parsed?.message === "Invalid JWT" || parsed?.error === "Invalid JWT" || parsed?.code === 401);

    if (maybeInvalidJwt) {
      try {
        const { data: refreshed, error: refreshError } = await withTimeout(
          supabase.auth.refreshSession(),
          AUTH_TIMEOUT_MS,
          "Token refresh"
        );
        if (!refreshError && refreshed.session?.access_token) {
          token = refreshed.session.access_token;
          response = await makeRequest(token);
          if (response.ok) return response.json();
        }
      } catch {
        // Refresh failed, throw original error
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
