
-- Biometric devices configuration table
CREATE TABLE public.biometric_devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id uuid NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  device_name text NOT NULL,
  device_brand text NOT NULL DEFAULT 'ZKTeco',
  device_serial text NOT NULL,
  device_ip text,
  device_port integer DEFAULT 4370,
  is_sync_enabled boolean NOT NULL DEFAULT true,
  is_active boolean NOT NULL DEFAULT true,
  last_sync_at timestamptz,
  total_logs_received integer NOT NULL DEFAULT 0,
  api_key text NOT NULL DEFAULT encode(gen_random_bytes(32), 'hex'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(branch_id, device_serial)
);

-- Biometric member mapping table
CREATE TABLE public.biometric_member_mappings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id uuid NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  biometric_user_id text NOT NULL,
  member_id uuid REFERENCES public.members(id) ON DELETE SET NULL,
  biometric_user_name text,
  is_mapped boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(branch_id, biometric_user_id)
);

-- Biometric sync logs for debugging
CREATE TABLE public.biometric_sync_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id uuid NOT NULL REFERENCES public.biometric_devices(id) ON DELETE CASCADE,
  branch_id uuid NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  sync_status text NOT NULL DEFAULT 'success',
  logs_received integer NOT NULL DEFAULT 0,
  logs_processed integer NOT NULL DEFAULT 0,
  logs_duplicated integer NOT NULL DEFAULT 0,
  logs_unmapped integer NOT NULL DEFAULT 0,
  error_message text,
  synced_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.biometric_devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.biometric_member_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.biometric_sync_logs ENABLE ROW LEVEL SECURITY;

-- RLS for biometric_devices
CREATE POLICY "super_admin_full_access_biometric_devices" ON public.biometric_devices FOR ALL
  USING (is_super_admin(auth.uid()))
  WITH CHECK (is_super_admin(auth.uid()));

CREATE POLICY "tenant_members_manage_biometric_devices" ON public.biometric_devices FOR ALL
  USING (EXISTS (SELECT 1 FROM branches b WHERE b.id = biometric_devices.branch_id AND b.tenant_id IS NOT NULL AND user_belongs_to_tenant(auth.uid(), b.tenant_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM branches b WHERE b.id = biometric_devices.branch_id AND b.tenant_id IS NOT NULL AND user_belongs_to_tenant(auth.uid(), b.tenant_id)));

CREATE POLICY "service_role_full_access_biometric_devices" ON public.biometric_devices FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- RLS for biometric_member_mappings
CREATE POLICY "super_admin_full_access_biometric_mappings" ON public.biometric_member_mappings FOR ALL
  USING (is_super_admin(auth.uid()))
  WITH CHECK (is_super_admin(auth.uid()));

CREATE POLICY "tenant_members_manage_biometric_mappings" ON public.biometric_member_mappings FOR ALL
  USING (EXISTS (SELECT 1 FROM branches b WHERE b.id = biometric_member_mappings.branch_id AND b.tenant_id IS NOT NULL AND user_belongs_to_tenant(auth.uid(), b.tenant_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM branches b WHERE b.id = biometric_member_mappings.branch_id AND b.tenant_id IS NOT NULL AND user_belongs_to_tenant(auth.uid(), b.tenant_id)));

CREATE POLICY "service_role_full_access_biometric_mappings" ON public.biometric_member_mappings FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- RLS for biometric_sync_logs
CREATE POLICY "super_admin_full_access_biometric_sync_logs" ON public.biometric_sync_logs FOR ALL
  USING (is_super_admin(auth.uid()))
  WITH CHECK (is_super_admin(auth.uid()));

CREATE POLICY "tenant_members_manage_biometric_sync_logs" ON public.biometric_sync_logs FOR ALL
  USING (EXISTS (SELECT 1 FROM branches b WHERE b.id = biometric_sync_logs.branch_id AND b.tenant_id IS NOT NULL AND user_belongs_to_tenant(auth.uid(), b.tenant_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM branches b WHERE b.id = biometric_sync_logs.branch_id AND b.tenant_id IS NOT NULL AND user_belongs_to_tenant(auth.uid(), b.tenant_id)));

CREATE POLICY "service_role_full_access_biometric_sync_logs" ON public.biometric_sync_logs FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- Indexes for performance
CREATE INDEX idx_biometric_devices_branch ON public.biometric_devices(branch_id);
CREATE INDEX idx_biometric_member_mappings_branch ON public.biometric_member_mappings(branch_id);
CREATE INDEX idx_biometric_member_mappings_member ON public.biometric_member_mappings(member_id);
CREATE INDEX idx_biometric_sync_logs_device ON public.biometric_sync_logs(device_id);
CREATE INDEX idx_biometric_sync_logs_branch ON public.biometric_sync_logs(branch_id);
CREATE INDEX idx_attendance_logs_source ON public.attendance_logs(status) WHERE status = 'biometric';
