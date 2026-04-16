-- Revert: Drop the tenant-scoped admin policy and restore the original global policy

DROP POLICY IF EXISTS "Admins can manage own tenant staff" ON public.staff;

CREATE POLICY "Admins and super admins can manage staff" 
ON public.staff 
FOR ALL
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role));

-- Note: keeping get_staff_by_phone_in_tenant function as it's harmless and may be used later