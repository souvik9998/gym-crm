
-- 1. Add new columns to tenant_limits
ALTER TABLE public.tenant_limits
  ADD COLUMN IF NOT EXISTS max_monthly_checkins integer NOT NULL DEFAULT 10000,
  ADD COLUMN IF NOT EXISTS max_storage_mb integer NOT NULL DEFAULT 500,
  ADD COLUMN IF NOT EXISTS plan_expiry_date date;

-- 2. Update existing features JSONB to include all 9 module toggles
UPDATE public.tenant_limits
SET features = jsonb_build_object(
  'members_management', COALESCE((features->>'members_management')::boolean, true),
  'attendance', COALESCE((features->>'attendance')::boolean, true),
  'payments_billing', COALESCE((features->>'payments_billing')::boolean, true),
  'staff_management', COALESCE((features->>'staff_management')::boolean, true),
  'reports_analytics', COALESCE((features->>'reports_analytics')::boolean, COALESCE((features->>'analytics')::boolean, true)),
  'workout_diet_plans', COALESCE((features->>'workout_diet_plans')::boolean, false),
  'notifications', COALESCE((features->>'notifications')::boolean, COALESCE((features->>'whatsapp')::boolean, true)),
  'integrations', COALESCE((features->>'integrations')::boolean, true),
  'leads_crm', COALESCE((features->>'leads_crm')::boolean, false)
);

-- 3. Create get_tenant_permissions function
CREATE OR REPLACE FUNCTION public.get_tenant_permissions(_tenant_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT COALESCE(features, '{}'::jsonb)
  FROM public.tenant_limits
  WHERE tenant_id = _tenant_id
  LIMIT 1
$$;

-- 4. Update get_tenant_current_usage to include monthly_checkins
DROP FUNCTION IF EXISTS public.get_tenant_current_usage(_tenant_id uuid);
CREATE OR REPLACE FUNCTION public.get_tenant_current_usage(_tenant_id uuid)
RETURNS TABLE(branches_count bigint, staff_count bigint, members_count bigint, trainers_count bigint, whatsapp_this_month bigint, monthly_checkins bigint)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
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
         WHERE tu.tenant_id = _tenant_id AND tu.period_start = v_month_start), 0)::BIGINT,
        (SELECT COUNT(*) FROM public.attendance_logs al
         JOIN public.branches b ON al.branch_id = b.id
         WHERE b.tenant_id = _tenant_id AND al.date >= v_month_start)::BIGINT;
END;
$$;

-- 5. Update tenant_can_add_resource to support 'checkin' type
CREATE OR REPLACE FUNCTION public.tenant_can_add_resource(_tenant_id uuid, _resource_type text)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    v_limits RECORD;
    v_usage RECORD;
    v_expiry_date DATE;
BEGIN
    SELECT * INTO v_limits FROM public.tenant_limits WHERE tenant_id = _tenant_id;
    IF NOT FOUND THEN
        RETURN false;
    END IF;
    
    -- Check plan expiry
    v_expiry_date := v_limits.plan_expiry_date;
    IF v_expiry_date IS NOT NULL AND v_expiry_date < CURRENT_DATE THEN
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
        WHEN 'checkin' THEN
            RETURN v_usage.monthly_checkins < v_limits.max_monthly_checkins;
        ELSE
            RETURN false;
    END CASE;
END;
$$;
