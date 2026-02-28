/**
 * Centralized Logout Utility
 * 
 * Clears all localStorage, Zustand stores, and React Query cache
 * to prevent cross-tenant data leakage between sessions.
 */

import { supabase } from "@/integrations/supabase/client";
import { queryClient } from "@/lib/queryClient";

/**
 * List of localStorage keys to clear on logout.
 * Add any new persisted stores here.
 */
const LOGOUT_CLEAR_KEYS = [
  // Zustand stores
  "analytics-store",
  "dashboard-store",
  "dashboard-ui-state",
  "branch-store",
  // Staff session data
  "staff-session",
  "staff-branches",
  "staff-permissions",
  // Branch context
  "admin-current-branch-id",
  // Super admin impersonation
  "superadmin-impersonated-tenant",
  // Any other cached data
  "sb-nhfghwwpnqoayhsitqmp-auth-token",
];

/**
 * Clears all application state (localStorage, React Query cache, etc.)
 * Should be called on logout to prevent data leakage between tenants/users.
 */
export function clearAllAppState(): void {
  // 1. Clear React Query cache
  try {
    queryClient.clear();
  } catch (e) {
    console.error("Failed to clear query cache:", e);
  }

  // 2. Clear specific localStorage keys
  LOGOUT_CLEAR_KEYS.forEach((key) => {
    try {
      localStorage.removeItem(key);
    } catch (e) {
      // Ignore errors (e.g., in SSR or private browsing)
    }
  });

  // 3. Clear any keys that start with common prefixes (catch-all)
  try {
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key) {
        // Clear Supabase auth tokens, Zustand stores, and app-specific keys
        if (
          key.startsWith("sb-") ||
          key.endsWith("-store") ||
          key.startsWith("staff-") ||
          key.startsWith("admin-") ||
          key.startsWith("branch-") ||
          key.startsWith("dashboard-") ||
          key.startsWith("analytics-")
        ) {
          keysToRemove.push(key);
        }
      }
    }
    keysToRemove.forEach((key) => {
      try {
        localStorage.removeItem(key);
      } catch (e) {
        // Ignore
      }
    });
  } catch (e) {
    // Ignore errors
  }
}

/**
 * Full logout: clears state and signs out from Supabase.
 * Returns a promise that resolves when logout is complete.
 */
export async function performFullLogout(): Promise<void> {
  // Clear all app state first
  clearAllAppState();

  // Sign out from Supabase
  try {
    await supabase.auth.signOut();
  } catch (e) {
    console.error("Supabase signOut error:", e);
  }
}
