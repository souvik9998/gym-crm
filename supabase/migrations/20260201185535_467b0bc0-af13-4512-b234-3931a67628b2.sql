-- Fix member_details UPDATE policy to properly check auth.uid() = staff.auth_user_id
-- Drop the existing policy that has a broken JOIN

DROP POLICY IF EXISTS "Staff can update member details with permission" ON public.member_details;

-- Create new policy with proper auth.uid() check
CREATE POLICY "Staff can update member details with permission"
ON public.member_details
FOR UPDATE
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR EXISTS (
    SELECT 1
    FROM staff s
    JOIN staff_permissions sp ON s.id = sp.staff_id
    JOIN staff_branch_assignments sba ON s.id = sba.staff_id
    JOIN members m ON m.branch_id = sba.branch_id
    WHERE s.auth_user_id = auth.uid()
      AND s.is_active = true
      AND sp.can_manage_members = true
      AND m.id = member_details.member_id
  )
);

-- Also add INSERT policy for staff to create member_details
DROP POLICY IF EXISTS "Staff can insert member details with permission" ON public.member_details;

CREATE POLICY "Staff can insert member details with permission"
ON public.member_details
FOR INSERT
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role)
  OR EXISTS (
    SELECT 1
    FROM staff s
    JOIN staff_permissions sp ON s.id = sp.staff_id
    JOIN staff_branch_assignments sba ON s.id = sba.staff_id
    JOIN members m ON m.branch_id = sba.branch_id
    WHERE s.auth_user_id = auth.uid()
      AND s.is_active = true
      AND sp.can_manage_members = true
      AND m.id = member_details.member_id
  )
);

-- Fix subscriptions INSERT policy for staff
DROP POLICY IF EXISTS "Staff can insert subscriptions with permission" ON public.subscriptions;

CREATE POLICY "Staff can insert subscriptions with permission"
ON public.subscriptions
FOR INSERT
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role)
  OR EXISTS (
    SELECT 1
    FROM staff s
    JOIN staff_permissions sp ON s.id = sp.staff_id
    JOIN staff_branch_assignments sba ON s.id = sba.staff_id
    WHERE s.auth_user_id = auth.uid()
      AND s.is_active = true
      AND sp.can_manage_members = true
      AND sba.branch_id = subscriptions.branch_id
  )
);