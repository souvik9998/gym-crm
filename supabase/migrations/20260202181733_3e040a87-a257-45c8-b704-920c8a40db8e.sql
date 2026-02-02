-- =====================================================
-- MULTI-TENANT SAAS ARCHITECTURE - PHASE 1B
-- Core Tables and Indexes
-- =====================================================

-- 1. Create tenants table (gym organizations)
CREATE TABLE public.tenants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    email TEXT,
    phone TEXT,
    logo_url TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at TIMESTAMPTZ
);

-- 2. Create tenant_limits table (custom limits per tenant)
CREATE TABLE public.tenant_limits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    max_branches INTEGER NOT NULL DEFAULT 1,
    max_staff_per_branch INTEGER NOT NULL DEFAULT 5,
    max_members INTEGER NOT NULL DEFAULT 500,
    max_monthly_whatsapp_messages INTEGER NOT NULL DEFAULT 100,
    max_trainers INTEGER NOT NULL DEFAULT 10,
    features JSONB NOT NULL DEFAULT '{"analytics": true, "whatsapp": true, "daily_pass": true}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(tenant_id)
);

-- 3. Create tenant_usage table (usage metering)
CREATE TABLE public.tenant_usage (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
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

-- 4. Create tenant_members table (user-tenant mapping)
CREATE TABLE public.tenant_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    user_id UUID NOT NULL,
    role public.app_role NOT NULL DEFAULT 'staff',
    is_owner BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(tenant_id, user_id)
);

-- 5. Create platform_audit_logs table (super-admin actions)
CREATE TABLE public.platform_audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    actor_user_id UUID,
    action_type TEXT NOT NULL,
    target_tenant_id UUID REFERENCES public.tenants(id),
    target_user_id UUID,
    description TEXT NOT NULL,
    old_value JSONB,
    new_value JSONB,
    ip_address TEXT,
    user_agent TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 6. Create tenant_billing_info table (for future billing integration)
CREATE TABLE public.tenant_billing_info (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE UNIQUE,
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

-- 7. Add tenant_id to branches table
ALTER TABLE public.branches 
ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.tenants(id);

-- 8. Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_tenants_slug ON public.tenants(slug);
CREATE INDEX IF NOT EXISTS idx_tenants_is_active ON public.tenants(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_tenant_limits_tenant ON public.tenant_limits(tenant_id);
CREATE INDEX IF NOT EXISTS idx_tenant_usage_tenant_period ON public.tenant_usage(tenant_id, period_start);
CREATE INDEX IF NOT EXISTS idx_tenant_members_user ON public.tenant_members(user_id);
CREATE INDEX IF NOT EXISTS idx_tenant_members_tenant ON public.tenant_members(tenant_id);
CREATE INDEX IF NOT EXISTS idx_platform_audit_logs_tenant ON public.platform_audit_logs(target_tenant_id);
CREATE INDEX IF NOT EXISTS idx_platform_audit_logs_actor ON public.platform_audit_logs(actor_user_id);
CREATE INDEX IF NOT EXISTS idx_branches_tenant ON public.branches(tenant_id);

-- 9. Create updated_at triggers
CREATE TRIGGER update_tenants_updated_at
    BEFORE UPDATE ON public.tenants
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_tenant_limits_updated_at
    BEFORE UPDATE ON public.tenant_limits
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_tenant_usage_updated_at
    BEFORE UPDATE ON public.tenant_usage
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_tenant_members_updated_at
    BEFORE UPDATE ON public.tenant_members
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_tenant_billing_updated_at
    BEFORE UPDATE ON public.tenant_billing_info
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

-- 10. Enable RLS on all new tables
ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_billing_info ENABLE ROW LEVEL SECURITY;