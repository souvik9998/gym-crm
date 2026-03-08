
-- Create biometric_enrollment_requests table
CREATE TABLE public.biometric_enrollment_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id uuid NOT NULL REFERENCES public.branches(id),
  member_id uuid NOT NULL REFERENCES public.members(id),
  device_id uuid NOT NULL REFERENCES public.biometric_devices(id),
  enrollment_type text NOT NULL DEFAULT 'fingerprint',
  status text NOT NULL DEFAULT 'pending',
  biometric_user_id text,
  error_message text,
  requested_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  expires_at timestamp with time zone NOT NULL DEFAULT (now() + interval '2 minutes')
);

-- Indexes
CREATE INDEX idx_biometric_enrollment_branch ON public.biometric_enrollment_requests(branch_id);
CREATE INDEX idx_biometric_enrollment_device ON public.biometric_enrollment_requests(device_id);
CREATE INDEX idx_biometric_enrollment_status ON public.biometric_enrollment_requests(status);
CREATE INDEX idx_biometric_enrollment_member ON public.biometric_enrollment_requests(member_id);

-- Enable RLS
ALTER TABLE public.biometric_enrollment_requests ENABLE ROW LEVEL SECURITY;

-- RLS policies (same pattern as other biometric tables)
CREATE POLICY "service_role_full_access_biometric_enrollments"
  ON public.biometric_enrollment_requests FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "super_admin_full_access_biometric_enrollments"
  ON public.biometric_enrollment_requests FOR ALL
  TO authenticated
  USING (is_super_admin(auth.uid()))
  WITH CHECK (is_super_admin(auth.uid()));

CREATE POLICY "tenant_members_manage_biometric_enrollments"
  ON public.biometric_enrollment_requests FOR ALL
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM branches b
    WHERE b.id = biometric_enrollment_requests.branch_id
      AND b.tenant_id IS NOT NULL
      AND user_belongs_to_tenant(auth.uid(), b.tenant_id)
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM branches b
    WHERE b.id = biometric_enrollment_requests.branch_id
      AND b.tenant_id IS NOT NULL
      AND user_belongs_to_tenant(auth.uid(), b.tenant_id)
  ));

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.biometric_enrollment_requests;
