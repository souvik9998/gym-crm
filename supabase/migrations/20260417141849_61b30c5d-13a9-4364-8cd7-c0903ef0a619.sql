-- Allow active staff to view other staff records within their assigned branches
-- Needed so trainer/time-slot dropdowns can resolve trainer names for staff users
CREATE POLICY "Staff can view colleagues in their branches"
ON public.staff
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.staff me
    JOIN public.staff_branch_assignments my_branches ON my_branches.staff_id = me.id
    JOIN public.staff_branch_assignments their_branches ON their_branches.staff_id = staff.id
    WHERE me.auth_user_id = auth.uid()
      AND me.is_active = true
      AND my_branches.branch_id = their_branches.branch_id
  )
);