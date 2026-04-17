-- Remove the policy added in the last two migrations
DROP POLICY IF EXISTS "Staff can view colleagues in their branches" ON public.staff;

-- Remove the helper function added in the last migration
DROP FUNCTION IF EXISTS public.get_current_staff_branch_ids();