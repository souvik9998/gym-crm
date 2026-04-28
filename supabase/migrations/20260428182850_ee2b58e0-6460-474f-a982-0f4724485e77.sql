
CREATE TABLE IF NOT EXISTS public.whatsapp_scheduler_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id UUID REFERENCES public.branches(id) ON DELETE CASCADE,
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  job_name TEXT NOT NULL,
  trigger_source TEXT NOT NULL DEFAULT 'cron',
  status TEXT NOT NULL DEFAULT 'completed',
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ,
  duration_ms INTEGER,
  total_attempted INTEGER NOT NULL DEFAULT 0,
  total_sent INTEGER NOT NULL DEFAULT 0,
  total_failed INTEGER NOT NULL DEFAULT 0,
  expiring_soon_count INTEGER NOT NULL DEFAULT 0,
  expiring_today_count INTEGER NOT NULL DEFAULT 0,
  expired_count INTEGER NOT NULL DEFAULT 0,
  recipients JSONB NOT NULL DEFAULT '[]'::jsonb,
  error_message TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wa_sched_runs_branch_started
  ON public.whatsapp_scheduler_runs (branch_id, started_at DESC);

CREATE INDEX IF NOT EXISTS idx_wa_sched_runs_tenant_started
  ON public.whatsapp_scheduler_runs (tenant_id, started_at DESC);

ALTER TABLE public.whatsapp_scheduler_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins can view all scheduler runs"
ON public.whatsapp_scheduler_runs
FOR SELECT
USING (public.is_super_admin(auth.uid()));

CREATE POLICY "Tenant admins can view their scheduler runs"
ON public.whatsapp_scheduler_runs
FOR SELECT
USING (
  tenant_id IS NOT NULL
  AND public.is_tenant_admin(auth.uid(), tenant_id)
);

CREATE POLICY "Service role can insert scheduler runs"
ON public.whatsapp_scheduler_runs
FOR INSERT
WITH CHECK (true);
