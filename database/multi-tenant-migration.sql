-- ============================================================================
-- MULTI-TENANT SAAS MIGRATION
-- Project: Gym QR Pro
-- Target: ydswesigiavvgllqrbze.supabase.co
-- 
-- Run this SQL in your Supabase SQL Editor to add multi-tenant support.
-- This migration adds tenant management, resource limits, and platform audit logs.
-- ============================================================================

-- ============================================================================
-- 1. EXTEND EXISTING ENUMS
-- ============================================================================

-- Add new roles to app_role enum
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'super_admin';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'tenant_admin';

-- ============================================================================
-- 2. NEW TABLES FOR MULTI-TENANCY
-- ============================================================================

-- Tenants table (Organizations)
CREATE TABLE IF NOT EXISTS public.tenants (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    email TEXT,
    phone TEXT,
    logo_url TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at TIMESTAMPTZ
);

-- Tenant limits table (Resource quotas)
CREATE TABLE IF NOT EXISTS public.tenant_limits (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    tenant_id UUID NOT NULL UNIQUE REFERENCES public.tenants(id) ON DELETE CASCADE,
    max_branches INTEGER NOT NULL DEFAULT 1,
    max_staff_per_branch INTEGER NOT NULL DEFAULT 5,
    max_members INTEGER NOT NULL DEFAULT 500,
    max_trainers INTEGER NOT NULL DEFAULT 10,
    max_monthly_whatsapp_messages INTEGER NOT NULL DEFAULT 100,
    features JSONB NOT NULL DEFAULT '{"whatsapp": true, "analytics": true, "daily_pass": true}'::JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Tenant usage table (Resource consumption tracking)
CREATE TABLE IF NOT EXISTS public.tenant_usage (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    branches_count INTEGER NOT NULL DEFAULT 0,
    staff_count INTEGER NOT NULL DEFAULT 0,
    members_count INTEGER NOT NULL DEFAULT 0,
    trainers_count INTEGER NOT NULL DEFAULT 0,
    whatsapp_messages_sent INTEGER NOT NULL DEFAULT 0,
    total_revenue NUMERIC NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(tenant_id, period_start)
);

-- Tenant members table (User-Tenant mapping)
CREATE TABLE IF NOT EXISTS public.tenant_members (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    user_id UUID NOT NULL,
    role public.app_role NOT NULL DEFAULT 'staff',
    is_owner BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(tenant_id, user_id)
);

-- Tenant billing info table
CREATE TABLE IF NOT EXISTS public.tenant_billing_info (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    tenant_id UUID NOT NULL UNIQUE REFERENCES public.tenants(id) ON DELETE CASCADE,
    billing_email TEXT,
    billing_name TEXT,
    billing_address JSONB,
    tax_id TEXT,
    external_customer_id TEXT,
    external_subscription_id TEXT,
    current_plan_name TEXT DEFAULT 'custom',
    billing_cycle TEXT DEFAULT 'monthly',
    next_billing_date DATE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Platform audit logs table (Super admin activity)
CREATE TABLE IF NOT EXISTS public.platform_audit_logs (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    actor_user_id UUID,
    action_type TEXT NOT NULL,
    description TEXT NOT NULL,
    target_tenant_id UUID REFERENCES public.tenants(id),
    target_user_id UUID,
    old_value JSONB,
    new_value JSONB,
    ip_address TEXT,
    user_agent TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Add tenant_id to branches table if not exists
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_schema = 'public' 
                   AND table_name = 'branches' 
                   AND column_name = 'tenant_id') THEN
        ALTER TABLE public.branches ADD COLUMN tenant_id UUID REFERENCES public.tenants(id);
    END IF;
END $$;

-- ============================================================================
-- 3. SECURITY FUNCTIONS FOR MULTI-TENANCY
-- ============================================================================

-- Function to check if user is super admin
CREATE OR REPLACE FUNCTION public.is_super_admin(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.user_roles
        WHERE user_id = _user_id AND role = 'super_admin'
    )
$$;

-- Function to get user's tenant ID
CREATE OR REPLACE FUNCTION public.get_user_tenant_id(_user_id UUID)
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT tenant_id FROM public.tenant_members
    WHERE user_id = _user_id
    ORDER BY is_owner DESC, created_at ASC
    LIMIT 1
$$;

-- Function to check if user belongs to tenant
CREATE OR REPLACE FUNCTION public.user_belongs_to_tenant(_user_id UUID, _tenant_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.tenant_members
        WHERE user_id = _user_id AND tenant_id = _tenant_id
    )
$$;

-- Function to check if user is tenant admin
CREATE OR REPLACE FUNCTION public.is_tenant_admin(_user_id UUID, _tenant_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.tenant_members
        WHERE user_id = _user_id 
          AND tenant_id = _tenant_id 
          AND role IN ('tenant_admin', 'admin')
    )
$$;

-- Function to get tenant from branch
CREATE OR REPLACE FUNCTION public.get_tenant_from_branch(_branch_id UUID)
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT tenant_id FROM public.branches WHERE id = _branch_id
$$;

-- Function to get current tenant usage
CREATE OR REPLACE FUNCTION public.get_tenant_current_usage(_tenant_id UUID)
RETURNS TABLE(
    branches_count BIGINT, 
    staff_count BIGINT, 
    members_count BIGINT, 
    trainers_count BIGINT, 
    whatsapp_this_month BIGINT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_month_start DATE := date_trunc('month', CURRENT_DATE)::DATE;
BEGIN
    RETURN QUERY
    SELECT 
        (SELECT COUNT(*) FROM public.branches WHERE tenant_id = _tenant_id AND deleted_at IS NULL AND is_active = true)::BIGINT,
        (SELECT COUNT(*) FROM public.staff s 
         JOIN public.staff_branch_assignments sba ON s.id = sba.staff_id
         JOIN public.branches b ON sba.branch_id = b.id
         WHERE b.tenant_id = _tenant_id AND s.is_active = true)::BIGINT,
        (SELECT COUNT(*) FROM public.members m
         JOIN public.branches b ON m.branch_id = b.id
         WHERE b.tenant_id = _tenant_id)::BIGINT,
        (SELECT COUNT(*) FROM public.personal_trainers pt
         JOIN public.branches b ON pt.branch_id = b.id
         WHERE b.tenant_id = _tenant_id AND pt.is_active = true)::BIGINT,
        COALESCE((SELECT tu.whatsapp_messages_sent FROM public.tenant_usage tu
         WHERE tu.tenant_id = _tenant_id AND tu.period_start = v_month_start), 0)::BIGINT;
END;
$$;

-- Function to check if tenant can add resource
CREATE OR REPLACE FUNCTION public.tenant_can_add_resource(_tenant_id UUID, _resource_type TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_limits RECORD;
    v_usage RECORD;
BEGIN
    SELECT * INTO v_limits FROM public.tenant_limits WHERE tenant_id = _tenant_id;
    IF NOT FOUND THEN
        RETURN false;
    END IF;
    
    SELECT * INTO v_usage FROM public.get_tenant_current_usage(_tenant_id);
    
    CASE _resource_type
        WHEN 'branch' THEN
            RETURN v_usage.branches_count < v_limits.max_branches;
        WHEN 'staff' THEN
            RETURN v_usage.staff_count < (v_limits.max_staff_per_branch * v_limits.max_branches);
        WHEN 'member' THEN
            RETURN v_usage.members_count < v_limits.max_members;
        WHEN 'trainer' THEN
            RETURN v_usage.trainers_count < v_limits.max_trainers;
        WHEN 'whatsapp' THEN
            RETURN COALESCE(v_usage.whatsapp_this_month, 0) < v_limits.max_monthly_whatsapp_messages;
        ELSE
            RETURN false;
    END CASE;
END;
$$;

-- Function to increment WhatsApp usage
CREATE OR REPLACE FUNCTION public.increment_whatsapp_usage(_tenant_id UUID, _count INTEGER DEFAULT 1)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_month_start DATE := date_trunc('month', CURRENT_DATE)::DATE;
    v_month_end DATE := (date_trunc('month', CURRENT_DATE) + INTERVAL '1 month' - INTERVAL '1 day')::DATE;
BEGIN
    INSERT INTO public.tenant_usage (tenant_id, period_start, period_end, whatsapp_messages_sent)
    VALUES (_tenant_id, v_month_start, v_month_end, _count)
    ON CONFLICT (tenant_id, period_start)
    DO UPDATE SET 
        whatsapp_messages_sent = tenant_usage.whatsapp_messages_sent + _count,
        updated_at = now();
    
    RETURN true;
END;
$$;

-- ============================================================================
-- 4. ENABLE ROW LEVEL SECURITY ON NEW TABLES
-- ============================================================================

ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_billing_info ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_audit_logs ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- 5. RLS POLICIES FOR NEW TABLES
-- ============================================================================

-- Tenants policies
CREATE POLICY "Super admins can manage all tenants" ON public.tenants FOR ALL 
USING (is_super_admin(auth.uid()));

CREATE POLICY "Tenant members can view own tenant" ON public.tenants FOR SELECT 
USING (user_belongs_to_tenant(auth.uid(), id));

-- Tenant limits policies
CREATE POLICY "Super admins can manage all limits" ON public.tenant_limits FOR ALL 
USING (is_super_admin(auth.uid()));

CREATE POLICY "Tenant members can view own limits" ON public.tenant_limits FOR SELECT 
USING (user_belongs_to_tenant(auth.uid(), tenant_id));

-- Tenant usage policies
CREATE POLICY "Super admins can manage all usage" ON public.tenant_usage FOR ALL 
USING (is_super_admin(auth.uid()));

CREATE POLICY "Tenant members can view own usage" ON public.tenant_usage FOR SELECT 
USING (user_belongs_to_tenant(auth.uid(), tenant_id));

-- Tenant members policies
CREATE POLICY "Super admins can manage all tenant members" ON public.tenant_members FOR ALL 
USING (is_super_admin(auth.uid()));

CREATE POLICY "Tenant admins can manage their tenant members" ON public.tenant_members FOR ALL 
USING (is_tenant_admin(auth.uid(), tenant_id));

CREATE POLICY "Users can view own tenant membership" ON public.tenant_members FOR SELECT 
USING (user_id = auth.uid());

-- Tenant billing info policies
CREATE POLICY "Super admins can manage all billing" ON public.tenant_billing_info FOR ALL 
USING (is_super_admin(auth.uid()));

CREATE POLICY "Tenant owners can view own billing" ON public.tenant_billing_info FOR SELECT 
USING (
    EXISTS (
        SELECT 1 FROM tenant_members
        WHERE tenant_members.tenant_id = tenant_billing_info.tenant_id
        AND tenant_members.user_id = auth.uid()
        AND tenant_members.is_owner = true
    )
);

-- Platform audit logs policies
CREATE POLICY "Super admins can view all platform logs" ON public.platform_audit_logs FOR SELECT 
USING (is_super_admin(auth.uid()));

CREATE POLICY "Super admins can insert platform logs" ON public.platform_audit_logs FOR INSERT 
WITH CHECK (is_super_admin(auth.uid()) OR auth.role() = 'service_role');

-- ============================================================================
-- 6. UPDATE BRANCHES TABLE RLS FOR MULTI-TENANCY
-- ============================================================================

-- Drop existing policies that need updating (if they exist)
DROP POLICY IF EXISTS "Admins can view all branches including deleted" ON public.branches;
DROP POLICY IF EXISTS "Tenant members can access their branches" ON public.branches;

-- Add tenant-aware branch policy
CREATE POLICY "Admins can view all branches including deleted" ON public.branches FOR SELECT 
USING (has_role(auth.uid(), 'admin'));

CREATE POLICY "Tenant members can access their branches" ON public.branches FOR ALL 
USING (
    tenant_id IS NULL OR 
    is_super_admin(auth.uid()) OR 
    user_belongs_to_tenant(auth.uid(), tenant_id)
);

-- ============================================================================
-- 7. CREATE INDEXES FOR PERFORMANCE
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_tenants_slug ON public.tenants(slug);
CREATE INDEX IF NOT EXISTS idx_tenants_is_active ON public.tenants(is_active);
CREATE INDEX IF NOT EXISTS idx_tenant_members_user_id ON public.tenant_members(user_id);
CREATE INDEX IF NOT EXISTS idx_tenant_members_tenant_id ON public.tenant_members(tenant_id);
CREATE INDEX IF NOT EXISTS idx_tenant_usage_period ON public.tenant_usage(tenant_id, period_start);
CREATE INDEX IF NOT EXISTS idx_branches_tenant_id ON public.branches(tenant_id);
CREATE INDEX IF NOT EXISTS idx_platform_audit_logs_tenant ON public.platform_audit_logs(target_tenant_id);
CREATE INDEX IF NOT EXISTS idx_platform_audit_logs_created ON public.platform_audit_logs(created_at DESC);

-- ============================================================================
-- 8. ADD UPDATED_AT TRIGGERS
-- ============================================================================

CREATE TRIGGER update_tenants_updated_at BEFORE UPDATE ON public.tenants
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_tenant_limits_updated_at BEFORE UPDATE ON public.tenant_limits
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_tenant_usage_updated_at BEFORE UPDATE ON public.tenant_usage
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_tenant_members_updated_at BEFORE UPDATE ON public.tenant_members
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_tenant_billing_info_updated_at BEFORE UPDATE ON public.tenant_billing_info
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================
-- After running this migration, you should:
-- 1. Create a super_admin user in user_roles table
-- 2. Create your first tenant
-- 3. Assign the admin user to the tenant
-- 4. Optionally assign existing branches to the tenant
-- ============================================================================
