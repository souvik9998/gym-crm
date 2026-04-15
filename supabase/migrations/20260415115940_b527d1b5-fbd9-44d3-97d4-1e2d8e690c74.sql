
CREATE POLICY "Staff can delete daily attendance for their branches"
ON public.daily_attendance
FOR DELETE
TO authenticated
USING (
  is_staff(auth.uid()) AND (branch_id IN (
    SELECT sba.branch_id
    FROM staff_branch_assignments sba
    JOIN staff s ON s.id = sba.staff_id
    WHERE s.auth_user_id = auth.uid() AND s.is_active = true
  ))
);
