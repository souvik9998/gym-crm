-- =========================================================================
-- 1. Recursion-safe lookup table (mirror of staff identity only)
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.staff_auth_lookup (
  staff_id uuid PRIMARY KEY,
  auth_user_id uuid,
  is_active boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_staff_auth_lookup_auth_user_id
  ON public.staff_auth_lookup(auth_user_id) WHERE auth_user_id IS NOT NULL;

-- Backfill from current staff
INSERT INTO public.staff_auth_lookup (staff_id, auth_user_id, is_active, updated_at)
SELECT id, auth_user_id, is_active, now()
FROM public.staff
ON CONFLICT (staff_id) DO UPDATE
  SET auth_user_id = EXCLUDED.auth_user_id,
      is_active = EXCLUDED.is_active,
      updated_at = now();

-- Lock down: deny all direct access. Only SECURITY DEFINER funcs read it.
ALTER TABLE public.staff_auth_lookup ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "no direct access staff_auth_lookup" ON public.staff_auth_lookup;
CREATE POLICY "no direct access staff_auth_lookup"
  ON public.staff_auth_lookup FOR SELECT USING (false);

-- Keep lookup in sync with staff
CREATE OR REPLACE FUNCTION public.sync_staff_auth_lookup()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF (TG_OP = 'DELETE') THEN
    DELETE FROM public.staff_auth_lookup WHERE staff_id = OLD.id;
    RETURN OLD;
  END IF;

  INSERT INTO public.staff_auth_lookup (staff_id, auth_user_id, is_active, updated_at)
  VALUES (NEW.id, NEW.auth_user_id, NEW.is_active, now())
  ON CONFLICT (staff_id) DO UPDATE
    SET auth_user_id = EXCLUDED.auth_user_id,
        is_active = EXCLUDED.is_active,
        updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_staff_auth_lookup_ins ON public.staff;
DROP TRIGGER IF EXISTS trg_sync_staff_auth_lookup_upd ON public.staff;
DROP TRIGGER IF EXISTS trg_sync_staff_auth_lookup_del ON public.staff;

CREATE TRIGGER trg_sync_staff_auth_lookup_ins
  AFTER INSERT ON public.staff
  FOR EACH ROW EXECUTE FUNCTION public.sync_staff_auth_lookup();

CREATE TRIGGER trg_sync_staff_auth_lookup_upd
  AFTER UPDATE OF auth_user_id, is_active ON public.staff
  FOR EACH ROW EXECUTE FUNCTION public.sync_staff_auth_lookup();

CREATE TRIGGER trg_sync_staff_auth_lookup_del
  AFTER DELETE ON public.staff
  FOR EACH ROW EXECUTE FUNCTION public.sync_staff_auth_lookup();

-- =========================================================================
-- 2. Recursion-safe helpers (read from lookup, NOT staff)
-- =========================================================================

-- Single source of truth for "current staff id" — uses lookup, NOT staff.
CREATE OR REPLACE FUNCTION public.get_current_staff_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT staff_id
  FROM public.staff_auth_lookup
  WHERE auth_user_id = auth.uid()
    AND is_active = true
  LIMIT 1
$$;

-- Tenant of current staff — derived via branch assignment (staff has no tenant_id col).
-- Does NOT touch public.staff.
CREATE OR REPLACE FUNCTION public.get_current_staff_tenant_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT b.tenant_id
  FROM public.staff_branch_assignments sba
  JOIN public.branches b ON b.id = sba.branch_id
  WHERE sba.staff_id = public.get_current_staff_id()
  LIMIT 1
$$;

-- Branches assigned to current staff — does NOT touch public.staff.
CREATE OR REPLACE FUNCTION public.get_current_staff_branch_ids()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT branch_id
  FROM public.staff_branch_assignments
  WHERE staff_id = public.get_current_staff_id()
$$;

-- All-access permission check — does NOT touch public.staff.
CREATE OR REPLACE FUNCTION public.current_staff_has_all_member_access()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.staff_permissions
    WHERE staff_id = public.get_current_staff_id()
      AND member_access_type = 'all'
  )
$$;

-- =========================================================================
-- 3. Re-create additive RLS policy (no recursion risk now)
-- =========================================================================
DROP POLICY IF EXISTS "Staff with all-access can view branch colleagues" ON public.staff;

CREATE POLICY "Staff with all-access can view branch colleagues"
ON public.staff
FOR SELECT
TO authenticated
USING (
  public.current_staff_has_all_member_access()
  AND staff.is_active = true
  AND EXISTS (
    SELECT 1
    FROM public.staff_branch_assignments tb
    JOIN public.branches b ON b.id = tb.branch_id
    WHERE tb.staff_id = staff.id
      AND b.tenant_id = public.get_current_staff_tenant_id()
      AND tb.branch_id IN (SELECT public.get_current_staff_branch_ids())
  )
);