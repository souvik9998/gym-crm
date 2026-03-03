

## Backend API Call Optimization Plan

### Problem Analysis

From the network screenshot, 53 requests are fired on dashboard load. The primary sources of redundancy:

1. **`user_roles` query called 8+ times** - `AuthContext` calls it once, but `onAuthStateChange` in `AuthContext` fires `loadUserData` again on token refresh. Additionally, `AdminLayout` sets up its OWN `onAuthStateChange` + `getSession()` (lines 34-43), causing redundant auth checks.

2. **`tenant_members` query called 8+ times** - Same pattern as above. Each `loadUserData` re-execution queries `tenant_members`.

3. **`tenant_limits` query called 8+ times** - Same cascade. Plus `useAdminNotifications` makes its own `tenant_members` + `tenant_limits` queries instead of using `tenantId` from `AuthContext`.

4. **`get_tenant_current_usage` called 4+ times** - `useAdminNotifications` calls this on every `dashStats` change, and it re-triggers on mount.

5. **`get_dashboard_stats` called multiple times** - Token refresh triggers re-renders which re-fire the query.

6. **`branches` query called 4+ times** - `BranchContext.fetchBranches` is called multiple times due to dependency array changes.

### Root Causes

- **`AdminLayout` has redundant `onAuthStateChange` listener** (line 34) that duplicates what `AuthContext` already does
- **`useAdminNotifications` bypasses centralized auth** - queries `tenant_members` and `tenant_limits` directly instead of using `useAuth().tenantId`
- **`AuthContext.loadUserData` is called on every `onAuthStateChange` event** including token refresh (which happens frequently) - needs deduplication guard
- **`BranchContext.fetchBranches` dependency array** causes re-execution when auth state settles

### Changes (Backend-only focus, no UI/business logic changes)

#### 1. Add deduplication guard to `AuthContext.loadUserData`
- Add a `lastLoadedUserId` ref to skip re-fetching if the same user's data was already loaded
- Only re-fetch on actual user change (sign-in/sign-out), not on token refresh events
- This eliminates ~6 redundant `user_roles` + `tenant_members` + `tenant_limits` calls

#### 2. Refactor `AdminLayout` to use `AuthContext`
- Remove the redundant `onAuthStateChange` listener + `getSession()` call (lines 33-52)
- Use `useAuth()` for `adminUser` state instead of maintaining separate state
- This eliminates 2+ redundant auth-related requests per page load

#### 3. Refactor `useAdminNotifications` to use centralized auth
- Replace direct `tenant_members` query with `useAuth().tenantId` (already available)
- Replace direct `tenant_limits` query with data from `useAuth().tenantPermissions` for feature checks, and only query `tenant_limits` once for numeric limit values
- Combine remaining queries into single `protectedFetch` call via new `notification-data` edge function action

#### 4. Consolidate `BranchContext` fetch stability
- Wrap `fetchBranches` dependencies to prevent re-execution on stable values
- Use a `hasFetched` ref to prevent double-fetch during auth settling

### Summary of Expected Impact

| Before | After |
|--------|-------|
| 53 requests on page load | ~15-20 requests |
| 8x `user_roles` calls | 1x |
| 8x `tenant_members` calls | 1x |
| 8x `tenant_limits` calls | 1-2x |
| 4x `get_tenant_current_usage` | 1x |

### Files to Modify

| File | Change |
|------|--------|
| `src/contexts/AuthContext.tsx` | Add deduplication guard to `loadUserData` |
| `src/components/admin/AdminLayout.tsx` | Remove redundant auth listener, use `useAuth()` |
| `src/hooks/useAdminNotifications.ts` | Use `useAuth().tenantId` instead of own queries |
| `src/contexts/BranchContext.tsx` | Add fetch stability guard |
| `supabase/functions/protected-data/index.ts` | Add `notification-data` action (optional) |

