-- 1. Drop the recursive policy from previous migration
DROP POLICY IF EXISTS "Staff can view colleagues in their branches" ON public.staff;

-- 2. Create a recursion-safe helper that returns branch IDs for the current auth user's staff record
CREATE OR REPLACE FUNCTION public.get_current_staff_branch_ids()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT sba.branch_id
  FROM public.staff s
  JOIN public.staff_branch_assignments sba ON sba.staff_id = s.id
  WHERE s.auth_user_id = auth.uid()
    AND s.is_active = true
$$;

-- 3. Recreate the colleague-visibility policy WITHOUT querying public.staff inside (avoids recursion)
CREATE POLICY "Staff can view colleagues in their branches"
ON public.staff
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.staff_branch_assignments their_branches
    WHERE their_branches.staff_id = staff.id
      AND their_branches.branch_id IN (SELECT public.get_current_staff_branch_ids())
  )
);