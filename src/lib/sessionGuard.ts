/**
 * Session Guard
 * 
 * Synchronous localStorage check to detect and clear stale auth sessions.
 * Runs BEFORE the React app mounts.
 * 
 * This does NOT make any network requests or replace window.fetch.
 * It only checks localStorage for obviously expired sessions and clears them
 * so the Supabase client starts fresh instead of entering an infinite
 * refresh_token retry loop.
 */

const SUPABASE_STORAGE_KEY = "sb-nhfghwwpnqoayhsitqmp-auth-token";

/**
 * Synchronously check if stored session is stale and clear it.
 * A session is considered stale if the access token expired more than 
 * 24 hours ago (refresh tokens are typically valid for much longer, 
 * but after 24h of no activity the session is likely abandoned).
 */
export function guardStaleSession(): void {
  try {
    const stored = localStorage.getItem(SUPABASE_STORAGE_KEY);
    if (!stored) return;

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
      // If access token expired more than 24 hours ago, clear the session.
      // The Supabase client's autoRefreshToken will handle normal short-lived
      // expiries. We only intervene for clearly abandoned sessions.
      if (now - expiresAt > 86400) {
        console.warn("[Session Guard] Session expired >24h ago, clearing stale session");
        clearStaleSession();
      }
    }
  } catch (error) {
    console.error("[Session Guard] Error:", error);
    // Don't clear on unexpected errors — let the app try normally
  }
}

function clearStaleSession(): void {
  const keysToRemove: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key?.startsWith("sb-")) {
      keysToRemove.push(key);
    }
  }
  keysToRemove.forEach((k) => localStorage.removeItem(k));
}
