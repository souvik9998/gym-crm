

## Your suggestion vs. the root cause

Invalidating the settings query on every mutation is **already happening** today via `backgroundInvalidate()` inside each Settings handler — and it correctly refetches fresh data from the server. That's not the bug.

The bug is that the Settings page **ignores** the fresh data once it arrives. It copies the first query result into local React state behind a `useRef` "sync once" guard, and the UI then renders from that local copy forever. So even a perfect invalidation refetches data that the UI never reads.

So adding more invalidations would add API calls **without** fixing the staleness. The fix has to remove the local-state mirror.

## Recommended approach (minimum API calls + always fresh)

Combine two changes:

### 1. Render directly from React Query (fixes the actual bug, zero extra calls)

In `src/pages/admin/Settings.tsx`:
- Delete the `monthlyPackagesSynced` / `customPackagesSynced` / `initialSyncDone` refs and their sync effects.
- Remove local state for `monthlyPackages`, `customPackages`, `settings`.
- Derive them inline from the existing query:
  ```ts
  const monthlyPackages = fetchedMonthlyPackages ?? [];
  const customPackages = fetchedCustomPackages ?? [];
  const settings = fetchedSettings;
  ```
- Gym-info form fields stay local (they're an editable form), but re-seed them when `fetchedSettings?.id` changes (normal effect, no ref guard) so a branch switch updates them.

### 2. Optimistic cache writes on mutations (instant UI, **no extra refetch**)

Instead of `setMonthlyPackages(...)` + `backgroundInvalidate()`, each handler writes the new value straight into the React Query cache:

```ts
queryClient.setQueryData(["settings-page-data", branchId], (prev) => ({
  ...prev,
  monthlyPackages: [...prev.monthlyPackages, newPkg],
}));
```

- UI updates instantly (same feel as today).
- We **drop** the `backgroundInvalidate()` call on the success path because the cache already holds the truth — saving one network round-trip per mutation.
- On error, revert by writing the previous snapshot back.

### 3. Keep one safety net for cross-tab / external changes

`useSettingsPageData` keeps `staleTime: 5 min` and React Query's `refetchOnWindowFocus: true` (already the project default). So if the data changes outside this tab (another admin, another device), the next focus naturally refetches — still no extra calls during normal use.

## Net effect on API calls

| Scenario | Before | After |
|---|---|---|
| Open Settings tab (cache fresh) | 0 | 0 |
| Add/edit/delete a package | 1 mutation + 1 invalidation refetch | **1 mutation only** |
| Switch tabs and return | 0 (but shows stale data — bug) | 0 (shows fresh data from cache) |
| Return after 5+ min | 1 background refetch | 1 background refetch |
| Another admin edits in parallel | needs reload | auto-refetch on window focus |

Fewer API calls than today **and** no more stale data.

## Files to edit

| File | Change |
|---|---|
| `src/pages/admin/Settings.tsx` | Remove sync-ref pattern; derive lists from query; replace `setState + backgroundInvalidate` in CRUD handlers with `queryClient.setQueryData` optimistic writes (with error revert); re-seed gym-info form on `settings?.id` change |

No other files, no DB changes, no hook changes.

