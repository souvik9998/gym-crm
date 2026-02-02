/**
 * Centralized Supabase Configuration
 * 
 * This file contains the hardcoded credentials for the independent Supabase project.
 * Used by API functions that need to call edge functions directly.
 */

// Independent Supabase project: ydswesigiavvgllqrbze
export const SUPABASE_URL = "https://ydswesigiavvgllqrbze.supabase.co";
export const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inlkc3dlc2lnaWF2dmdsbHFyYnplIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc2MjA1NzUsImV4cCI6MjA4MzE5NjU3NX0.onumG_DlX_Ud4eBWsnqhhX-ZPhrfmYXBA5tNftSJD84";

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
