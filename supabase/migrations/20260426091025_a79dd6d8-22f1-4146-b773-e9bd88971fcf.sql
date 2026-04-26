CREATE TABLE public.tenant_messaging_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL UNIQUE REFERENCES public.tenants(id) ON DELETE CASCADE,

  active_provider text NOT NULL DEFAULT 'periskope'
    CHECK (active_provider IN ('periskope', 'zavu', 'none')),

  -- Periskope (encrypted with RAZORPAY_ENCRYPTION_KEY via _shared/encryption.ts)
  periskope_api_key_encrypted text,
  periskope_api_key_iv text,
  periskope_phone text,
  periskope_verified_at timestamptz,

  -- Zavu
  zavu_api_key_encrypted text,
  zavu_api_key_iv text,
  zavu_sender_id text,
  zavu_verified_at timestamptz,

  -- Per-category template ids: { "new_registration": "tmpl_abc", ... }
  zavu_templates jsonb NOT NULL DEFAULT '{}'::jsonb,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_tenant_messaging_config_tenant ON public.tenant_messaging_config(tenant_id);

ALTER TABLE public.tenant_messaging_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins manage tenant messaging config"
ON public.tenant_messaging_config FOR ALL TO authenticated
USING (public.is_super_admin(auth.uid()))
WITH CHECK (public.is_super_admin(auth.uid()));

CREATE POLICY "Tenant admins can view their messaging config"
ON public.tenant_messaging_config FOR SELECT TO authenticated
USING (public.is_tenant_admin(auth.uid(), tenant_id));

CREATE TRIGGER trg_messaging_config_updated_at
BEFORE UPDATE ON public.tenant_messaging_config
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Backfill: one row per active tenant defaulting to Periskope so the UI opens cleanly.
INSERT INTO public.tenant_messaging_config (tenant_id, active_provider)
SELECT id, 'periskope'
FROM public.tenants
WHERE deleted_at IS NULL
ON CONFLICT (tenant_id) DO NOTHING;