-- ============================================================
-- Custom Tenant Domains
-- ============================================================

-- 1. Table
CREATE TABLE public.tenant_domains (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  branch_id uuid REFERENCES public.branches(id) ON DELETE CASCADE,
  hostname text NOT NULL,
  is_primary boolean NOT NULL DEFAULT false,
  is_verified boolean NOT NULL DEFAULT false,
  verification_token text NOT NULL DEFAULT encode(gen_random_bytes(16), 'hex'),
  verified_at timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Unique hostname (case-insensitive)
CREATE UNIQUE INDEX idx_tenant_domains_hostname_unique
  ON public.tenant_domains (lower(hostname));

CREATE INDEX idx_tenant_domains_tenant
  ON public.tenant_domains (tenant_id);

-- Only one primary domain per tenant
CREATE UNIQUE INDEX idx_tenant_domains_one_primary_per_tenant
  ON public.tenant_domains (tenant_id)
  WHERE is_primary = true;

-- 2. updated_at trigger
CREATE TRIGGER trg_tenant_domains_updated_at
  BEFORE UPDATE ON public.tenant_domains
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- 3. RLS
ALTER TABLE public.tenant_domains ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins manage tenant_domains"
  ON public.tenant_domains
  FOR ALL
  TO authenticated
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));

CREATE POLICY "Tenant admins read own tenant_domains"
  ON public.tenant_domains
  FOR SELECT
  TO authenticated
  USING (public.is_tenant_admin(auth.uid(), tenant_id));

-- 4. Public hostname → tenant/branch resolver
CREATE OR REPLACE FUNCTION public.resolve_tenant_by_hostname(_hostname text)
RETURNS TABLE(
  tenant_id uuid,
  tenant_name text,
  branch_id uuid,
  branch_slug text,
  branch_name text,
  branch_logo_url text,
  is_verified boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    t.id        AS tenant_id,
    t.name      AS tenant_name,
    b.id        AS branch_id,
    b.slug      AS branch_slug,
    b.name      AS branch_name,
    b.logo_url  AS branch_logo_url,
    td.is_verified
  FROM public.tenant_domains td
  JOIN public.tenants t ON t.id = td.tenant_id
  LEFT JOIN public.branches b
    ON b.id = COALESCE(
         td.branch_id,
         (
           SELECT id FROM public.branches
           WHERE tenant_id = td.tenant_id
             AND is_default = true
             AND is_active = true
             AND deleted_at IS NULL
           ORDER BY created_at ASC
           LIMIT 1
         ),
         (
           SELECT id FROM public.branches
           WHERE tenant_id = td.tenant_id
             AND is_active = true
             AND deleted_at IS NULL
           ORDER BY created_at ASC
           LIMIT 1
         )
       )
  WHERE lower(td.hostname) = lower(_hostname)
    AND td.is_verified = true
    AND t.is_active = true
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.resolve_tenant_by_hostname(text) TO anon, authenticated;