-- Track QStash schedule IDs per branch + reminder kind so we can update/delete idempotently
CREATE TABLE public.qstash_schedules (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  branch_id UUID NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('expiring_soon', 'expired')),
  schedule_id TEXT NOT NULL,
  cron_expression TEXT NOT NULL,
  last_synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (branch_id, kind)
);

CREATE INDEX idx_qstash_schedules_branch ON public.qstash_schedules(branch_id);

ALTER TABLE public.qstash_schedules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins manage all qstash schedules"
ON public.qstash_schedules
FOR ALL
TO authenticated
USING (public.is_super_admin(auth.uid()))
WITH CHECK (public.is_super_admin(auth.uid()));

CREATE POLICY "Tenant admins manage their branches' qstash schedules"
ON public.qstash_schedules
FOR ALL
TO authenticated
USING (
  public.is_tenant_admin(auth.uid(), public.get_tenant_from_branch(branch_id))
)
WITH CHECK (
  public.is_tenant_admin(auth.uid(), public.get_tenant_from_branch(branch_id))
);

CREATE TRIGGER update_qstash_schedules_updated_at
BEFORE UPDATE ON public.qstash_schedules
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();