
## Goal
Make admin package mutations (and the admin **Refresh** button) reflect **instantly** on the public registration/renew/extend-PT pages, with no stale-time delay — both on first visit and on already-open tabs.

## Current behavior (gaps)
1. `fetchRegistrationBootstrap` uses **stale-while-revalidate** — serves cached packages immediately even if admin just changed something. The user sees old data for one render cycle.
2. The **Refresh button** on `/admin/settings` and `/admin/trainers` only invalidates the admin TanStack Query keys (`settings-page-data`). It does **not** clear the public sessionStorage cache (`public-bootstrap-*`, `public-packages-*`, `public-trainers-*`, `public-branch-*`) nor broadcast the cross-tab bust signal.
3. Public pages (`PackageSelectionForm`, `ExtendPT`) do **not** listen to the `__public-data-cache-bust` storage event nor to window focus/visibility — so a public tab left open never refetches even after admin invalidation.

## Plan

### 1. Hook the admin Refresh button into public-cache invalidation
File: `src/components/admin/AdminLayoutRoute.tsx`

Extend `handleRefresh` so when the active route is `/admin/settings` or `/admin/trainers` (the routes that actually mutate package/trainer/branch data), it also calls `invalidatePublicDataCache(currentBranch.id)` and the slug variant. This:
- Clears local sessionStorage public caches.
- Broadcasts the `localStorage` cache-bust signal that other tabs already listen for.

### 2. Add a "force refresh" path to `fetchRegistrationBootstrap`
File: `src/api/publicData.ts`

Add an optional `{ forceRefresh?: boolean }` argument. When true, skip the SWR cached read and go straight to the network. This is used by the public pages when they detect a cache-bust signal or are about to render fresh data after a tab focus.

### 3. Make public pages auto-refetch on cache-bust + tab focus
Files: `src/components/registration/PackageSelectionForm.tsx`, `src/pages/ExtendPT.tsx`

Add `useEffect` listeners for:
- `storage` event with key `__public-data-cache-bust` → call `fetchData()` again with `forceRefresh: true` if the bust is for the current branchId or wildcard.
- `visibilitychange` (when document becomes visible) → silent background refetch with `forceRefresh: true`.

Show a subtle inline indicator (no full skeleton flash) — reuse the already-loaded packages while the fresh fetch resolves to keep UX smooth (industry-standard SWR feel).

### 4. Tighten the bootstrap freshness on first paint after a known mutation
File: `src/api/publicData.ts`

When the cache-bust signal fires in the same tab (we'll fire a `window` `CustomEvent('public-data-bust')` from `invalidatePublicDataCache`), any in-flight bootstrap returns the network result instead of cache for the next call. This is the same-tab equivalent of the cross-tab `storage` event.

## Files to edit
| File | Change |
|---|---|
| `src/api/publicData.ts` | Add `forceRefresh` param, dispatch same-tab `CustomEvent` on invalidation |
| `src/components/admin/AdminLayoutRoute.tsx` | Bust public cache on Refresh from Settings/Trainers routes |
| `src/components/registration/PackageSelectionForm.tsx` | Listen to bust signal + visibility change; force refetch |
| `src/pages/ExtendPT.tsx` | Same listeners for renew/extend flow |

## Outcome
- Admin edits a package → sessionStorage cleared + cross-tab signal fired (already in place for mutations).
- Admin clicks **Refresh** → now also clears public caches and broadcasts the signal.
- Open public registration tab → instantly drops cache and refetches in the background.
- New visitor to `/register` → first call always returns latest because cache is gone.
- No stale time, no skeleton flash on already-loaded tabs.
