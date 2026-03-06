

# Rate Limiting Plan for Gym SaaS Application

## Context
The app serves ~100 gyms with ~200 members each (~20,000 total users). All backend logic flows through 11 Edge Functions. Rate limiting must protect against brute-force attacks, API abuse, and denial-of-service without impacting legitimate usage.

## Architecture

Rate limiting will be implemented as a **shared middleware layer** in the Edge Functions (`_shared/rate-limit.ts`), using an **in-memory Map** per function instance with automatic cleanup. This is the most practical approach for Deno Edge Functions — no external dependencies, no database overhead.

```text
Client Request
     │
     ▼
┌─────────────┐
│ CORS check  │
└──────┬──────┘
       ▼
┌──────────────────┐
│  Rate Limiter    │  ← IP + action key
│  (in-memory Map) │  ← sliding window
└──────┬───────────┘
       │ pass / reject (429)
       ▼
┌──────────────┐
│ Auth + Logic │
└──────────────┘
```

## Rate Limit Tiers

| Endpoint Category | Window | Max Requests | Key |
|---|---|---|---|
| **Public** (public-data, check-in) | 1 min | 30 | IP |
| **Auth** (staff-auth login) | 5 min | 5 | IP + phone |
| **Auth** (set-password) | 5 min | 3 | IP |
| **Protected** (protected-data, staff-ops) | 1 min | 60 | IP + userId |
| **Webhooks** (razorpay verify) | 1 min | 10 | IP |
| **WhatsApp** (send-whatsapp) | 1 min | 20 | IP + userId |
| **Tenant ops** (create tenant/branch) | 5 min | 5 | IP + userId |
| **Invoice generation** | 1 min | 10 | IP + userId |

## Implementation Details

### 1. Create `supabase/functions/_shared/rate-limit.ts`
- **Sliding window counter** using an in-memory `Map<string, { count, windowStart }>`
- `checkRateLimit(key: string, maxRequests: number, windowSeconds: number)` returns `{ allowed: boolean, remaining: number, retryAfter?: number }`
- Auto-cleanup of expired entries every 60 seconds to prevent memory leaks
- Returns standard `429 Too Many Requests` response with `Retry-After` header

### 2. Update `supabase/functions/_shared/auth.ts`
- Add a `rateLimitResponse()` helper that returns a formatted 429 response with CORS headers

### 3. Integrate into each Edge Function
Add a 2-line rate limit check at the top of each function handler (after CORS, before any logic):

- **public-data/index.ts** — limit by IP, 30/min
- **check-in/index.ts** — limit by IP + action, 30/min for reads, 10/min for writes
- **staff-auth/index.ts** — limit login attempts by IP+phone 5/5min, other actions 10/min
- **protected-data/index.ts** — limit by IP, 60/min
- **staff-operations/index.ts** — limit by IP, 60/min
- **tenant-operations/index.ts** — limit by IP, 5/5min for create actions
- **send-whatsapp/index.ts** — limit by IP, 20/min
- **create-razorpay-order/index.ts** — limit by IP, 10/min
- **verify-razorpay-payment/index.ts** — limit by IP, 10/min
- **generate-invoice/index.ts** — limit by IP, 10/min
- **daily-whatsapp-job/index.ts** — no limit (cron-triggered)

### 4. Client-side handling
- Update `src/api/authenticatedFetch.ts` to detect 429 responses and show a user-friendly toast: "Too many requests. Please wait and try again."

## Capacity Math
- 100 gyms x 200 members = 20,000 users
- Peak concurrent: ~2,000 users (10%)
- At 60 req/min per user, system handles 120,000 req/min
- Rate limits are per-IP so shared office IPs get a generous allowance
- Login brute-force protection: 5 attempts per 5 min is strict enough to block attacks while allowing legitimate retries

## Files to Create/Edit
- **Create**: `supabase/functions/_shared/rate-limit.ts`
- **Edit**: All 10 Edge Function `index.ts` files (add 2-3 lines each)
- **Edit**: `src/api/authenticatedFetch.ts` (handle 429 on client)

