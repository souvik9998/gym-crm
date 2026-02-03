-- Update staff RLS policies to allow super_admin access

-- Drop existing policies
DROP POLICY IF EXISTS "Admins can manage staff" ON public.staff;
DROP POLICY IF EXISTS "Staff can view own profile via auth" ON public.staff;

-- Create new policies that include super_admin
CREATE POLICY "Admins and super admins can manage staff" 
ON public.staff 
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Staff can view own profile via auth" 
ON public.staff 
FOR SELECT
USING (
  has_role(auth.uid(), 'admin'::app_role) OR 
  has_role(auth.uid(), 'super_admin'::app_role) OR 
  (auth_user_id = auth.uid())
);

-- Also update staff_branch_assignments policies for super_admin access
DROP POLICY IF EXISTS "Admins can view staff assignments" ON public.staff_branch_assignments;
DROP POLICY IF EXISTS "Admins can manage staff assignments" ON public.staff_branch_assignments;

CREATE POLICY "Admins and super admins can view staff assignments" 
ON public.staff_branch_assignments 
FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Admins and super admins can manage staff assignments" 
ON public.staff_branch_assignments 
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role));