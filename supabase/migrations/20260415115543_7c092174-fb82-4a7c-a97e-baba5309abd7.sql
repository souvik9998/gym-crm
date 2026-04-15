
-- Create a proper non-partial unique constraint for daily_attendance
-- First drop the partial indexes
DROP INDEX IF EXISTS idx_daily_attendance_unique_simple;
DROP INDEX IF EXISTS idx_daily_attendance_unique_slot;

-- Add a proper unique constraint that works with upsert
-- We use COALESCE to handle NULL time_slot_id
CREATE UNIQUE INDEX idx_daily_attendance_unique 
ON public.daily_attendance (member_id, branch_id, date, COALESCE(time_slot_id, '00000000-0000-0000-0000-000000000000'));
