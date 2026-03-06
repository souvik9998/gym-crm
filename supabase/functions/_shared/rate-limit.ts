/**
 * Rate Limiting Middleware for Edge Functions
 * 
 * In-memory sliding window counter. Each Edge Function instance
 * maintains its own Map, which is acceptable for Deno Deploy's
 * request-level isolation model.
 * 
 * Automatic cleanup every 60 seconds prevents memory leaks.
 */

interface RateLimitEntry {
  count: number;
  windowStart: number; // epoch seconds
}

const store = new Map<string, RateLimitEntry>();

// Periodic cleanup of expired entries
let lastCleanup = Math.floor(Date.now() / 1000);
const CLEANUP_INTERVAL = 60; // seconds

function cleanup(windowSeconds: number) {
  const now = Math.floor(Date.now() / 1000);
  if (now - lastCleanup < CLEANUP_INTERVAL) return;
  lastCleanup = now;

  for (const [key, entry] of store) {
    if (now - entry.windowStart > windowSeconds * 2) {
      store.delete(key);
    }
  }
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfter?: number;
}

/**
 * Check rate limit for a given key.
 * @param key - Unique identifier (e.g., IP, IP+action, IP+phone)
 * @param maxRequests - Maximum requests allowed in the window
 * @param windowSeconds - Window duration in seconds
 */
export function checkRateLimit(
  key: string,
  maxRequests: number,
  windowSeconds: number
): RateLimitResult {
  const now = Math.floor(Date.now() / 1000);
  cleanup(windowSeconds);

  const entry = store.get(key);

  if (!entry || now - entry.windowStart >= windowSeconds) {
    // New window
    store.set(key, { count: 1, windowStart: now });
    return { allowed: true, remaining: maxRequests - 1 };
  }

  entry.count++;

  if (entry.count > maxRequests) {
    const retryAfter = windowSeconds - (now - entry.windowStart);
    return { allowed: false, remaining: 0, retryAfter };
  }

  return { allowed: true, remaining: maxRequests - entry.count };
}

/**
 * Extract client IP from request headers.
 */
export function getClientIP(req: Request): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    req.headers.get("cf-connecting-ip") ||
    "unknown"
  );
}

/**
 * Create a 429 Too Many Requests response with CORS headers.
 */
export function rateLimitResponse(
  retryAfter: number,
  corsHeaders: Record<string, string>
): Response {
  return new Response(
    JSON.stringify({
      error: "Too many requests. Please slow down and try again.",
      retryAfter,
    }),
    {
      status: 429,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
        "Retry-After": String(retryAfter),
      },
    }
  );
}

/**
 * Convenience: run rate limit check and return Response if blocked, or null if allowed.
 */
export function enforceRateLimit(
  req: Request,
  keySuffix: string,
  maxRequests: number,
  windowSeconds: number,
  corsHeaders: Record<string, string>
): Response | null {
  const ip = getClientIP(req);
  const key = `${ip}:${keySuffix}`;
  const result = checkRateLimit(key, maxRequests, windowSeconds);

  if (!result.allowed) {
    console.warn(`Rate limit exceeded: ${key} (${maxRequests}/${windowSeconds}s)`);
    return rateLimitResponse(result.retryAfter || windowSeconds, corsHeaders);
  }

  return null;
}
