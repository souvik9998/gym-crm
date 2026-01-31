-- Add SELECT policy for staff users with can_view_members OR can_manage_members permission
CREATE POLICY "Staff can view members with permission"
ON public.members
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM staff_permissions sp
    JOIN staff_branch_assignments sba ON sp.staff_id = sba.staff_id
    WHERE (sp.can_view_members = true OR sp.can_manage_members = true)
    AND sba.branch_id = members.branch_id
  )
);