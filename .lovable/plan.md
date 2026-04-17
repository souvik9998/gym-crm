
## Goal
Allow staff with `member_access_type = 'all'` to read other staff rows (so trainer filters & time slot dropdowns show colleagues), without breaking the existing restrictive RLS that prevents recursion or data leakage.

## Investigation Summary
- Current `staff` SELECT RLS limits visibility to self (`auth_user_id = auth.uid()`).
- The previous attempt at a colleague-visibility policy caused infinite recursion (`staff` policy referenced `staff` again).
- We already have `get_current_staff_branch_ids()` pattern available — a `SECURITY DEFINER` function bypasses RLS and avoids recursion.
- Permission flag lives in `staff_permissions.member_access_type` (`'all'` vs `'assigned'`).

## Approach
Add a **recursion-safe SECURITY DEFINER helper** + a **narrow, additive RLS policy** on `public.staff` that grants SELECT only to staff who:
1. Are active, AND
2. Have `member_access_type = 'all'` in `staff_permissions`, AND
3. Share at least one branch with the target staff row.

This is purely additive — existing policies (self-view, super_admin, gym owner) remain untouched.

### Migration
```sql
-- Helper: branches the current auth user's staff record is assigned to
CREATE OR REPLACE FUNCTION public.get_current_staff_branch_ids()
RETURNS SETOF uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT sba.branch_id
  FROM public.staff s
  JOIN public.staff_branch_assignments sba ON sba.staff_id = s.id
  WHERE s.auth_user_id = auth.uid() AND s.is_active = true
$$;

-- Helper: does the current auth user's staff record have member_access_type = 'all'?
CREATE OR REPLACE FUNCTION public.current_staff_has_all_member_access()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.staff s
    JOIN public.staff_permissions sp ON sp.staff_id = s.id
    WHERE s.auth_user_id = auth.uid()
      AND s.is_active = true
      AND sp.member_access_type = 'all'
  )
$$;

-- Additive policy: staff with all-access can see colleagues in shared branches
CREATE POLICY "Staff with all-access can view branch colleagues"
ON public.staff
FOR SELECT
TO authenticated
USING (
  public.current_staff_has_all_member_access()
  AND EXISTS (
    SELECT 1
    FROM public.staff_branch_assignments tb
    WHERE tb.staff_id = staff.id
      AND tb.branch_id IN (SELECT public.get_current_staff_branch_ids())
  )
);
```

### Why this is safe
- Both helpers are `SECURITY DEFINER` → they bypass RLS internally, so no recursion when the policy on `staff` queries `staff`.
- Policy is **additive** — does not weaken existing self-only policy or admin/super_admin policies.
- Restricted to staff with explicit `'all'` access; assigned-only staff remain limited.
- Limited to shared branches → no cross-tenant leakage.

### Frontend
No changes required. Existing `TrainerFilterDropdown`, `TimeSlotFilterDropdown`, and `useAttendanceFilters` already query `staff` by phone and gracefully fall back to the RPC. With colleague rows now visible, the phone-based path will succeed for all-access staff, returning correct staff IDs and slot counts.

## Files Touched
- New migration: `supabase/migrations/<timestamp>_staff_all_access_colleague_view.sql`

No frontend file changes.
