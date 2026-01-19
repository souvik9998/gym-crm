-- Ensure members.branch_id is always set
DO $$
DECLARE
  v_default_branch uuid;
BEGIN
  SELECT id INTO v_default_branch
  FROM public.branches
  WHERE is_default = true
  ORDER BY created_at ASC
  LIMIT 1;

  IF v_default_branch IS NULL THEN
    SELECT id INTO v_default_branch
    FROM public.branches
    WHERE is_active = true
    ORDER BY created_at ASC
    LIMIT 1;
  END IF;

  -- Backfill existing NULLs (only if we have at least one branch)
  IF v_default_branch IS NOT NULL THEN
    UPDATE public.members
    SET branch_id = v_default_branch
    WHERE branch_id IS NULL;
  END IF;
END $$;

-- Trigger: set default branch_id on insert if missing
CREATE OR REPLACE FUNCTION public.set_members_branch_id_default()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_default_branch uuid;
BEGIN
  IF NEW.branch_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  SELECT id INTO v_default_branch
  FROM public.branches
  WHERE is_default = true
  ORDER BY created_at ASC
  LIMIT 1;

  IF v_default_branch IS NULL THEN
    SELECT id INTO v_default_branch
    FROM public.branches
    WHERE is_active = true
    ORDER BY created_at ASC
    LIMIT 1;
  END IF;

  NEW.branch_id := v_default_branch;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_members_branch_id_default ON public.members;
CREATE TRIGGER trg_members_branch_id_default
BEFORE INSERT ON public.members
FOR EACH ROW
EXECUTE FUNCTION public.set_members_branch_id_default();

-- Finally, enforce NOT NULL only if we have at least one branch and no NULLs remain
DO $$
DECLARE
  v_null_count bigint;
  v_branch_count bigint;
BEGIN
  SELECT count(*) INTO v_branch_count FROM public.branches;
  SELECT count(*) INTO v_null_count FROM public.members WHERE branch_id IS NULL;

  IF v_branch_count > 0 AND v_null_count = 0 THEN
    ALTER TABLE public.members
      ALTER COLUMN branch_id SET NOT NULL;
  END IF;
END $$;