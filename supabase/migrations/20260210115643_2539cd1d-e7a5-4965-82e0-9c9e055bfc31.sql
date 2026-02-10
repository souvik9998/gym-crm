
-- Fix FK constraints on tables referencing staff(id) so staff can be deleted

-- 1. attendance_logs.staff_id → SET NULL (preserve log history)
ALTER TABLE public.attendance_logs
  DROP CONSTRAINT attendance_logs_staff_id_fkey;
ALTER TABLE public.attendance_logs
  ADD CONSTRAINT attendance_logs_staff_id_fkey
  FOREIGN KEY (staff_id) REFERENCES public.staff(id) ON DELETE SET NULL;

-- 2. attendance_devices.staff_id → CASCADE (remove device bindings)
ALTER TABLE public.attendance_devices
  DROP CONSTRAINT attendance_devices_staff_id_fkey;
ALTER TABLE public.attendance_devices
  ADD CONSTRAINT attendance_devices_staff_id_fkey
  FOREIGN KEY (staff_id) REFERENCES public.staff(id) ON DELETE CASCADE;

-- 3. staff_sessions.staff_id → CASCADE (remove sessions)
ALTER TABLE public.staff_sessions
  DROP CONSTRAINT staff_sessions_staff_id_fkey;
ALTER TABLE public.staff_sessions
  ADD CONSTRAINT staff_sessions_staff_id_fkey
  FOREIGN KEY (staff_id) REFERENCES public.staff(id) ON DELETE CASCADE;

-- 4. staff_permissions.staff_id → CASCADE (remove permissions)
ALTER TABLE public.staff_permissions
  DROP CONSTRAINT staff_permissions_staff_id_fkey;
ALTER TABLE public.staff_permissions
  ADD CONSTRAINT staff_permissions_staff_id_fkey
  FOREIGN KEY (staff_id) REFERENCES public.staff(id) ON DELETE CASCADE;

-- 5. staff_branch_assignments.staff_id → CASCADE (remove branch assignments)
ALTER TABLE public.staff_branch_assignments
  DROP CONSTRAINT staff_branch_assignments_staff_id_fkey;
ALTER TABLE public.staff_branch_assignments
  ADD CONSTRAINT staff_branch_assignments_staff_id_fkey
  FOREIGN KEY (staff_id) REFERENCES public.staff(id) ON DELETE CASCADE;

-- 6. Drop the unique constraint on staff.phone if it exists globally,
--    so the same phone can be used across branches.
--    Staff uniqueness is enforced per-branch via the trigger check_staff_phone_branch_uniqueness.
DO $$
BEGIN
  -- Drop unique index on phone if exists
  IF EXISTS (
    SELECT 1 FROM pg_indexes 
    WHERE tablename = 'staff' 
    AND indexdef LIKE '%phone%' 
    AND indexdef LIKE '%UNIQUE%'
  ) THEN
    -- Find and drop the constraint
    PERFORM 1; -- handled below
  END IF;
END $$;

-- Try dropping any unique constraint on staff(phone)
ALTER TABLE public.staff DROP CONSTRAINT IF EXISTS staff_phone_key;
ALTER TABLE public.staff DROP CONSTRAINT IF EXISTS staff_phone_unique;
-- Also try dropping unique index
DROP INDEX IF EXISTS staff_phone_key;
DROP INDEX IF EXISTS staff_phone_unique;
DROP INDEX IF EXISTS staff_phone_idx;
