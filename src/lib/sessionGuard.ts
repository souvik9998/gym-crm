/**
 * Session Guard
 * 
 * Runs BEFORE the React app mounts to detect and clear stale auth sessions
 * that would otherwise trigger infinite refresh_token loops on mobile networks.
 * 
 * The Supabase client's autoRefreshToken retries every ~20s forever when refresh
 * fails. On mobile networks, these requests can silently fail ("Failed to fetch"),
 * blocking the entire app. This guard breaks that loop proactively.
 */

const SUPABASE_STORAGE_KEY = "sb-nhfghwwpnqoayhsitqmp-auth-token";
const REFRESH_FAIL_KEY = "auth-refresh-fail-count";
const MAX_REFRESH_FAILURES = 2;

/**
 * Check if stored session has expired refresh token and clear it.
 * This runs synchronously (localStorage check) + one async refresh attempt.
 */
export async function guardStaleSession(): Promise<void> {
  try {
    const stored = localStorage.getItem(SUPABASE_STORAGE_KEY);
    if (!stored) {
      // No session stored, nothing to guard
      localStorage.removeItem(REFRESH_FAIL_KEY);
      return;
    }

    // Check if we've already failed too many times
    const failCount = parseInt(localStorage.getItem(REFRESH_FAIL_KEY) || "0", 10);
    if (failCount >= MAX_REFRESH_FAILURES) {
      console.warn("[Session Guard] Too many refresh failures, clearing stale session");
      clearStaleSession();
      return;
    }

    // Parse stored session to check expiry
    let parsed: any;
    try {
      parsed = JSON.parse(stored);
    } catch {
      // Corrupt stored data, clear it
      clearStaleSession();
      return;
    }

    const expiresAt = parsed?.expires_at;
    if (expiresAt && typeof expiresAt === "number") {
      const now = Math.floor(Date.now() / 1000);
      // If access token expired more than 1 hour ago, the refresh token
      // is likely also stale — try one refresh with a strict timeout
      if (now - expiresAt > 3600) {
        console.warn("[Session Guard] Session expired >1h ago, attempting one refresh...");
        const refreshed = await attemptRefreshWithTimeout(parsed.refresh_token);
        if (!refreshed) {
          console.warn("[Session Guard] Refresh failed, clearing stale session");
          clearStaleSession();
        } else {
          localStorage.removeItem(REFRESH_FAIL_KEY);
        }
        return;
      }
    }
  } catch (error) {
    console.error("[Session Guard] Error:", error);
    // Don't clear on unexpected errors — let the app try normally
  }
}

/**
 * Attempt a single token refresh with a strict 8-second timeout.
 * Does NOT use the Supabase client (which would trigger its own retry loop).
 */
async function attemptRefreshWithTimeout(refreshToken: string): Promise<boolean> {
  if (!refreshToken) return false;

  const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || "https://nhfghwwpnqoayhsitqmp.supabase.co";
  const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5oZmdod3dwbnFvYXloc2l0cW1wIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc1NDExNTEsImV4cCI6MjA4MzExNzE1MX0.QMq4tpsNiKxX5lT4eyfMrNT6OtnPsm_CouOowDA5m1g";

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 8000);

  try {
    const response = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: SUPABASE_ANON_KEY,
      },
      body: JSON.stringify({ refresh_token: refreshToken }),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      incrementFailCount();
      return false;
    }

    // Success — update the stored session so Supabase client picks it up
    const data = await response.json();
    if (data.access_token && data.refresh_token) {
      localStorage.setItem(
        SUPABASE_STORAGE_KEY,
        JSON.stringify({
          access_token: data.access_token,
          refresh_token: data.refresh_token,
          expires_at: data.expires_at,
          expires_in: data.expires_in,
          token_type: data.token_type,
          user: data.user,
        })
      );
      return true;
    }
    incrementFailCount();
    return false;
  } catch (error: any) {
    clearTimeout(timeoutId);
    incrementFailCount();
    return false;
  }
}

function incrementFailCount(): void {
  const current = parseInt(localStorage.getItem(REFRESH_FAIL_KEY) || "0", 10);
  localStorage.setItem(REFRESH_FAIL_KEY, String(current + 1));
}

function clearStaleSession(): void {
  localStorage.removeItem(SUPABASE_STORAGE_KEY);
  localStorage.removeItem(REFRESH_FAIL_KEY);
  // Also clear any other auth-related keys
  const keysToRemove: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key?.startsWith("sb-")) {
      keysToRemove.push(key);
    }
  }
  keysToRemove.forEach((k) => localStorage.removeItem(k));
}

/**
 * Install a global listener that tracks refresh failures at runtime.
 * If autoRefreshToken keeps failing, this will clear the session after
 * MAX_REFRESH_FAILURES consecutive failures to break the loop.
 */
export function installRefreshFailureGuard(): void {
  let consecutiveFailures = 0;

  // Intercept fetch to detect refresh_token failures
  const originalFetch = window.fetch;
  window.fetch = async function (...args: Parameters<typeof fetch>) {
    const [input] = args;
    const url = typeof input === "string" ? input : input instanceof Request ? input.url : "";

    const isRefreshCall = url.includes("/auth/v1/token") && url.includes("grant_type=refresh_token");

    try {
      const response = await originalFetch.apply(this, args);

      if (isRefreshCall) {
        if (!response.ok) {
          consecutiveFailures++;
          console.warn(`[Refresh Guard] Refresh failed (${consecutiveFailures}/${MAX_REFRESH_FAILURES + 1})`);
          if (consecutiveFailures > MAX_REFRESH_FAILURES) {
            console.error("[Refresh Guard] Too many consecutive refresh failures — clearing stale session");
            clearStaleSession();
            consecutiveFailures = 0;
            // Force reload to login page
            if (!window.location.pathname.includes("/admin/login")) {
              window.location.href = "/admin/login";
            }
          }
        } else {
          consecutiveFailures = 0;
        }
      }

      return response;
    } catch (error) {
      if (isRefreshCall) {
        consecutiveFailures++;
        console.warn(`[Refresh Guard] Refresh network error (${consecutiveFailures}/${MAX_REFRESH_FAILURES + 1})`);
        if (consecutiveFailures > MAX_REFRESH_FAILURES) {
          console.error("[Refresh Guard] Too many consecutive refresh network errors — clearing stale session");
          clearStaleSession();
          consecutiveFailures = 0;
          if (!window.location.pathname.includes("/admin/login")) {
            window.location.href = "/admin/login";
          }
        }
      }
      throw error;
    }
  };
}
