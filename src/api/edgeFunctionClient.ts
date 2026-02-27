/**
 * Edge Function Client
 * 
 * Drop-in replacement for supabase.functions.invoke() that routes
 * ALL requests through the custom domain (api.gymkloud.in) instead
 * of the direct Supabase URL (*.supabase.co).
 * 
 * This eliminates "Provisional headers shown" errors on networks
 * that block *.supabase.co domains.
 */

import { supabase } from "@/integrations/supabase/client";
import { SUPABASE_ANON_KEY, getEdgeFunctionUrl } from "@/lib/supabaseConfig";

interface InvokeOptions {
  body?: Record<string, unknown>;
  headers?: Record<string, string>;
  method?: "GET" | "POST";
}

interface InvokeResult<T = unknown> {
  data: T | null;
  error: Error | null;
}

/**
 * Invoke an edge function through the custom domain.
 * 
 * Usage (mirrors supabase.functions.invoke):
 *   const { data, error } = await invokeEdgeFunction("send-whatsapp", { body: { ... } });
 *   const { data, error } = await invokeEdgeFunction("staff-auth?action=set-password", { body: { ... } });
 */
export async function invokeEdgeFunction<T = unknown>(
  functionPath: string,
  options?: InvokeOptions
): Promise<InvokeResult<T>> {
  try {
    // Split function name and query string (e.g. "staff-auth?action=set-password")
    const [functionName, queryString] = functionPath.split("?");
    let url = getEdgeFunctionUrl(functionName);
    if (queryString) {
      url += `?${queryString}`;
    }

    // Get auth token
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token;

    // Build headers
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      apikey: SUPABASE_ANON_KEY,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options?.headers || {}),
    };

    // If caller provided an explicit Authorization header, use that instead
    if (options?.headers?.Authorization) {
      headers.Authorization = options.headers.Authorization;
    }

    const response = await fetch(url, {
      method: options?.method || (options?.body ? "POST" : "GET"),
      headers,
      body: options?.body ? JSON.stringify(options.body) : undefined,
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: `HTTP ${response.status}` }));
      return { data: null, error: new Error(errorData.error || errorData.message || `HTTP ${response.status}`) };
    }

    const data = await response.json();
    return { data: data as T, error: null };
  } catch (err) {
    return { data: null, error: err instanceof Error ? err : new Error(String(err)) };
  }
}
