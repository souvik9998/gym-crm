/**
 * Authenticated Fetch Utility
 * 
 * Provides authenticated API calls to protected edge functions.
 * Automatically includes auth token from admin session or staff session.
 */

import { supabase } from "@/integrations/supabase/client";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;

interface FetchOptions {
  action: string;
  params?: Record<string, string | number | undefined>;
  method?: "GET" | "POST";
  body?: any;
}

/**
 * Get the current authentication token
 * Returns admin JWT or staff session token
 */
export async function getAuthToken(): Promise<string | null> {
  // Check for admin session first
  const { data: { session } } = await supabase.auth.getSession();
  if (session?.access_token) {
    return session.access_token;
  }

  // Check for staff session
  const staffSession = localStorage.getItem("staff_session");
  if (staffSession) {
    try {
      const { token, expiresAt } = JSON.parse(staffSession);
      if (new Date(expiresAt) > new Date()) {
        return token;
      }
    } catch (e) {
      console.error("Error parsing staff session:", e);
    }
  }

  return null;
}

/**
 * Make an authenticated request to the protected-data edge function
 */
export async function protectedFetch<T>(options: FetchOptions): Promise<T> {
  const token = await getAuthToken();
  
  if (!token) {
    throw new Error("Authentication required");
  }

  const params = new URLSearchParams({ action: options.action });
  if (options.params) {
    Object.entries(options.params).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        params.append(key, String(value));
      }
    });
  }

  const response = await fetch(
    `${SUPABASE_URL}/functions/v1/protected-data?${params.toString()}`,
    {
      method: options.method || "GET",
      headers: {
        "Content-Type": "application/json",
        apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        Authorization: `Bearer ${token}`,
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
    }
  );

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: "Request failed" }));
    throw new Error(error.error || `HTTP ${response.status}`);
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
