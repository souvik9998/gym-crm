
-- Platform settings table (single-row config table)
CREATE TABLE public.platform_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  maintenance_mode boolean NOT NULL DEFAULT false,
  allow_new_signups boolean NOT NULL DEFAULT true,
  default_branch_limit integer NOT NULL DEFAULT 3,
  default_member_limit integer NOT NULL DEFAULT 1000,
  default_whatsapp_limit integer NOT NULL DEFAULT 500,
  default_staff_per_branch integer NOT NULL DEFAULT 10,
  default_trainers_limit integer NOT NULL DEFAULT 20,
  default_monthly_checkins integer NOT NULL DEFAULT 10000,
  default_storage_mb integer NOT NULL DEFAULT 500,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Insert default row
INSERT INTO public.platform_settings (id) VALUES (gen_random_uuid());

-- Enable RLS
ALTER TABLE public.platform_settings ENABLE ROW LEVEL SECURITY;

-- Only super admins can read/write
CREATE POLICY "super_admin_full_access_platform_settings"
  ON public.platform_settings FOR ALL
  USING (is_super_admin(auth.uid()))
  WITH CHECK (is_super_admin(auth.uid()));

-- Service role full access
CREATE POLICY "service_role_full_access_platform_settings"
  ON public.platform_settings FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
