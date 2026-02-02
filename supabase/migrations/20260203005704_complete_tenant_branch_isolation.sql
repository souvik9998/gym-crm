-- =====================================================
-- COMPLETE TENANT AND BRANCH ISOLATION
-- This migration ensures complete data isolation between
-- tenants and branches using Row-Level Security (RLS)
-- =====================================================

-- =====================================================
-- 1. HELPER FUNCTIONS FOR BRANCH ACCESS
-- =====================================================

-- Function to check if user has access to a branch
-- Returns true if:
--   - User is super admin
--   - User belongs to tenant that owns the branch
--   - User is staff assigned to the branch
CREATE OR REPLACE FUNCTION public.user_has_branch_access(_user_id UUID, _branch_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_branch_tenant_id UUID;
BEGIN
    -- Super admins have access to all branches
    IF public.is_super_admin(_user_id) THEN
        RETURN true;
    END IF;
    
    -- Get tenant_id from branch
    SELECT tenant_id INTO v_branch_tenant_id
    FROM public.branches
    WHERE id = _branch_id AND deleted_at IS NULL;
    
    -- If branch doesn't exist, deny access
    IF v_branch_tenant_id IS NULL THEN
        -- Check if it's a legacy branch (no tenant_id) and user is admin
        IF EXISTS (
            SELECT 1 FROM public.branches b
            WHERE b.id = _branch_id 
            AND b.tenant_id IS NULL 
            AND b.deleted_at IS NULL
        ) THEN
            RETURN EXISTS (
                SELECT 1 FROM public.user_roles
                WHERE user_id = _user_id AND role = 'admin'
            );
        END IF;
        RETURN false;
    END IF;
    
    -- Check if user belongs to the tenant that owns the branch
    IF public.user_belongs_to_tenant(_user_id, v_branch_tenant_id) THEN
        RETURN true;
    END IF;
    
    -- Check if user is staff assigned to this branch
    IF EXISTS (
        SELECT 1 FROM public.staff s
        JOIN public.staff_branch_assignments sba ON s.id = sba.staff_id
        WHERE s.auth_user_id = _user_id
        AND sba.branch_id = _branch_id
        AND s.is_active = true
    ) THEN
        RETURN true;
    END IF;
    
    RETURN false;
END;
$$;

-- Function to check if user has access to branch via branch_id column
-- Used in RLS policies for tables with branch_id
CREATE OR REPLACE FUNCTION public.user_has_access_to_branch_id(_user_id UUID, _branch_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT public.user_has_branch_access(_user_id, _branch_id)
$$;

-- Function to get all branch IDs user has access to
CREATE OR REPLACE FUNCTION public.get_user_accessible_branch_ids(_user_id UUID)
RETURNS UUID[]
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_branch_ids UUID[];
    v_tenant_id UUID;
BEGIN
    -- Super admins have access to all branches
    IF public.is_super_admin(_user_id) THEN
        SELECT ARRAY_AGG(id) INTO v_branch_ids
        FROM public.branches
        WHERE deleted_at IS NULL;
        RETURN COALESCE(v_branch_ids, ARRAY[]::UUID[]);
    END IF;
    
    -- Get user's tenant_id
    v_tenant_id := public.get_user_tenant_id(_user_id);
    
    -- Get branches from user's tenant
    SELECT ARRAY_AGG(id) INTO v_branch_ids
    FROM public.branches
    WHERE tenant_id = v_tenant_id AND deleted_at IS NULL;
    
    -- Also include legacy branches (no tenant_id) if user is admin
    IF EXISTS (
        SELECT 1 FROM public.user_roles
        WHERE user_id = _user_id AND role = 'admin'
    ) THEN
        SELECT ARRAY_AGG(id) INTO v_branch_ids
        FROM public.branches
        WHERE tenant_id IS NULL AND deleted_at IS NULL;
    END IF;
    
    -- Add branches where user is assigned as staff
    SELECT ARRAY_AGG(DISTINCT sba.branch_id) INTO v_branch_ids
    FROM public.staff s
    JOIN public.staff_branch_assignments sba ON s.id = sba.staff_id
    WHERE s.auth_user_id = _user_id
    AND s.is_active = true;
    
    RETURN COALESCE(v_branch_ids, ARRAY[]::UUID[]);
END;
$$;

-- =====================================================
-- 2. UPDATE RLS POLICIES FOR MEMBERS TABLE
-- =====================================================

-- Drop existing policies
DROP POLICY IF EXISTS "Admins can view all members" ON public.members;
DROP POLICY IF EXISTS "Admins can insert members" ON public.members;
DROP POLICY IF EXISTS "Admins can update members" ON public.members;
DROP POLICY IF EXISTS "Admins can delete members" ON public.members;
DROP POLICY IF EXISTS "Public can check if member exists by phone" ON public.members;
DROP POLICY IF EXISTS "Public can register as member" ON public.members;
DROP POLICY IF EXISTS "Staff can view members with permission" ON public.members;
DROP POLICY IF EXISTS "Staff can insert members with permission" ON public.members;
DROP POLICY IF EXISTS "Staff can update members with permission" ON public.members;

-- Super admins can do everything
CREATE POLICY "Super admins can manage all members"
ON public.members FOR ALL
USING (public.is_super_admin(auth.uid()));

-- Tenant members can manage members in their branches
CREATE POLICY "Tenant members can manage members in their branches"
ON public.members FOR ALL
USING (
    branch_id IS NOT NULL AND 
    public.user_has_branch_access(auth.uid(), branch_id)
)
WITH CHECK (
    branch_id IS NOT NULL AND 
    public.user_has_branch_access(auth.uid(), branch_id)
);

-- Staff can view members in assigned branches (with permission)
CREATE POLICY "Staff can view members in assigned branches"
ON public.members FOR SELECT
USING (
    branch_id IS NOT NULL AND
    EXISTS (
        SELECT 1 FROM public.staff s
        JOIN public.staff_branch_assignments sba ON s.id = sba.staff_id
        JOIN public.staff_permissions sp ON s.id = sp.staff_id
        WHERE s.auth_user_id = auth.uid()
        AND sba.branch_id = members.branch_id
        AND s.is_active = true
        AND sp.can_view_members = true
    )
);

-- Staff can insert members in assigned branches (with permission)
CREATE POLICY "Staff can insert members in assigned branches"
ON public.members FOR INSERT
WITH CHECK (
    branch_id IS NOT NULL AND
    EXISTS (
        SELECT 1 FROM public.staff s
        JOIN public.staff_branch_assignments sba ON s.id = sba.staff_id
        JOIN public.staff_permissions sp ON s.id = sp.staff_id
        WHERE s.auth_user_id = auth.uid()
        AND sba.branch_id = members.branch_id
        AND s.is_active = true
        AND sp.can_manage_members = true
    )
);

-- Staff can update members in assigned branches (with permission)
CREATE POLICY "Staff can update members in assigned branches"
ON public.members FOR UPDATE
USING (
    branch_id IS NOT NULL AND
    EXISTS (
        SELECT 1 FROM public.staff s
        JOIN public.staff_branch_assignments sba ON s.id = sba.staff_id
        JOIN public.staff_permissions sp ON s.id = sp.staff_id
        WHERE s.auth_user_id = auth.uid()
        AND sba.branch_id = members.branch_id
        AND s.is_active = true
        AND sp.can_manage_members = true
    )
);

-- Public can check if member exists by phone (for registration)
CREATE POLICY "Public can check if member exists by phone"
ON public.members FOR SELECT
USING (true);

-- Public can register as member (insert only)
CREATE POLICY "Public can register as member"
ON public.members FOR INSERT
WITH CHECK (true);

-- =====================================================
-- 3. UPDATE RLS POLICIES FOR SUBSCRIPTIONS TABLE
-- =====================================================

-- Drop existing policies
DROP POLICY IF EXISTS "Admins can view all subscriptions" ON public.subscriptions;
DROP POLICY IF EXISTS "Admins can manage subscriptions" ON public.subscriptions;
DROP POLICY IF EXISTS "Public can view subscriptions" ON public.subscriptions;
DROP POLICY IF EXISTS "Public can insert subscriptions" ON public.subscriptions;
DROP POLICY IF EXISTS "Staff can insert subscriptions with permission" ON public.subscriptions;

-- Super admins can do everything
CREATE POLICY "Super admins can manage all subscriptions"
ON public.subscriptions FOR ALL
USING (public.is_super_admin(auth.uid()));

-- Tenant members can manage subscriptions in their branches
CREATE POLICY "Tenant members can manage subscriptions in their branches"
ON public.subscriptions FOR ALL
USING (
    branch_id IS NOT NULL AND 
    public.user_has_branch_access(auth.uid(), branch_id)
)
WITH CHECK (
    branch_id IS NOT NULL AND 
    public.user_has_branch_access(auth.uid(), branch_id)
);

-- Staff can insert subscriptions in assigned branches (with permission)
CREATE POLICY "Staff can insert subscriptions in assigned branches"
ON public.subscriptions FOR INSERT
WITH CHECK (
    branch_id IS NOT NULL AND
    EXISTS (
        SELECT 1 FROM public.staff s
        JOIN public.staff_branch_assignments sba ON s.id = sba.staff_id
        JOIN public.staff_permissions sp ON s.id = sp.staff_id
        WHERE s.auth_user_id = auth.uid()
        AND sba.branch_id = subscriptions.branch_id
        AND s.is_active = true
        AND sp.can_manage_members = true
    )
);

-- Public can view and insert subscriptions (for member self-service)
CREATE POLICY "Public can view subscriptions"
ON public.subscriptions FOR SELECT
USING (true);

CREATE POLICY "Public can insert subscriptions"
ON public.subscriptions FOR INSERT
WITH CHECK (true);

-- =====================================================
-- 4. UPDATE RLS POLICIES FOR PAYMENTS TABLE
-- =====================================================

-- Drop existing policies
DROP POLICY IF EXISTS "Admins can view all payments" ON public.payments;
DROP POLICY IF EXISTS "Admins can manage payments" ON public.payments;
DROP POLICY IF EXISTS "Public can view own payments" ON public.payments;
DROP POLICY IF EXISTS "Public can insert payments" ON public.payments;
DROP POLICY IF EXISTS "Staff can insert payments with permission" ON public.payments;

-- Super admins can do everything
CREATE POLICY "Super admins can manage all payments"
ON public.payments FOR ALL
USING (public.is_super_admin(auth.uid()));

-- Tenant members can manage payments in their branches
CREATE POLICY "Tenant members can manage payments in their branches"
ON public.payments FOR ALL
USING (
    branch_id IS NOT NULL AND 
    public.user_has_branch_access(auth.uid(), branch_id)
)
WITH CHECK (
    branch_id IS NOT NULL AND 
    public.user_has_branch_access(auth.uid(), branch_id)
);

-- Staff can insert payments in assigned branches (with permission)
CREATE POLICY "Staff can insert payments in assigned branches"
ON public.payments FOR INSERT
WITH CHECK (
    branch_id IS NOT NULL AND
    EXISTS (
        SELECT 1 FROM public.staff s
        JOIN public.staff_branch_assignments sba ON s.id = sba.staff_id
        JOIN public.staff_permissions sp ON s.id = sp.staff_id
        WHERE s.auth_user_id = auth.uid()
        AND sba.branch_id = payments.branch_id
        AND s.is_active = true
        AND sp.can_access_payments = true
    )
);

-- Public can view and insert payments
CREATE POLICY "Public can view own payments"
ON public.payments FOR SELECT
USING (true);

CREATE POLICY "Public can insert payments"
ON public.payments FOR INSERT
WITH CHECK (true);

-- =====================================================
-- 5. UPDATE RLS POLICIES FOR DAILY_PASS_USERS TABLE
-- =====================================================

-- Drop existing policies
DROP POLICY IF EXISTS "Admins can manage daily pass users" ON public.daily_pass_users;
DROP POLICY IF EXISTS "Public can view daily pass users" ON public.daily_pass_users;
DROP POLICY IF EXISTS "Public can insert daily pass users" ON public.daily_pass_users;

-- Super admins can do everything
CREATE POLICY "Super admins can manage all daily pass users"
ON public.daily_pass_users FOR ALL
USING (public.is_super_admin(auth.uid()));

-- Tenant members can manage daily pass users in their branches
CREATE POLICY "Tenant members can manage daily pass users in their branches"
ON public.daily_pass_users FOR ALL
USING (
    branch_id IS NOT NULL AND 
    public.user_has_branch_access(auth.uid(), branch_id)
)
WITH CHECK (
    branch_id IS NOT NULL AND 
    public.user_has_branch_access(auth.uid(), branch_id)
);

-- Public can view and insert daily pass users
CREATE POLICY "Public can view daily pass users"
ON public.daily_pass_users FOR SELECT
USING (true);

CREATE POLICY "Public can insert daily pass users"
ON public.daily_pass_users FOR INSERT
WITH CHECK (true);

-- =====================================================
-- 6. UPDATE RLS POLICIES FOR DAILY_PASS_SUBSCRIPTIONS TABLE
-- =====================================================

-- Drop existing policies
DROP POLICY IF EXISTS "Admins can manage daily pass subscriptions" ON public.daily_pass_subscriptions;
DROP POLICY IF EXISTS "Public can view daily pass subscriptions" ON public.daily_pass_subscriptions;
DROP POLICY IF EXISTS "Public can insert daily pass subscriptions" ON public.daily_pass_subscriptions;

-- Super admins can do everything
CREATE POLICY "Super admins can manage all daily pass subscriptions"
ON public.daily_pass_subscriptions FOR ALL
USING (public.is_super_admin(auth.uid()));

-- Tenant members can manage daily pass subscriptions in their branches
CREATE POLICY "Tenant members can manage daily pass subscriptions in their branches"
ON public.daily_pass_subscriptions FOR ALL
USING (
    branch_id IS NOT NULL AND 
    public.user_has_branch_access(auth.uid(), branch_id)
)
WITH CHECK (
    branch_id IS NOT NULL AND 
    public.user_has_branch_access(auth.uid(), branch_id)
);

-- Public can view and insert daily pass subscriptions
CREATE POLICY "Public can view daily pass subscriptions"
ON public.daily_pass_subscriptions FOR SELECT
USING (true);

CREATE POLICY "Public can insert daily pass subscriptions"
ON public.daily_pass_subscriptions FOR INSERT
WITH CHECK (true);

-- =====================================================
-- 7. UPDATE RLS POLICIES FOR PT_SUBSCRIPTIONS TABLE
-- =====================================================

-- Drop existing policies
DROP POLICY IF EXISTS "Admins can manage PT subscriptions" ON public.pt_subscriptions;
DROP POLICY IF EXISTS "Public can view PT subscriptions" ON public.pt_subscriptions;
DROP POLICY IF EXISTS "Public can insert PT subscriptions" ON public.pt_subscriptions;
DROP POLICY IF EXISTS "Staff can insert PT subscriptions with permission" ON public.pt_subscriptions;
DROP POLICY IF EXISTS "Staff can update PT subscriptions with permission" ON public.pt_subscriptions;

-- Super admins can do everything
CREATE POLICY "Super admins can manage all PT subscriptions"
ON public.pt_subscriptions FOR ALL
USING (public.is_super_admin(auth.uid()));

-- Tenant members can manage PT subscriptions in their branches
CREATE POLICY "Tenant members can manage PT subscriptions in their branches"
ON public.pt_subscriptions FOR ALL
USING (
    branch_id IS NOT NULL AND 
    public.user_has_branch_access(auth.uid(), branch_id)
)
WITH CHECK (
    branch_id IS NOT NULL AND 
    public.user_has_branch_access(auth.uid(), branch_id)
);

-- Staff can insert PT subscriptions in assigned branches (with permission)
CREATE POLICY "Staff can insert PT subscriptions in assigned branches"
ON public.pt_subscriptions FOR INSERT
WITH CHECK (
    branch_id IS NOT NULL AND
    EXISTS (
        SELECT 1 FROM public.staff s
        JOIN public.staff_branch_assignments sba ON s.id = sba.staff_id
        JOIN public.staff_permissions sp ON s.id = sp.staff_id
        WHERE s.auth_user_id = auth.uid()
        AND sba.branch_id = pt_subscriptions.branch_id
        AND s.is_active = true
        AND sp.can_manage_members = true
    )
);

-- Staff can update PT subscriptions in assigned branches (with permission)
CREATE POLICY "Staff can update PT subscriptions in assigned branches"
ON public.pt_subscriptions FOR UPDATE
USING (
    branch_id IS NOT NULL AND
    EXISTS (
        SELECT 1 FROM public.staff s
        JOIN public.staff_branch_assignments sba ON s.id = sba.staff_id
        JOIN public.staff_permissions sp ON s.id = sp.staff_id
        WHERE s.auth_user_id = auth.uid()
        AND sba.branch_id = pt_subscriptions.branch_id
        AND s.is_active = true
        AND sp.can_manage_members = true
    )
);

-- Public can view and insert PT subscriptions
CREATE POLICY "Public can view PT subscriptions"
ON public.pt_subscriptions FOR SELECT
USING (true);

CREATE POLICY "Public can insert PT subscriptions"
ON public.pt_subscriptions FOR INSERT
WITH CHECK (true);

-- =====================================================
-- 8. UPDATE RLS POLICIES FOR PERSONAL_TRAINERS TABLE
-- =====================================================

-- Drop existing policies
DROP POLICY IF EXISTS "Anyone can view active trainers" ON public.personal_trainers;
DROP POLICY IF EXISTS "Admins can manage trainers" ON public.personal_trainers;

-- Super admins can do everything
CREATE POLICY "Super admins can manage all personal trainers"
ON public.personal_trainers FOR ALL
USING (public.is_super_admin(auth.uid()));

-- Tenant members can manage trainers in their branches
CREATE POLICY "Tenant members can manage trainers in their branches"
ON public.personal_trainers FOR ALL
USING (
    branch_id IS NOT NULL AND 
    public.user_has_branch_access(auth.uid(), branch_id)
)
WITH CHECK (
    branch_id IS NOT NULL AND 
    public.user_has_branch_access(auth.uid(), branch_id)
);

-- Public can view active trainers
CREATE POLICY "Public can view active trainers"
ON public.personal_trainers FOR SELECT
USING (is_active = true);

-- =====================================================
-- 9. UPDATE RLS POLICIES FOR MONTHLY_PACKAGES TABLE
-- =====================================================

-- Drop existing policies
DROP POLICY IF EXISTS "Anyone can view active monthly packages" ON public.monthly_packages;
DROP POLICY IF EXISTS "Admins can manage monthly packages" ON public.monthly_packages;
DROP POLICY IF EXISTS "Staff can manage monthly packages with permission" ON public.monthly_packages;

-- Super admins can do everything
CREATE POLICY "Super admins can manage all monthly packages"
ON public.monthly_packages FOR ALL
USING (public.is_super_admin(auth.uid()));

-- Tenant members can manage packages in their branches
CREATE POLICY "Tenant members can manage monthly packages in their branches"
ON public.monthly_packages FOR ALL
USING (
    branch_id IS NOT NULL AND 
    public.user_has_branch_access(auth.uid(), branch_id)
)
WITH CHECK (
    branch_id IS NOT NULL AND 
    public.user_has_branch_access(auth.uid(), branch_id)
);

-- Staff can manage packages in assigned branches (with permission)
CREATE POLICY "Staff can manage monthly packages in assigned branches"
ON public.monthly_packages FOR ALL
USING (
    branch_id IS NOT NULL AND
    EXISTS (
        SELECT 1 FROM public.staff s
        JOIN public.staff_branch_assignments sba ON s.id = sba.staff_id
        JOIN public.staff_permissions sp ON s.id = sp.staff_id
        WHERE s.auth_user_id = auth.uid()
        AND sba.branch_id = monthly_packages.branch_id
        AND s.is_active = true
        AND sp.can_change_settings = true
    )
);

-- Public can view active packages
CREATE POLICY "Public can view active monthly packages"
ON public.monthly_packages FOR SELECT
USING (is_active = true);

-- =====================================================
-- 10. UPDATE RLS POLICIES FOR CUSTOM_PACKAGES TABLE
-- =====================================================

-- Drop existing policies
DROP POLICY IF EXISTS "Anyone can view active packages" ON public.custom_packages;
DROP POLICY IF EXISTS "Admins can manage packages" ON public.custom_packages;
DROP POLICY IF EXISTS "Staff can manage custom packages with permission" ON public.custom_packages;

-- Super admins can do everything
CREATE POLICY "Super admins can manage all custom packages"
ON public.custom_packages FOR ALL
USING (public.is_super_admin(auth.uid()));

-- Tenant members can manage packages in their branches
CREATE POLICY "Tenant members can manage custom packages in their branches"
ON public.custom_packages FOR ALL
USING (
    branch_id IS NOT NULL AND 
    public.user_has_branch_access(auth.uid(), branch_id)
)
WITH CHECK (
    branch_id IS NOT NULL AND 
    public.user_has_branch_access(auth.uid(), branch_id)
);

-- Staff can manage packages in assigned branches (with permission)
CREATE POLICY "Staff can manage custom packages in assigned branches"
ON public.custom_packages FOR ALL
USING (
    branch_id IS NOT NULL AND
    EXISTS (
        SELECT 1 FROM public.staff s
        JOIN public.staff_branch_assignments sba ON s.id = sba.staff_id
        JOIN public.staff_permissions sp ON s.id = sp.staff_id
        WHERE s.auth_user_id = auth.uid()
        AND sba.branch_id = custom_packages.branch_id
        AND s.is_active = true
        AND sp.can_change_settings = true
    )
);

-- Public can view active packages
CREATE POLICY "Public can view active custom packages"
ON public.custom_packages FOR SELECT
USING (is_active = true);

-- =====================================================
-- 11. UPDATE RLS POLICIES FOR LEDGER_ENTRIES TABLE
-- =====================================================

-- Drop existing policies
DROP POLICY IF EXISTS "Admins can manage ledger entries" ON public.ledger_entries;
DROP POLICY IF EXISTS "Public can insert ledger entries" ON public.ledger_entries;
DROP POLICY IF EXISTS "Public can view ledger entries" ON public.ledger_entries;
DROP POLICY IF EXISTS "Staff can insert ledger entries with permission" ON public.ledger_entries;
DROP POLICY IF EXISTS "Staff can update ledger entries with permission" ON public.ledger_entries;
DROP POLICY IF EXISTS "Staff can delete ledger entries with permission" ON public.ledger_entries;

-- Super admins can do everything
CREATE POLICY "Super admins can manage all ledger entries"
ON public.ledger_entries FOR ALL
USING (public.is_super_admin(auth.uid()));

-- Tenant members can manage ledger entries in their branches
CREATE POLICY "Tenant members can manage ledger entries in their branches"
ON public.ledger_entries FOR ALL
USING (
    branch_id IS NOT NULL AND 
    public.user_has_branch_access(auth.uid(), branch_id)
)
WITH CHECK (
    branch_id IS NOT NULL AND 
    public.user_has_branch_access(auth.uid(), branch_id)
);

-- Staff can manage ledger entries in assigned branches (with permission)
CREATE POLICY "Staff can manage ledger entries in assigned branches"
ON public.ledger_entries FOR ALL
USING (
    branch_id IS NOT NULL AND
    EXISTS (
        SELECT 1 FROM public.staff s
        JOIN public.staff_branch_assignments sba ON s.id = sba.staff_id
        JOIN public.staff_permissions sp ON s.id = sp.staff_id
        WHERE s.auth_user_id = auth.uid()
        AND sba.branch_id = ledger_entries.branch_id
        AND s.is_active = true
        AND sp.can_access_ledger = true
    )
)
WITH CHECK (
    branch_id IS NOT NULL AND
    EXISTS (
        SELECT 1 FROM public.staff s
        JOIN public.staff_branch_assignments sba ON s.id = sba.staff_id
        JOIN public.staff_permissions sp ON s.id = sp.staff_id
        WHERE s.auth_user_id = auth.uid()
        AND sba.branch_id = ledger_entries.branch_id
        AND s.is_active = true
        AND sp.can_access_ledger = true
    )
);

-- =====================================================
-- 12. UPDATE RLS POLICIES FOR GYM_SETTINGS TABLE
-- =====================================================

-- Drop existing policies
DROP POLICY IF EXISTS "Anyone can view gym settings" ON public.gym_settings;
DROP POLICY IF EXISTS "Admins can update gym settings" ON public.gym_settings;
DROP POLICY IF EXISTS "Admins can insert gym settings" ON public.gym_settings;
DROP POLICY IF EXISTS "Staff can update gym settings with permission" ON public.gym_settings;

-- Super admins can do everything
CREATE POLICY "Super admins can manage all gym settings"
ON public.gym_settings FOR ALL
USING (public.is_super_admin(auth.uid()));

-- Tenant members can manage settings in their branches
CREATE POLICY "Tenant members can manage gym settings in their branches"
ON public.gym_settings FOR ALL
USING (
    branch_id IS NOT NULL AND 
    public.user_has_branch_access(auth.uid(), branch_id)
)
WITH CHECK (
    branch_id IS NOT NULL AND 
    public.user_has_branch_access(auth.uid(), branch_id)
);

-- Staff can update settings in assigned branches (with permission)
CREATE POLICY "Staff can update gym settings in assigned branches"
ON public.gym_settings FOR UPDATE
USING (
    branch_id IS NOT NULL AND
    EXISTS (
        SELECT 1 FROM public.staff s
        JOIN public.staff_branch_assignments sba ON s.id = sba.staff_id
        JOIN public.staff_permissions sp ON s.id = sp.staff_id
        WHERE s.auth_user_id = auth.uid()
        AND sba.branch_id = gym_settings.branch_id
        AND s.is_active = true
        AND sp.can_change_settings = true
    )
);

-- Public can view gym settings
CREATE POLICY "Public can view gym settings"
ON public.gym_settings FOR SELECT
USING (true);

-- =====================================================
-- 13. UPDATE RLS POLICIES FOR MEMBER_DETAILS TABLE
-- =====================================================

-- Drop existing policies
DROP POLICY IF EXISTS "Public can insert member details" ON public.member_details;
DROP POLICY IF EXISTS "Public can view member details" ON public.member_details;
DROP POLICY IF EXISTS "Admins can manage member details" ON public.member_details;
DROP POLICY IF EXISTS "Staff can update member details with permission" ON public.member_details;

-- Super admins can do everything
CREATE POLICY "Super admins can manage all member details"
ON public.member_details FOR ALL
USING (public.is_super_admin(auth.uid()));

-- Tenant members can manage member details via member's branch
CREATE POLICY "Tenant members can manage member details in their branches"
ON public.member_details FOR ALL
USING (
    EXISTS (
        SELECT 1 FROM public.members m
        WHERE m.id = member_details.member_id
        AND m.branch_id IS NOT NULL
        AND public.user_has_branch_access(auth.uid(), m.branch_id)
    )
)
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.members m
        WHERE m.id = member_details.member_id
        AND m.branch_id IS NOT NULL
        AND public.user_has_branch_access(auth.uid(), m.branch_id)
    )
);

-- Staff can update member details in assigned branches (with permission)
CREATE POLICY "Staff can update member details in assigned branches"
ON public.member_details FOR UPDATE
USING (
    EXISTS (
        SELECT 1 FROM public.members m
        JOIN public.staff s ON s.auth_user_id = auth.uid()
        JOIN public.staff_branch_assignments sba ON s.id = sba.staff_id
        JOIN public.staff_permissions sp ON s.id = sp.staff_id
        WHERE m.id = member_details.member_id
        AND m.branch_id = sba.branch_id
        AND s.is_active = true
        AND sp.can_manage_members = true
    )
);

-- Public can view and insert member details
CREATE POLICY "Public can view member details"
ON public.member_details FOR SELECT
USING (true);

CREATE POLICY "Public can insert member details"
ON public.member_details FOR INSERT
WITH CHECK (true);

-- =====================================================
-- 14. UPDATE RLS POLICIES FOR USER_ACTIVITY_LOGS TABLE
-- =====================================================

-- Drop existing policies
DROP POLICY IF EXISTS "Admins can manage user activity logs" ON public.user_activity_logs;
DROP POLICY IF EXISTS "Public can insert user activity logs" ON public.user_activity_logs;
DROP POLICY IF EXISTS "Public can view user activity logs" ON public.user_activity_logs;
DROP POLICY IF EXISTS "Staff can view activity logs" ON public.user_activity_logs;
DROP POLICY IF EXISTS "Staff can insert activity logs" ON public.user_activity_logs;

-- Super admins can do everything
CREATE POLICY "Super admins can manage all user activity logs"
ON public.user_activity_logs FOR ALL
USING (public.is_super_admin(auth.uid()));

-- Tenant members can view logs in their branches
CREATE POLICY "Tenant members can view user activity logs in their branches"
ON public.user_activity_logs FOR SELECT
USING (
    branch_id IS NOT NULL AND 
    public.user_has_branch_access(auth.uid(), branch_id)
);

-- Staff can view and insert logs in assigned branches
CREATE POLICY "Staff can view activity logs in assigned branches"
ON public.user_activity_logs FOR SELECT
USING (
    branch_id IS NOT NULL AND
    EXISTS (
        SELECT 1 FROM public.staff s
        JOIN public.staff_branch_assignments sba ON s.id = sba.staff_id
        WHERE s.auth_user_id = auth.uid()
        AND sba.branch_id = user_activity_logs.branch_id
        AND s.is_active = true
    )
);

CREATE POLICY "Staff can insert activity logs in assigned branches"
ON public.user_activity_logs FOR INSERT
WITH CHECK (
    branch_id IS NOT NULL AND
    EXISTS (
        SELECT 1 FROM public.staff s
        JOIN public.staff_branch_assignments sba ON s.id = sba.staff_id
        WHERE s.auth_user_id = auth.uid()
        AND sba.branch_id = user_activity_logs.branch_id
        AND s.is_active = true
    )
);

-- Public can insert activity logs
CREATE POLICY "Public can insert user activity logs"
ON public.user_activity_logs FOR INSERT
WITH CHECK (true);

-- =====================================================
-- 15. UPDATE RLS POLICIES FOR ADMIN_ACTIVITY_LOGS TABLE
-- =====================================================

-- Drop existing policies
DROP POLICY IF EXISTS "Admins can manage admin activity logs" ON public.admin_activity_logs;
DROP POLICY IF EXISTS "Public can insert admin activity logs" ON public.admin_activity_logs;

-- Super admins can do everything
CREATE POLICY "Super admins can manage all admin activity logs"
ON public.admin_activity_logs FOR ALL
USING (public.is_super_admin(auth.uid()));

-- Tenant members can view logs in their branches
CREATE POLICY "Tenant members can view admin activity logs in their branches"
ON public.admin_activity_logs FOR SELECT
USING (
    branch_id IS NOT NULL AND 
    public.user_has_branch_access(auth.uid(), branch_id)
);

-- Public can insert admin activity logs
CREATE POLICY "Public can insert admin activity logs"
ON public.admin_activity_logs FOR INSERT
WITH CHECK (true);

-- =====================================================
-- 16. UPDATE RLS POLICIES FOR WHATSAPP_NOTIFICATIONS TABLE
-- =====================================================

-- Drop existing policies
DROP POLICY IF EXISTS "Admins can manage whatsapp notifications" ON public.whatsapp_notifications;
DROP POLICY IF EXISTS "Public can insert notifications" ON public.whatsapp_notifications;
DROP POLICY IF EXISTS "Public can view notifications" ON public.whatsapp_notifications;

-- Super admins can do everything
CREATE POLICY "Super admins can manage all whatsapp notifications"
ON public.whatsapp_notifications FOR ALL
USING (public.is_super_admin(auth.uid()));

-- Tenant members can manage notifications in their branches
CREATE POLICY "Tenant members can manage whatsapp notifications in their branches"
ON public.whatsapp_notifications FOR ALL
USING (
    branch_id IS NOT NULL AND 
    public.user_has_branch_access(auth.uid(), branch_id)
)
WITH CHECK (
    branch_id IS NOT NULL AND 
    public.user_has_branch_access(auth.uid(), branch_id)
);

-- Public can view and insert notifications
CREATE POLICY "Public can view whatsapp notifications"
ON public.whatsapp_notifications FOR SELECT
USING (true);

CREATE POLICY "Public can insert whatsapp notifications"
ON public.whatsapp_notifications FOR INSERT
WITH CHECK (true);

-- =====================================================
-- 17. UPDATE RLS POLICIES FOR STAFF TABLE
-- =====================================================

-- Drop existing policies
DROP POLICY IF EXISTS "Admins can manage staff" ON public.staff;
DROP POLICY IF EXISTS "Staff can view own profile" ON public.staff;

-- Super admins can do everything
CREATE POLICY "Super admins can manage all staff"
ON public.staff FOR ALL
USING (public.is_super_admin(auth.uid()));

-- Tenant members can manage staff in their branches
CREATE POLICY "Tenant members can manage staff in their branches"
ON public.staff FOR ALL
USING (
    EXISTS (
        SELECT 1 FROM public.staff_branch_assignments sba
        JOIN public.branches b ON sba.branch_id = b.id
        WHERE sba.staff_id = staff.id
        AND b.tenant_id IS NOT NULL
        AND public.user_belongs_to_tenant(auth.uid(), b.tenant_id)
    )
    OR
    -- Legacy: staff without branch assignments (no tenant)
    (
        NOT EXISTS (SELECT 1 FROM public.staff_branch_assignments WHERE staff_id = staff.id)
        AND EXISTS (
            SELECT 1 FROM public.user_roles
            WHERE user_id = auth.uid() AND role = 'admin'
        )
    )
)
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.staff_branch_assignments sba
        JOIN public.branches b ON sba.branch_id = b.id
        WHERE sba.staff_id = staff.id
        AND b.tenant_id IS NOT NULL
        AND public.user_belongs_to_tenant(auth.uid(), b.tenant_id)
    )
    OR
    -- Legacy: staff without branch assignments (no tenant)
    (
        NOT EXISTS (SELECT 1 FROM public.staff_branch_assignments WHERE staff_id = staff.id)
        AND EXISTS (
            SELECT 1 FROM public.user_roles
            WHERE user_id = auth.uid() AND role = 'admin'
        )
    )
);

-- Staff can view own profile
CREATE POLICY "Staff can view own profile"
ON public.staff FOR SELECT
USING (auth_user_id = auth.uid());

-- =====================================================
-- 18. UPDATE RLS POLICIES FOR STAFF_BRANCH_ASSIGNMENTS TABLE
-- =====================================================

-- Drop existing policies
DROP POLICY IF EXISTS "Admins can manage staff branch assignments" ON public.staff_branch_assignments;
DROP POLICY IF EXISTS "Public can view staff branch assignments" ON public.staff_branch_assignments;

-- Super admins can do everything
CREATE POLICY "Super admins can manage all staff branch assignments"
ON public.staff_branch_assignments FOR ALL
USING (public.is_super_admin(auth.uid()));

-- Tenant members can manage assignments for their branches
CREATE POLICY "Tenant members can manage staff branch assignments for their branches"
ON public.staff_branch_assignments FOR ALL
USING (
    public.user_has_branch_access(auth.uid(), branch_id)
)
WITH CHECK (
    public.user_has_branch_access(auth.uid(), branch_id)
);

-- Public can view staff branch assignments
CREATE POLICY "Public can view staff branch assignments"
ON public.staff_branch_assignments FOR SELECT
USING (true);

-- =====================================================
-- 19. CREATE INDEXES FOR PERFORMANCE
-- =====================================================

-- Indexes for branch_id columns (if not already exist)
CREATE INDEX IF NOT EXISTS idx_members_branch_id ON public.members(branch_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_branch_id ON public.subscriptions(branch_id);
CREATE INDEX IF NOT EXISTS idx_payments_branch_id ON public.payments(branch_id);
CREATE INDEX IF NOT EXISTS idx_daily_pass_users_branch_id ON public.daily_pass_users(branch_id);
CREATE INDEX IF NOT EXISTS idx_daily_pass_subscriptions_branch_id ON public.daily_pass_subscriptions(branch_id);
CREATE INDEX IF NOT EXISTS idx_pt_subscriptions_branch_id ON public.pt_subscriptions(branch_id);
CREATE INDEX IF NOT EXISTS idx_personal_trainers_branch_id ON public.personal_trainers(branch_id);
CREATE INDEX IF NOT EXISTS idx_monthly_packages_branch_id ON public.monthly_packages(branch_id);
CREATE INDEX IF NOT EXISTS idx_custom_packages_branch_id ON public.custom_packages(branch_id);
CREATE INDEX IF NOT EXISTS idx_ledger_entries_branch_id ON public.ledger_entries(branch_id);
CREATE INDEX IF NOT EXISTS idx_gym_settings_branch_id ON public.gym_settings(branch_id);
CREATE INDEX IF NOT EXISTS idx_user_activity_logs_branch_id ON public.user_activity_logs(branch_id);
CREATE INDEX IF NOT EXISTS idx_admin_activity_logs_branch_id ON public.admin_activity_logs(branch_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_notifications_branch_id ON public.whatsapp_notifications(branch_id);

-- =====================================================
-- MIGRATION COMPLETE
-- =====================================================
-- All tables with branch_id now have proper RLS policies
-- that enforce tenant and branch isolation:
-- 
-- 1. Super admins can access everything
-- 2. Tenant members can only access data in their tenant's branches
-- 3. Staff can only access data in their assigned branches (with permissions)
-- 4. Public can insert/view limited data (for registration flows)
-- =====================================================
