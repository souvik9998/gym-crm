
-- Create coupons table
CREATE TABLE public.coupons (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  branch_id UUID REFERENCES public.branches(id) ON DELETE CASCADE,
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  discount_type TEXT NOT NULL DEFAULT 'percentage',
  discount_value NUMERIC NOT NULL DEFAULT 0,
  max_discount_cap NUMERIC DEFAULT NULL,
  min_order_value NUMERIC DEFAULT 0,
  start_date DATE NOT NULL DEFAULT CURRENT_DATE,
  end_date DATE DEFAULT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  total_usage_limit INTEGER DEFAULT NULL,
  per_user_limit INTEGER NOT NULL DEFAULT 1,
  usage_count INTEGER NOT NULL DEFAULT 0,
  applicable_on JSONB NOT NULL DEFAULT '{"new_registration": true, "renewal": true}'::jsonb,
  applicable_plan_ids UUID[] DEFAULT NULL,
  applicable_branch_ids UUID[] DEFAULT NULL,
  first_time_only BOOLEAN NOT NULL DEFAULT false,
  existing_members_only BOOLEAN NOT NULL DEFAULT false,
  expired_members_only BOOLEAN NOT NULL DEFAULT false,
  specific_member_ids UUID[] DEFAULT NULL,
  stackable BOOLEAN NOT NULL DEFAULT false,
  auto_apply BOOLEAN NOT NULL DEFAULT false,
  notes TEXT DEFAULT NULL,
  created_by TEXT DEFAULT 'Admin',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create coupon_usage table
CREATE TABLE public.coupon_usage (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  coupon_id UUID NOT NULL REFERENCES public.coupons(id) ON DELETE CASCADE,
  member_id UUID REFERENCES public.members(id) ON DELETE SET NULL,
  branch_id UUID REFERENCES public.branches(id) ON DELETE SET NULL,
  payment_id UUID REFERENCES public.payments(id) ON DELETE SET NULL,
  discount_applied NUMERIC NOT NULL DEFAULT 0,
  used_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create unique index for coupon code per tenant
CREATE UNIQUE INDEX idx_coupons_code_tenant ON public.coupons(code, tenant_id) WHERE tenant_id IS NOT NULL;
CREATE UNIQUE INDEX idx_coupons_code_branch ON public.coupons(code, branch_id) WHERE tenant_id IS NULL AND branch_id IS NOT NULL;

-- Create index for active coupons lookup
CREATE INDEX idx_coupons_active ON public.coupons(is_active, start_date, end_date);
CREATE INDEX idx_coupon_usage_coupon_id ON public.coupon_usage(coupon_id);
CREATE INDEX idx_coupon_usage_member_id ON public.coupon_usage(member_id);

-- Enable RLS
ALTER TABLE public.coupons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coupon_usage ENABLE ROW LEVEL SECURITY;

-- RLS for coupons: tenant members can manage
CREATE POLICY "tenant_members_manage_coupons"
ON public.coupons FOR ALL TO authenticated
USING (
  (tenant_id IS NOT NULL AND user_belongs_to_tenant(auth.uid(), tenant_id))
  OR
  (branch_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM branches b WHERE b.id = coupons.branch_id AND b.tenant_id IS NOT NULL AND user_belongs_to_tenant(auth.uid(), b.tenant_id)
  ))
)
WITH CHECK (
  (tenant_id IS NOT NULL AND user_belongs_to_tenant(auth.uid(), tenant_id))
  OR
  (branch_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM branches b WHERE b.id = coupons.branch_id AND b.tenant_id IS NOT NULL AND user_belongs_to_tenant(auth.uid(), b.tenant_id)
  ))
);

-- Super admin full access
CREATE POLICY "super_admin_full_access_coupons"
ON public.coupons FOR ALL TO authenticated
USING (is_super_admin(auth.uid()))
WITH CHECK (is_super_admin(auth.uid()));

-- Staff with settings permission can manage
CREATE POLICY "staff_manage_coupons_with_permission"
ON public.coupons FOR ALL TO authenticated
USING (
  branch_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM staff s
    JOIN staff_permissions sp ON s.id = sp.staff_id
    JOIN staff_branch_assignments sba ON s.id = sba.staff_id
    WHERE s.auth_user_id = auth.uid() AND s.is_active = true
      AND sp.can_change_settings = true AND sba.branch_id = coupons.branch_id
  )
)
WITH CHECK (
  branch_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM staff s
    JOIN staff_permissions sp ON s.id = sp.staff_id
    JOIN staff_branch_assignments sba ON s.id = sba.staff_id
    WHERE s.auth_user_id = auth.uid() AND s.is_active = true
      AND sp.can_change_settings = true AND sba.branch_id = coupons.branch_id
  )
);

-- Public read for active coupons (needed for registration page validation)
CREATE POLICY "public_read_active_coupons"
ON public.coupons FOR SELECT TO anon
USING (is_active = true AND start_date <= CURRENT_DATE AND (end_date IS NULL OR end_date >= CURRENT_DATE));

-- Coupon usage policies
CREATE POLICY "tenant_members_manage_coupon_usage"
ON public.coupon_usage FOR ALL TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM coupons c
    WHERE c.id = coupon_usage.coupon_id
    AND (
      (c.tenant_id IS NOT NULL AND user_belongs_to_tenant(auth.uid(), c.tenant_id))
      OR (c.branch_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM branches b WHERE b.id = c.branch_id AND b.tenant_id IS NOT NULL AND user_belongs_to_tenant(auth.uid(), b.tenant_id)
      ))
    )
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM coupons c
    WHERE c.id = coupon_usage.coupon_id
    AND (
      (c.tenant_id IS NOT NULL AND user_belongs_to_tenant(auth.uid(), c.tenant_id))
      OR (c.branch_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM branches b WHERE b.id = c.branch_id AND b.tenant_id IS NOT NULL AND user_belongs_to_tenant(auth.uid(), b.tenant_id)
      ))
    )
  )
);

CREATE POLICY "super_admin_full_access_coupon_usage"
ON public.coupon_usage FOR ALL TO authenticated
USING (is_super_admin(auth.uid()))
WITH CHECK (is_super_admin(auth.uid()));

-- Public can insert coupon usage (for registration flow)
CREATE POLICY "public_insert_coupon_usage"
ON public.coupon_usage FOR INSERT TO anon
WITH CHECK (true);

-- Public can read coupon usage for validation
CREATE POLICY "public_read_coupon_usage"
ON public.coupon_usage FOR SELECT TO anon
USING (true);
