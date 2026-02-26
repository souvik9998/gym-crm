

## Fix: Mobile Network API Failures in Registration Portal

### Root Cause Analysis

There are **3 key issues** causing failures on mobile networks:

1. **CORS Headers Missing Required Fields**: The `public-data` edge function's CORS headers are missing `x-supabase-client-platform`, `x-supabase-client-platform-version`, `x-supabase-client-runtime`, and `x-supabase-client-runtime-version`. Mobile browsers send these headers, and the preflight (OPTIONS) request gets rejected, causing all subsequent API calls to fail silently.

2. **No Retry Logic for Flaky Connections**: Mobile networks drop packets and have variable latency. Currently, if any fetch fails (edge function or direct DB), it just gives up. There's no retry mechanism.

3. **Edge Function Not Deployed**: The `public-data` edge function appears to not be deployed (returned 404 on test call). It needs to be redeployed.

### Fix Plan

#### 1. Fix CORS Headers in `public-data` Edge Function
Update the `corsHeaders` in `supabase/functions/public-data/index.ts` to include all required Supabase client headers:

```text
Before:
"Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type"

After:
"Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version"
```

Then redeploy the function.

#### 2. Add Retry Logic to `src/api/publicData.ts`
Add a `fetchWithRetry` wrapper that retries failed requests up to 2 times with a short delay (1 second). This handles the common case of a transient mobile network drop.

#### 3. Add Retry Logic to `src/pages/Index.tsx`
The `check_phone_exists` RPC call and direct branch DB query should also retry once on failure, so the "Continue" button doesn't get stuck in "Checking..." state.

#### 4. Add Retry Logic to `src/components/registration/PackageSelectionForm.tsx`
The package/trainer fetch should also retry automatically rather than requiring the user to manually tap "Retry".

### Files to Modify
- `supabase/functions/public-data/index.ts` -- Fix CORS headers + redeploy
- `src/api/publicData.ts` -- Add `fetchWithRetry` (retry up to 2x with 1s delay)
- `src/pages/Index.tsx` -- Add retry to `check_phone_exists` RPC and branch query
- `src/components/registration/PackageSelectionForm.tsx` -- Add auto-retry on fetch failure

### Expected Result
After these fixes, users on mobile networks will:
- No longer get CORS preflight failures blocking all API calls
- Have automatic retry on transient network drops
- See the gym name and packages load reliably even on slow 3G/4G connections

