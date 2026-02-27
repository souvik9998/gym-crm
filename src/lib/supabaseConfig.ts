/**
 * Centralized Supabase Configuration
 * 
 * All API calls (auth, REST, edge functions) go through the custom domain.
 * The custom domain must be proxied via Cloudflare (orange-cloud enabled)
 * to handle SSL termination properly.
 */

// Custom domain for ALL API calls — proxied via Cloudflare to Supabase
export const SUPABASE_URL = "https://api.gymkloud.in";
export const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5oZmdod3dwbnFvYXloc2l0cW1wIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc1NDExNTEsImV4cCI6MjA4MzExNzE1MX0.QMq4tpsNiKxX5lT4eyfMrNT6OtnPsm_CouOowDA5m1g";

/**
 * Get the full URL for an edge function
 */
export function getEdgeFunctionUrl(functionName: string): string {
  return `${SUPABASE_URL}/functions/v1/${functionName}`;
}

/**
 * Get standard headers for edge function calls
 */
export function getEdgeFunctionHeaders(authToken?: string): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    apikey: SUPABASE_ANON_KEY,
  };
  
  if (authToken) {
    headers.Authorization = `Bearer ${authToken}`;
  }
  
  return headers;
}
