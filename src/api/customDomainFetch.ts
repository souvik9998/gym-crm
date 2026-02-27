/**
 * Custom Domain API Utilities
 * 
 * Replaces supabase.functions.invoke() and supabase.rpc() calls
 * with direct fetch() calls through the custom domain api.gymkloud.in
 * to avoid CORS/provisional header issues on mobile networks.
 */

import { SUPABASE_ANON_KEY, getEdgeFunctionUrl } from "@/lib/supabaseConfig";
import { supabase } from "@/integrations/supabase/client";

/**
 * Invoke an edge function via the custom domain instead of the SDK.
 * Drop-in replacement for supabase.functions.invoke().
 */
export async function invokeEdgeFunction<T = any>(
  functionName: string,
  options?: {
    body?: any;
    headers?: Record<string, string>;
    method?: string;
  }
): Promise<{ data: T | null; error: Error | null }> {
  try {
    // Get auth token if available
    let authToken: string | null = null;
    try {
      const { data: { session } } = await supabase.auth.getSession();
      authToken = session?.access_token || null;
    } catch {
      // No auth available - proceed without
    }

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      apikey: SUPABASE_ANON_KEY,
      ...(authToken ? { Authorization: `Bearer ${authToken}` } : { Authorization: `Bearer ${SUPABASE_ANON_KEY}` }),
      ...(options?.headers || {}),
    };

    const response = await fetch(getEdgeFunctionUrl(functionName), {
      method: options?.method || "POST",
      headers,
      body: options?.body ? JSON.stringify(options.body) : undefined,
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: `HTTP ${response.status}` }));
      return { data: null, error: new Error(errorData.error || errorData.message || `HTTP ${response.status}`) };
    }

    const data = await response.json();
    return { data, error: null };
  } catch (error) {
    return { data: null, error: error instanceof Error ? error : new Error(String(error)) };
  }
}

/**
 * Call a Postgres RPC function via the custom domain REST API.
 * Drop-in replacement for supabase.rpc() for public-facing pages.
 */
export async function invokeRpc<T = any>(
  functionName: string,
  params?: Record<string, any>
): Promise<{ data: T | null; error: Error | null }> {
  try {
    const SUPABASE_REST_URL = `https://api.gymkloud.in/rest/v1/rpc/${functionName}`;
    
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      Prefer: "return=representation",
    };

    const response = await fetch(SUPABASE_REST_URL, {
      method: "POST",
      headers,
      body: params ? JSON.stringify(params) : "{}",
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: `HTTP ${response.status}` }));
      return { data: null, error: new Error(errorData.message || errorData.error || `HTTP ${response.status}`) };
    }

    const data = await response.json();
    return { data, error: null };
  } catch (error) {
    return { data: null, error: error instanceof Error ? error : new Error(String(error)) };
  }
}

/**
 * Query a table via the custom domain REST API.
 * For simple SELECT queries on public-facing pages.
 */
export async function queryTable<T = any>(
  table: string,
  queryParams: string
): Promise<{ data: T | null; error: Error | null }> {
  try {
    const url = `https://api.gymkloud.in/rest/v1/${table}?${queryParams}`;
    
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    };

    const response = await fetch(url, {
      method: "GET",
      headers,
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: `HTTP ${response.status}` }));
      return { data: null, error: new Error(errorData.message || `HTTP ${response.status}`) };
    }

    const data = await response.json();
    return { data, error: null };
  } catch (error) {
    return { data: null, error: error instanceof Error ? error : new Error(String(error)) };
  }
}
