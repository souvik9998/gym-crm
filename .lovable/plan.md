

## Problem

When adding a trainer/staff, the app checks if the phone number exists in the `staff` table **globally across all tenants**. This means a staff member registered under a different admin's gym triggers the "Staff Already Registered" dialog incorrectly. The check should only apply within the same admin's tenant (same gym account).

**Root causes:**
1. **Frontend queries** in `StaffTrainersTab.tsx` and `StaffOtherTab.tsx` query `staff` table by phone without tenant scoping
2. **RLS on `staff` table** allows any admin to see all staff globally — no tenant isolation
3. **DB trigger** `check_staff_phone_branch_uniqueness` only checks per-branch, not per-tenant (this is fine for branch-level, but the frontend global check is the real issue)

## Plan

### 1. Create a tenant-scoped DB function for staff phone lookup

Create a `SECURITY DEFINER` function `get_staff_by_phone_in_tenant(p_phone text, p_tenant_id uuid)` that returns staff records only within the given tenant (via `staff_branch_assignments → branches.tenant_id`).

```sql
CREATE OR REPLACE FUNCTION public.get_staff_by_phone_in_tenant(p_phone text, p_tenant_id uuid)
RETURNS TABLE(staff_id uuid, full_name text, phone text, role text, is_active boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT DISTINCT s.id, s.full_name, s.phone, s.role::text, s.is_active
  FROM public.staff s
  JOIN public.staff_branch_assignments sba ON s.id = sba.staff_id
  JOIN public.branches b ON sba.branch_id = b.id
  WHERE s.phone = p_phone AND b.tenant_id = p_tenant_id;
$$;
```

### 2. Update `StaffTrainersTab.tsx` — Add trainer flow

Replace the global `supabase.from("staff").select(...).eq("phone", cleanPhone)` check (line ~157) with an RPC call to `get_staff_by_phone_in_tenant` using `currentBranch.tenant_id`. Same for the edit phone uniqueness check (line ~367).

### 3. Update `StaffOtherTab.tsx` — Add staff flow

Same change as above — replace global phone check (line ~166) and edit phone check (line ~335) with tenant-scoped RPC calls.

### 4. Tighten RLS on `staff` table

Update the admin SELECT policy to scope to the admin's tenant:

```sql
DROP POLICY "Admins and super admins can manage staff" ON public.staff;
CREATE POLICY "Admins can manage own tenant staff" ON public.staff
  FOR ALL TO authenticated
  USING (
    has_role(auth.uid(), 'super_admin'::app_role)
    OR (
      has_role(auth.uid(), 'admin'::app_role)
      AND EXISTS (
        SELECT 1 FROM public.staff_branch_assignments sba
        JOIN public.branches b ON sba.branch_id = b.id
        JOIN public.tenant_members tm ON b.tenant_id = tm.tenant_id
        WHERE sba.staff_id = staff.id AND tm.user_id = auth.uid()
      )
    )
  );
```

Also update the staff self-view policy to include the same admin tenant scoping.

### Files to modify

| File | Change |
|------|--------|
| New migration SQL | Add `get_staff_by_phone_in_tenant` function + update RLS policies on `staff` table |
| `src/components/admin/staff/StaffTrainersTab.tsx` | Replace global phone checks with tenant-scoped RPC calls |
| `src/components/admin/staff/StaffOtherTab.tsx` | Replace global phone checks with tenant-scoped RPC calls |

### Technical detail

- The `currentBranch.tenant_id` is already available via `useBranch()` context in both components
- RLS tightening ensures even if frontend code has bugs, cross-tenant staff data never leaks
- The DB function uses `SECURITY DEFINER` to bypass RLS internally, ensuring consistent results regardless of the calling user's permissions

