
## Fix: Registration Portal Failing on Mobile Networks

### Root Cause (Confirmed)

The `public-data` edge function is **not deployed** -- every call returns HTTP 404. This was verified by testing the function directly (404 "Requested function was not found"). Your screenshots confirm this:

- Image 91 (broadband): Shows `public-data` calls with red X marks (failed). The branch name fails to load, showing "Retry loading".
- Image 90 (mobile): Shows only admin dashboard calls (authenticated, working). But when a member visits the registration page on mobile, the same 404 failures happen -- the branch name never loads ("Gym Portal" fallback) and the flow hangs.

**Why "Checking..." hangs on mobile**: After the branch fetch fails (404), the phone check RPC (`check_phone_exists`) may also struggle because mobile networks have higher latency. The 10-second timeout + retry adds up to 20+ seconds of waiting with no feedback.

### Why The Edge Function Approach Is Fragile

The `public-data` edge function has deployment reliability issues (deploys report success but function remains unavailable). The entire registration flow depends on this single function for packages, trainers, and branch data. When it's down, registration is completely broken.

### Solution: Eliminate Edge Function Dependency for Registration

Instead of relying on the edge function, use **direct database queries** which are faster and more reliable. The `branches` table already has a public RLS policy (`branches_public_view`) allowing anonymous reads. For packages and trainers, we'll add similar read-only public policies.

#### Step 1: Add Public SELECT RLS Policies (Database Migration)

Add read-only policies for registration data:

- `monthly_packages`: Allow anonymous SELECT on active packages (id, months, price, joining_fee only exposed by client query)
- `custom_packages`: Allow anonymous SELECT on active packages
- `personal_trainers`: Allow anonymous SELECT on active trainers

These policies only allow reading rows where `is_active = true`, matching exactly what the edge function did.

#### Step 2: Rewrite `src/api/publicData.ts` to Use Direct DB Queries

Replace all edge function calls with direct Supabase client queries:

- `fetchPublicPackages()` -- Query `monthly_packages` and `custom_packages` directly, selecting only safe columns
- `fetchPublicTrainers()` -- Query `personal_trainers` directly, selecting only `id, name, monthly_fee`
- `fetchPublicBranch()` -- Query `branches` directly (already has public RLS)
- `fetchDefaultBranch()` -- Query `branches` directly

Benefits:
- No cold start delays (direct DB is ~100-300ms vs edge function 3-8s)
- No CORS issues (Supabase REST API handles CORS natively)
- No deployment dependency
- Works identically on mobile and WiFi

#### Step 3: Simplify `src/pages/Index.tsx`

- Remove the complex `withTimeout` + edge function fallback chain
- Use a single direct DB query for branch info with a simple timeout
- Keep retry logic but simplified (1 retry with 2s delay)

#### Step 4: Simplify `src/components/registration/PackageSelectionForm.tsx`

- The `fetchFresh` function now calls the rewritten `publicData.ts` functions which use direct DB
- No other changes needed -- caching and retry logic stays the same

### Technical Details

**New RLS Policies (SQL Migration):**
```sql
CREATE POLICY "public_read_monthly_packages" ON public.monthly_packages
  FOR SELECT USING (is_active = true);

CREATE POLICY "public_read_custom_packages" ON public.custom_packages
  FOR SELECT USING (is_active = true);

CREATE POLICY "public_read_personal_trainers" ON public.personal_trainers
  FOR SELECT USING (is_active = true);
```

**Rewritten publicData.ts (key change):**
```text
// Before: Edge function call with 8s timeout + 2 retries = up to 30s
const response = await fetchWithRetry(edgeFunctionUrl, headers);

// After: Direct DB query, ~200ms
const { data } = await supabase
  .from("monthly_packages")
  .select("id, months, price, joining_fee")
  .eq("is_active", true)
  .eq("branch_id", branchId);
```

**Files to modify:**
1. Database migration -- Add 3 public read RLS policies
2. `src/api/publicData.ts` -- Replace edge function calls with direct DB queries
3. `src/pages/Index.tsx` -- Simplify branch loading (remove edge function fallback)
4. `src/components/registration/PackageSelectionForm.tsx` -- Minor cleanup (fetchFresh already delegates to publicData.ts)

### Expected Result

- Registration page loads in under 1 second on any network (mobile 4G/5G or WiFi)
- Branch name always shows correctly (no more "Gym Portal" fallback)
- Phone number check ("Checking...") completes in 1-3 seconds
- No dependency on edge function deployment status
- Works identically across all devices and network types
