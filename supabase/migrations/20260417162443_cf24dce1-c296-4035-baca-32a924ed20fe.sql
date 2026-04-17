-- 1. Drop the additive RLS policy on staff
DROP POLICY IF EXISTS "Staff with all-access can view branch colleagues" ON public.staff;

-- 2. Drop sync triggers on staff
DROP TRIGGER IF EXISTS trg_sync_staff_auth_lookup_ins ON public.staff;
DROP TRIGGER IF EXISTS trg_sync_staff_auth_lookup_upd ON public.staff;
DROP TRIGGER IF EXISTS trg_sync_staff_auth_lookup_del ON public.staff;

-- 3. Drop helper functions added in the last two prompts
DROP FUNCTION IF EXISTS public.sync_staff_auth_lookup() CASCADE;
DROP FUNCTION IF EXISTS public.current_staff_has_all_member_access() CASCADE;
DROP FUNCTION IF EXISTS public.get_current_staff_branch_ids() CASCADE;
DROP FUNCTION IF EXISTS public.get_current_staff_tenant_id() CASCADE;
DROP FUNCTION IF EXISTS public.get_current_staff_id() CASCADE;

-- 4. Drop the mirror lookup table
DROP TABLE IF EXISTS public.staff_auth_lookup CASCADE;