-- Drop the additive RLS policy added for all-access staff colleague visibility
DROP POLICY IF EXISTS "Staff with all-access can view branch colleagues" ON public.staff;

-- Drop helper functions added in the last two prompts
DROP FUNCTION IF EXISTS public.current_staff_has_all_member_access();
DROP FUNCTION IF EXISTS public.get_current_staff_branch_ids();
DROP FUNCTION IF EXISTS public.get_staff_names_for_branch(uuid);
DROP FUNCTION IF EXISTS public.get_staff_by_phone_in_tenant(text, uuid);