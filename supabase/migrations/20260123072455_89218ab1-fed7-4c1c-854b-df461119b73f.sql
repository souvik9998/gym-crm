-- Add SELECT policy for staff to view activity logs (needed for insert...returning)
CREATE POLICY "Staff can view activity logs" 
ON public.admin_activity_logs 
FOR SELECT 
USING (
  -- Allow staff with any permission to view logs
  EXISTS (
    SELECT 1 FROM public.staff_permissions sp
    WHERE sp.staff_id IS NOT NULL
  )
  OR
  -- Allow public to view logs they just inserted (for returning)
  true
);

-- Add INSERT policy specifically for staff activity logging
CREATE POLICY "Staff can insert activity logs" 
ON public.admin_activity_logs 
FOR INSERT 
WITH CHECK (
  -- Allow inserts where admin_user_id is NULL (staff logs)
  admin_user_id IS NULL
  OR
  -- Or where admin_user_id matches the authenticated user
  admin_user_id = auth.uid()
);