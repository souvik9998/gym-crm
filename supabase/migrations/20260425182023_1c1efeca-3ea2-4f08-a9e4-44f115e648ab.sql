-- Allow daily_attendance to track staff attendance in addition to members
ALTER TABLE public.daily_attendance
  ALTER COLUMN member_id DROP NOT NULL;

ALTER TABLE public.daily_attendance
  ADD COLUMN IF NOT EXISTS staff_id uuid REFERENCES public.staff(id) ON DELETE CASCADE;

-- Either member_id or staff_id must be set, not both
ALTER TABLE public.daily_attendance
  DROP CONSTRAINT IF EXISTS daily_attendance_subject_check;

ALTER TABLE public.daily_attendance
  ADD CONSTRAINT daily_attendance_subject_check
  CHECK (
    (member_id IS NOT NULL AND staff_id IS NULL)
    OR (member_id IS NULL AND staff_id IS NOT NULL)
  );

-- Index for fast staff lookups
CREATE INDEX IF NOT EXISTS idx_daily_attendance_staff_branch_date
  ON public.daily_attendance(staff_id, branch_id, date)
  WHERE staff_id IS NOT NULL;

-- Unique per staff per day per branch (no slot)
CREATE UNIQUE INDEX IF NOT EXISTS idx_daily_attendance_staff_unique
  ON public.daily_attendance(staff_id, branch_id, date)
  WHERE staff_id IS NOT NULL AND time_slot_id IS NULL;