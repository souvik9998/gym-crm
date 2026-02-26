
## Fix Registration Portal Reliability and Speed

### Problem
The registration portal gets stuck on a loading screen for some devices because:
1. Edge function calls (`public-data`) have cold starts taking 4-5 seconds and no timeout - if the call fails or hangs, the page is stuck forever with no way to recover
2. No error handling or retry mechanism - users see infinite loading with no recourse
3. The package selection page also relies on slow edge function calls with no caching
4. When visiting root `/`, the `fetchDefaultBranch` edge function call can hang before redirecting

### Solution

#### 1. Add Timeout and Error Recovery to API Calls (`src/api/publicData.ts`)
- Add `AbortController` with a 8-second timeout to every `fetch` call
- If a fetch times out, it returns gracefully (empty data or null) instead of hanging forever
- This ensures the page never gets permanently stuck

#### 2. Fix Index.tsx (Phone Entry Page)
- Add a timeout fallback: if branch info doesn't load within 5 seconds, show the page anyway with a generic "Gym Portal" name and let users proceed
- Add an error state with a "Retry" button so users can tap to reload if something fails
- Add `fetchDefaultBranch` timeout so users aren't stuck on `/` forever - after 8 seconds, redirect to admin login as fallback
- Ensure the Continue button is always interactive once the phone number is valid (never block on branch name loading)

#### 3. Fix PackageSelectionForm.tsx (Package Selection Page)
- Cache fetched packages and trainers in `sessionStorage` so returning to this page is instant
- Show cached data immediately, refresh in background
- Add a retry button if the initial fetch fails completely
- Add timeout to prevent infinite loading state

#### 4. Warm Edge Function on Page Load
- Fire a lightweight "warm-up" fetch to the `public-data` edge function as soon as the Index page mounts (before the user even finishes typing their phone number)
- This pre-warms the edge function so that by the time user reaches the package page, the function is already warm and responds fast

### Technical Details

**Files to modify:**
- `src/api/publicData.ts` - Add AbortController timeouts (8s) to all 4 fetch functions
- `src/pages/Index.tsx` - Add timeout fallback for branch loading, error/retry state, edge function warm-up call
- `src/components/registration/PackageSelectionForm.tsx` - Add sessionStorage caching for packages/trainers, retry button on failure
- `src/pages/Register.tsx` - Add edge function warm-up when details step loads (so packages are ready when user moves to step 2)

**Key reliability guarantees:**
- Page renders within 1-2 seconds on any device (cached data or skeleton + timeout fallback)
- No API call can block the page for more than 8 seconds
- Users always have a way to proceed or retry if something fails
- Returning to previously visited pages is instant (sessionStorage cache)
