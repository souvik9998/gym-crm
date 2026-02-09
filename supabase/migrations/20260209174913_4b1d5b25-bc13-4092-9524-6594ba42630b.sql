
-- Attendance logs table
CREATE TABLE public.attendance_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  branch_id uuid NOT NULL REFERENCES public.branches(id),
  user_type text NOT NULL CHECK (user_type IN ('member', 'staff')),
  member_id uuid REFERENCES public.members(id),
  staff_id uuid REFERENCES public.staff(id),
  check_in_at timestamp with time zone NOT NULL DEFAULT now(),
  check_out_at timestamp with time zone,
  total_hours numeric,
  date date NOT NULL DEFAULT CURRENT_DATE,
  device_fingerprint text,
  status text NOT NULL DEFAULT 'checked_in' CHECK (status IN ('checked_in', 'checked_out', 'expired')),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Attendance devices table
CREATE TABLE public.attendance_devices (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_type text NOT NULL CHECK (user_type IN ('member', 'staff')),
  member_id uuid REFERENCES public.members(id),
  staff_id uuid REFERENCES public.staff(id),
  branch_id uuid NOT NULL REFERENCES public.branches(id),
  device_fingerprint text NOT NULL,
  registered_at timestamp with time zone NOT NULL DEFAULT now(),
  is_active boolean NOT NULL DEFAULT true,
  reset_by uuid,
  reset_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(user_type, member_id, branch_id),
  UNIQUE(user_type, staff_id, branch_id)
);

-- Indexes for performance
CREATE INDEX idx_attendance_logs_branch_date ON public.attendance_logs(branch_id, date);
CREATE INDEX idx_attendance_logs_member ON public.attendance_logs(member_id, date);
CREATE INDEX idx_attendance_logs_staff ON public.attendance_logs(staff_id, date);
CREATE INDEX idx_attendance_logs_status ON public.attendance_logs(status);
CREATE INDEX idx_attendance_devices_fingerprint ON public.attendance_devices(device_fingerprint);

-- Enable RLS
ALTER TABLE public.attendance_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance_devices ENABLE ROW LEVEL SECURITY;

-- RLS for attendance_logs: service role full access (edge function uses this)
CREATE POLICY "Service role full access on attendance_logs"
  ON public.attendance_logs FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- Tenant members can view attendance logs for their branches
CREATE POLICY "Tenant members view attendance_logs"
  ON public.attendance_logs FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM branches b
    WHERE b.id = attendance_logs.branch_id
      AND b.tenant_id IS NOT NULL
      AND user_belongs_to_tenant(auth.uid(), b.tenant_id)
  ));

-- Super admins full access
CREATE POLICY "Super admin full access attendance_logs"
  ON public.attendance_logs FOR ALL
  USING (is_super_admin(auth.uid()))
  WITH CHECK (is_super_admin(auth.uid()));

-- Staff with analytics permission can view attendance
CREATE POLICY "Staff view attendance_logs"
  ON public.attendance_logs FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM staff s
    JOIN staff_branch_assignments sba ON s.id = sba.staff_id
    WHERE s.auth_user_id = auth.uid()
      AND s.is_active = true
      AND sba.branch_id = attendance_logs.branch_id
  ));

-- RLS for attendance_devices
CREATE POLICY "Service role full access on attendance_devices"
  ON public.attendance_devices FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Tenant members manage attendance_devices"
  ON public.attendance_devices FOR ALL
  USING (EXISTS (
    SELECT 1 FROM branches b
    WHERE b.id = attendance_devices.branch_id
      AND b.tenant_id IS NOT NULL
      AND user_belongs_to_tenant(auth.uid(), b.tenant_id)
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM branches b
    WHERE b.id = attendance_devices.branch_id
      AND b.tenant_id IS NOT NULL
      AND user_belongs_to_tenant(auth.uid(), b.tenant_id)
  ));

CREATE POLICY "Super admin full access attendance_devices"
  ON public.attendance_devices FOR ALL
  USING (is_super_admin(auth.uid()))
  WITH CHECK (is_super_admin(auth.uid()));

-- Trigger for updated_at
CREATE TRIGGER update_attendance_logs_updated_at
  BEFORE UPDATE ON public.attendance_logs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_attendance_devices_updated_at
  BEFORE UPDATE ON public.attendance_devices
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
