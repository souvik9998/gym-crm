
-- Report schedules table for automated reporting
CREATE TABLE public.report_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id uuid NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  is_enabled boolean NOT NULL DEFAULT false,
  frequency text NOT NULL DEFAULT 'weekly',
  report_email text,
  send_whatsapp boolean NOT NULL DEFAULT false,
  whatsapp_phone text,
  include_payments boolean NOT NULL DEFAULT true,
  include_memberships boolean NOT NULL DEFAULT true,
  include_attendance boolean NOT NULL DEFAULT true,
  include_trainers boolean NOT NULL DEFAULT true,
  include_branch_analysis boolean NOT NULL DEFAULT true,
  last_sent_at timestamp with time zone,
  next_run_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(branch_id)
);

-- Enable RLS
ALTER TABLE public.report_schedules ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "service_role_full_access_report_schedules"
ON public.report_schedules FOR ALL
USING (auth.role() = 'service_role'::text)
WITH CHECK (auth.role() = 'service_role'::text);

CREATE POLICY "super_admin_full_access_report_schedules"
ON public.report_schedules FOR ALL
USING (is_super_admin(auth.uid()))
WITH CHECK (is_super_admin(auth.uid()));

CREATE POLICY "tenant_members_manage_report_schedules"
ON public.report_schedules FOR ALL
USING (EXISTS (
  SELECT 1 FROM branches b
  WHERE b.id = report_schedules.branch_id
    AND b.tenant_id IS NOT NULL
    AND user_belongs_to_tenant(auth.uid(), b.tenant_id)
))
WITH CHECK (EXISTS (
  SELECT 1 FROM branches b
  WHERE b.id = report_schedules.branch_id
    AND b.tenant_id IS NOT NULL
    AND user_belongs_to_tenant(auth.uid(), b.tenant_id)
));

-- Index for cron job lookup
CREATE INDEX idx_report_schedules_next_run ON public.report_schedules(next_run_at) WHERE is_enabled = true;
