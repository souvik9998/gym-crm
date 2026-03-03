

## Staff Management Page - Data Fetching Refactor

### Current Problem
The Staff Management page (`/admin/staff`) makes **4+ separate API calls** on load:

1. **Parent** (`StaffManagement.tsx`): 3 sequential Supabase queries:
   - `staff` table (all staff)
   - `staff_permissions` table (all permissions)
   - `staff_branch_assignments` with branches join
2. **Child** (`StaffOverviewTab.tsx`): 3+ parallel `ledger_entries` queries for "total paid to staff" stats, plus N additional name-based queries

### Plan

#### 1. Add `staff-page-data` action to `protected-data` edge function

Add a new case in `supabase/functions/protected-data/index.ts` that fetches all staff page data in one server-side call using `Promise.all`:

- `staff` (all columns, ordered by full_name)
- `staff_permissions` (all)
- `staff_branch_assignments` with branch name join
- `ledger_entries` aggregated totals for categories: `trainer_percentage`, `trainer_session`, `staff_salary` (scoped to branch)

Returns a single structured JSON:
```json
{
  "staff": [...],           // combined with permissions & assignments
  "totalPaidToStaff": 12345 // aggregated ledger expense total
}
```

Only required fields will be selected. The server combines staff + permissions + assignments before returning, avoiding client-side joins.

#### 2. Create `useStaffPageData` hook

New file `src/hooks/queries/useStaffPageData.ts`:
- Single `useQuery` call using `protectedFetch` with action `staff-page-data`
- Branch-aware query key: `['staff-page-data', branchId]`
- Returns `{ staff, totalPaidToStaff, isLoading }`
- Handles client-side filtering (trainers vs other staff, branch filtering)

#### 3. Refactor `StaffManagement.tsx`

- Remove `useState` + `useEffect` + `fetchStaff` manual fetching
- Replace with `useStaffPageData()` hook
- Pass data down to child tabs as before (no UI changes)

#### 4. Refactor `StaffOverviewTab.tsx`

- Remove `fetchTotalPaidToStaff` function and its `useEffect`
- Remove `isLoadingTotalPaid` state
- Accept `totalPaidToStaff` as a prop from parent
- Remove `supabase` import (no longer needed for data fetching)

#### 5. No changes to mutation logic

All add/edit/delete/toggle operations in `StaffTrainersTab` and `StaffOtherTab` remain unchanged -- they are user-triggered actions, not page-load queries.

### Result
- **Before**: 4-7+ network requests on page load
- **After**: 1 network request on page load
- No UI or business logic changes

