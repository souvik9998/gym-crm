
-- Create daily_attendance table for manual attendance marking
CREATE TABLE public.daily_attendance (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  member_id uuid NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  branch_id uuid NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  date date NOT NULL DEFAULT CURRENT_DATE,
  status text NOT NULL DEFAULT 'absent',
  time_slot_id uuid REFERENCES public.trainer_time_slots(id) ON DELETE SET NULL,
  marked_by text,
  marked_by_type text DEFAULT 'admin',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT daily_attendance_status_check CHECK (status IN ('present', 'absent', 'late'))
);

-- Unique index: one record per member per branch per date (simple mode, no slot)
CREATE UNIQUE INDEX idx_daily_attendance_unique_simple 
ON public.daily_attendance(member_id, branch_id, date) 
WHERE time_slot_id IS NULL;

-- Unique index: one record per member per branch per date per slot (slot mode)
CREATE UNIQUE INDEX idx_daily_attendance_unique_slot 
ON public.daily_attendance(member_id, branch_id, date, time_slot_id) 
WHERE time_slot_id IS NOT NULL;

-- Performance indexes
CREATE INDEX idx_daily_attendance_branch_date ON public.daily_attendance(branch_id, date);
CREATE INDEX idx_daily_attendance_member ON public.daily_attendance(member_id);
CREATE INDEX idx_daily_attendance_date ON public.daily_attendance(date DESC);

-- Enable RLS
ALTER TABLE public.daily_attendance ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Admins can manage daily attendance"
ON public.daily_attendance
FOR ALL
TO authenticated
USING (
  public.is_gym_owner(auth.uid()) OR public.is_super_admin(auth.uid())
)
WITH CHECK (
  public.is_gym_owner(auth.uid()) OR public.is_super_admin(auth.uid())
);

CREATE POLICY "Staff can view daily attendance for their branches"
ON public.daily_attendance
FOR SELECT
TO authenticated
USING (
  public.is_staff(auth.uid()) AND
  branch_id IN (
    SELECT sba.branch_id FROM public.staff_branch_assignments sba
    JOIN public.staff s ON s.id = sba.staff_id
    WHERE s.auth_user_id = auth.uid() AND s.is_active = true
  )
);

CREATE POLICY "Staff can insert daily attendance for their branches"
ON public.daily_attendance
FOR INSERT
TO authenticated
WITH CHECK (
  public.is_staff(auth.uid()) AND
  branch_id IN (
    SELECT sba.branch_id FROM public.staff_branch_assignments sba
    JOIN public.staff s ON s.id = sba.staff_id
    WHERE s.auth_user_id = auth.uid() AND s.is_active = true
  )
);

CREATE POLICY "Staff can update daily attendance for their branches"
ON public.daily_attendance
FOR UPDATE
TO authenticated
USING (
  public.is_staff(auth.uid()) AND
  branch_id IN (
    SELECT sba.branch_id FROM public.staff_branch_assignments sba
    JOIN public.staff s ON s.id = sba.staff_id
    WHERE s.auth_user_id = auth.uid() AND s.is_active = true
  )
);

-- Trigger for updated_at
CREATE TRIGGER update_daily_attendance_updated_at
BEFORE UPDATE ON public.daily_attendance
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
