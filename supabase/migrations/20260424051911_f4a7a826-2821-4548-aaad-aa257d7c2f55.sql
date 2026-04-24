-- Allow 'skipped' as an attendance status alongside present/absent/late.
-- 'late' is kept temporarily for backward compatibility with any historical rows,
-- but new attendance marking will use 'skipped' instead of 'late'.
ALTER TABLE public.daily_attendance
  DROP CONSTRAINT IF EXISTS daily_attendance_status_check;

ALTER TABLE public.daily_attendance
  ADD CONSTRAINT daily_attendance_status_check
  CHECK (status = ANY (ARRAY['present'::text, 'absent'::text, 'late'::text, 'skipped'::text]));