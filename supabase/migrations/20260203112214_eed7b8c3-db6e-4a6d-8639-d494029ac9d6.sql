-- =============================================================================
-- TENANT ISOLATION MIGRATION
-- =============================================================================
-- This migration enforces strict tenant isolation at the RLS level.
-- 
-- PRINCIPLES:
-- 1. super_admin can see ALL data
-- 2. tenant_admin/admin can only see data for their tenant (via tenant_members)
-- 3. Branches with tenant_id = NULL are ONLY visible to super_admin
-- 4. Public registration flow uses public-data edge function (no direct SELECT)
-- =============================================================================

-- Drop existing branch policies and recreate with strict tenant isolation
DROP POLICY IF EXISTS "Legacy admins can manage unassigned branches" ON branches;
DROP POLICY IF EXISTS "Public can view active branches for registration" ON branches;
DROP POLICY IF EXISTS "Staff can view assigned branches" ON branches;
DROP POLICY IF EXISTS "Super admins can manage all branches" ON branches;
DROP POLICY IF EXISTS "Tenant members can manage own branches" ON branches;

-- Super admins can do everything
CREATE POLICY "super_admin_full_access_branches"
  ON branches FOR ALL
  USING (is_super_admin(auth.uid()))
  WITH CHECK (is_super_admin(auth.uid()));

-- Tenant members can view and manage their own tenant's branches
CREATE POLICY "tenant_members_manage_own_branches"
  ON branches FOR ALL
  USING (
    tenant_id IS NOT NULL 
    AND user_belongs_to_tenant(auth.uid(), tenant_id)
  )
  WITH CHECK (
    tenant_id IS NOT NULL 
    AND user_belongs_to_tenant(auth.uid(), tenant_id)
  );

-- Staff can view branches they are assigned to (READ ONLY for staff via RLS)
CREATE POLICY "staff_view_assigned_branches"
  ON branches FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM staff s
      JOIN staff_branch_assignments sba ON s.id = sba.staff_id
      WHERE s.auth_user_id = auth.uid()
        AND s.is_active = true
        AND sba.branch_id = branches.id
    )
  );

-- =============================================================================
-- MEMBERS TABLE - Tenant isolation
-- =============================================================================
DROP POLICY IF EXISTS "Admins can delete members" ON members;
DROP POLICY IF EXISTS "Admins can insert members" ON members;
DROP POLICY IF EXISTS "Admins can update members" ON members;
DROP POLICY IF EXISTS "Admins can view all members" ON members;
DROP POLICY IF EXISTS "Staff can insert members with permission" ON members;
DROP POLICY IF EXISTS "Staff can update members with permission" ON members;
DROP POLICY IF EXISTS "Staff can view members with permission" ON members;

-- Super admins full access
CREATE POLICY "super_admin_full_access_members"
  ON members FOR ALL
  USING (is_super_admin(auth.uid()))
  WITH CHECK (is_super_admin(auth.uid()));

-- Tenant members can manage members in their tenant's branches
CREATE POLICY "tenant_members_manage_members"
  ON members FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM branches b
      WHERE b.id = members.branch_id
        AND b.tenant_id IS NOT NULL
        AND user_belongs_to_tenant(auth.uid(), b.tenant_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM branches b
      WHERE b.id = members.branch_id
        AND b.tenant_id IS NOT NULL
        AND user_belongs_to_tenant(auth.uid(), b.tenant_id)
    )
  );

-- Staff can view members with permission (scoped to their assigned branches)
CREATE POLICY "staff_view_members_with_permission"
  ON members FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM staff s
      JOIN staff_permissions sp ON s.id = sp.staff_id
      JOIN staff_branch_assignments sba ON s.id = sba.staff_id
      WHERE s.auth_user_id = auth.uid()
        AND s.is_active = true
        AND (sp.can_view_members = true OR sp.can_manage_members = true)
        AND sba.branch_id = members.branch_id
    )
  );

-- Staff can insert/update members with permission
CREATE POLICY "staff_manage_members_with_permission"
  ON members FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM staff s
      JOIN staff_permissions sp ON s.id = sp.staff_id
      JOIN staff_branch_assignments sba ON s.id = sba.staff_id
      WHERE s.auth_user_id = auth.uid()
        AND s.is_active = true
        AND sp.can_manage_members = true
        AND sba.branch_id = members.branch_id
    )
  );

CREATE POLICY "staff_update_members_with_permission"
  ON members FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM staff s
      JOIN staff_permissions sp ON s.id = sp.staff_id
      JOIN staff_branch_assignments sba ON s.id = sba.staff_id
      WHERE s.auth_user_id = auth.uid()
        AND s.is_active = true
        AND sp.can_manage_members = true
        AND sba.branch_id = members.branch_id
    )
  );

-- =============================================================================
-- PAYMENTS TABLE - Tenant isolation
-- =============================================================================
DROP POLICY IF EXISTS "Admins can manage payments" ON payments;
DROP POLICY IF EXISTS "Admins can view all payments" ON payments;
DROP POLICY IF EXISTS "Public can view own payments" ON payments;
DROP POLICY IF EXISTS "Staff can insert payments with permission" ON payments;
DROP POLICY IF EXISTS "Staff can view payments with permission" ON payments;

-- Super admins full access
CREATE POLICY "super_admin_full_access_payments"
  ON payments FOR ALL
  USING (is_super_admin(auth.uid()))
  WITH CHECK (is_super_admin(auth.uid()));

-- Tenant members can manage payments in their tenant's branches
CREATE POLICY "tenant_members_manage_payments"
  ON payments FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM branches b
      WHERE b.id = payments.branch_id
        AND b.tenant_id IS NOT NULL
        AND user_belongs_to_tenant(auth.uid(), b.tenant_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM branches b
      WHERE b.id = payments.branch_id
        AND b.tenant_id IS NOT NULL
        AND user_belongs_to_tenant(auth.uid(), b.tenant_id)
    )
  );

-- Staff can view/insert payments with permission
CREATE POLICY "staff_view_payments_with_permission"
  ON payments FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM staff s
      JOIN staff_permissions sp ON s.id = sp.staff_id
      JOIN staff_branch_assignments sba ON s.id = sba.staff_id
      WHERE s.auth_user_id = auth.uid()
        AND s.is_active = true
        AND sp.can_access_payments = true
        AND sba.branch_id = payments.branch_id
    )
  );

CREATE POLICY "staff_insert_payments_with_permission"
  ON payments FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM staff s
      JOIN staff_permissions sp ON s.id = sp.staff_id
      JOIN staff_branch_assignments sba ON s.id = sba.staff_id
      WHERE s.auth_user_id = auth.uid()
        AND s.is_active = true
        AND sp.can_access_payments = true
        AND sba.branch_id = payments.branch_id
    )
  );

-- =============================================================================
-- SUBSCRIPTIONS TABLE - Tenant isolation
-- =============================================================================
DROP POLICY IF EXISTS "Admins can manage subscriptions" ON subscriptions;
DROP POLICY IF EXISTS "Admins can view all subscriptions" ON subscriptions;
DROP POLICY IF EXISTS "Public can view subscriptions" ON subscriptions;
DROP POLICY IF EXISTS "Staff can insert subscriptions with permission" ON subscriptions;
DROP POLICY IF EXISTS "Staff can update subscriptions with permission" ON subscriptions;
DROP POLICY IF EXISTS "Staff can view subscriptions with permission" ON subscriptions;

-- Super admins full access
CREATE POLICY "super_admin_full_access_subscriptions"
  ON subscriptions FOR ALL
  USING (is_super_admin(auth.uid()))
  WITH CHECK (is_super_admin(auth.uid()));

-- Tenant members can manage subscriptions in their tenant's branches
CREATE POLICY "tenant_members_manage_subscriptions"
  ON subscriptions FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM branches b
      WHERE b.id = subscriptions.branch_id
        AND b.tenant_id IS NOT NULL
        AND user_belongs_to_tenant(auth.uid(), b.tenant_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM branches b
      WHERE b.id = subscriptions.branch_id
        AND b.tenant_id IS NOT NULL
        AND user_belongs_to_tenant(auth.uid(), b.tenant_id)
    )
  );

-- Staff can view/manage subscriptions with permission
CREATE POLICY "staff_view_subscriptions_with_permission"
  ON subscriptions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM staff s
      JOIN staff_permissions sp ON s.id = sp.staff_id
      JOIN staff_branch_assignments sba ON s.id = sba.staff_id
      WHERE s.auth_user_id = auth.uid()
        AND s.is_active = true
        AND (sp.can_view_members = true OR sp.can_manage_members = true)
        AND sba.branch_id = subscriptions.branch_id
    )
  );

CREATE POLICY "staff_insert_subscriptions_with_permission"
  ON subscriptions FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM staff s
      JOIN staff_permissions sp ON s.id = sp.staff_id
      JOIN staff_branch_assignments sba ON s.id = sba.staff_id
      WHERE s.auth_user_id = auth.uid()
        AND s.is_active = true
        AND sp.can_manage_members = true
        AND sba.branch_id = subscriptions.branch_id
    )
  );

CREATE POLICY "staff_update_subscriptions_with_permission"
  ON subscriptions FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM staff s
      JOIN staff_permissions sp ON s.id = sp.staff_id
      JOIN staff_branch_assignments sba ON s.id = sba.staff_id
      WHERE s.auth_user_id = auth.uid()
        AND s.is_active = true
        AND sp.can_manage_members = true
        AND sba.branch_id = subscriptions.branch_id
    )
  );

-- =============================================================================
-- LEDGER ENTRIES - Tenant isolation
-- =============================================================================
DROP POLICY IF EXISTS "Admins can manage ledger entries" ON ledger_entries;
DROP POLICY IF EXISTS "Public can view ledger entries" ON ledger_entries;
DROP POLICY IF EXISTS "Staff can delete ledger entries with permission" ON ledger_entries;
DROP POLICY IF EXISTS "Staff can insert ledger entries with permission" ON ledger_entries;
DROP POLICY IF EXISTS "Staff can update ledger entries with permission" ON ledger_entries;
DROP POLICY IF EXISTS "Staff can view ledger with permission" ON ledger_entries;

-- Super admins full access
CREATE POLICY "super_admin_full_access_ledger"
  ON ledger_entries FOR ALL
  USING (is_super_admin(auth.uid()))
  WITH CHECK (is_super_admin(auth.uid()));

-- Tenant members can manage ledger in their tenant's branches
CREATE POLICY "tenant_members_manage_ledger"
  ON ledger_entries FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM branches b
      WHERE b.id = ledger_entries.branch_id
        AND b.tenant_id IS NOT NULL
        AND user_belongs_to_tenant(auth.uid(), b.tenant_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM branches b
      WHERE b.id = ledger_entries.branch_id
        AND b.tenant_id IS NOT NULL
        AND user_belongs_to_tenant(auth.uid(), b.tenant_id)
    )
  );

-- Staff with ledger permission
CREATE POLICY "staff_manage_ledger_with_permission"
  ON ledger_entries FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM staff s
      JOIN staff_permissions sp ON s.id = sp.staff_id
      JOIN staff_branch_assignments sba ON s.id = sba.staff_id
      WHERE s.auth_user_id = auth.uid()
        AND s.is_active = true
        AND sp.can_access_ledger = true
        AND sba.branch_id = ledger_entries.branch_id
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM staff s
      JOIN staff_permissions sp ON s.id = sp.staff_id
      JOIN staff_branch_assignments sba ON s.id = sba.staff_id
      WHERE s.auth_user_id = auth.uid()
        AND s.is_active = true
        AND sp.can_access_ledger = true
        AND sba.branch_id = ledger_entries.branch_id
    )
  );

-- =============================================================================
-- PERSONAL TRAINERS - Tenant isolation
-- =============================================================================
DROP POLICY IF EXISTS "Admins can manage trainers" ON personal_trainers;
DROP POLICY IF EXISTS "Anyone can view active trainers" ON personal_trainers;

-- Super admins full access
CREATE POLICY "super_admin_full_access_trainers"
  ON personal_trainers FOR ALL
  USING (is_super_admin(auth.uid()))
  WITH CHECK (is_super_admin(auth.uid()));

-- Tenant members can manage trainers in their tenant's branches
CREATE POLICY "tenant_members_manage_trainers"
  ON personal_trainers FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM branches b
      WHERE b.id = personal_trainers.branch_id
        AND b.tenant_id IS NOT NULL
        AND user_belongs_to_tenant(auth.uid(), b.tenant_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM branches b
      WHERE b.id = personal_trainers.branch_id
        AND b.tenant_id IS NOT NULL
        AND user_belongs_to_tenant(auth.uid(), b.tenant_id)
    )
  );

-- =============================================================================
-- GYM SETTINGS - Tenant isolation
-- =============================================================================
DROP POLICY IF EXISTS "Admins can insert gym settings" ON gym_settings;
DROP POLICY IF EXISTS "Admins can update gym settings" ON gym_settings;
DROP POLICY IF EXISTS "Anyone can view gym settings" ON gym_settings;
DROP POLICY IF EXISTS "Staff can update gym settings with permission" ON gym_settings;

-- Super admins full access
CREATE POLICY "super_admin_full_access_gym_settings"
  ON gym_settings FOR ALL
  USING (is_super_admin(auth.uid()))
  WITH CHECK (is_super_admin(auth.uid()));

-- Tenant members can manage settings in their tenant's branches
CREATE POLICY "tenant_members_manage_gym_settings"
  ON gym_settings FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM branches b
      WHERE b.id = gym_settings.branch_id
        AND b.tenant_id IS NOT NULL
        AND user_belongs_to_tenant(auth.uid(), b.tenant_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM branches b
      WHERE b.id = gym_settings.branch_id
        AND b.tenant_id IS NOT NULL
        AND user_belongs_to_tenant(auth.uid(), b.tenant_id)
    )
  );

-- Staff with settings permission
CREATE POLICY "staff_manage_gym_settings_with_permission"
  ON gym_settings FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM staff s
      JOIN staff_branch_assignments sba ON s.id = sba.staff_id
      WHERE s.auth_user_id = auth.uid()
        AND s.is_active = true
        AND sba.branch_id = gym_settings.branch_id
    )
  );

CREATE POLICY "staff_update_gym_settings_with_permission"
  ON gym_settings FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM staff s
      JOIN staff_permissions sp ON s.id = sp.staff_id
      JOIN staff_branch_assignments sba ON s.id = sba.staff_id
      WHERE s.auth_user_id = auth.uid()
        AND s.is_active = true
        AND sp.can_change_settings = true
        AND sba.branch_id = gym_settings.branch_id
    )
  );

-- =============================================================================
-- MONTHLY PACKAGES - Tenant isolation
-- =============================================================================
DROP POLICY IF EXISTS "Admins can manage monthly packages" ON monthly_packages;
DROP POLICY IF EXISTS "Anyone can view active monthly packages" ON monthly_packages;
DROP POLICY IF EXISTS "Staff can manage monthly packages with permission" ON monthly_packages;

-- Super admins full access
CREATE POLICY "super_admin_full_access_monthly_packages"
  ON monthly_packages FOR ALL
  USING (is_super_admin(auth.uid()))
  WITH CHECK (is_super_admin(auth.uid()));

-- Tenant members can manage packages in their tenant's branches
CREATE POLICY "tenant_members_manage_monthly_packages"
  ON monthly_packages FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM branches b
      WHERE b.id = monthly_packages.branch_id
        AND b.tenant_id IS NOT NULL
        AND user_belongs_to_tenant(auth.uid(), b.tenant_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM branches b
      WHERE b.id = monthly_packages.branch_id
        AND b.tenant_id IS NOT NULL
        AND user_belongs_to_tenant(auth.uid(), b.tenant_id)
    )
  );

-- Staff with settings permission
CREATE POLICY "staff_manage_monthly_packages_with_permission"
  ON monthly_packages FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM staff s
      JOIN staff_permissions sp ON s.id = sp.staff_id
      JOIN staff_branch_assignments sba ON s.id = sba.staff_id
      WHERE s.auth_user_id = auth.uid()
        AND s.is_active = true
        AND sp.can_change_settings = true
        AND sba.branch_id = monthly_packages.branch_id
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM staff s
      JOIN staff_permissions sp ON s.id = sp.staff_id
      JOIN staff_branch_assignments sba ON s.id = sba.staff_id
      WHERE s.auth_user_id = auth.uid()
        AND s.is_active = true
        AND sp.can_change_settings = true
        AND sba.branch_id = monthly_packages.branch_id
    )
  );

-- =============================================================================
-- CUSTOM PACKAGES - Tenant isolation
-- =============================================================================
DROP POLICY IF EXISTS "Admins can manage packages" ON custom_packages;
DROP POLICY IF EXISTS "Anyone can view active packages" ON custom_packages;
DROP POLICY IF EXISTS "Staff can manage custom packages with permission" ON custom_packages;

-- Super admins full access
CREATE POLICY "super_admin_full_access_custom_packages"
  ON custom_packages FOR ALL
  USING (is_super_admin(auth.uid()))
  WITH CHECK (is_super_admin(auth.uid()));

-- Tenant members can manage packages in their tenant's branches
CREATE POLICY "tenant_members_manage_custom_packages"
  ON custom_packages FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM branches b
      WHERE b.id = custom_packages.branch_id
        AND b.tenant_id IS NOT NULL
        AND user_belongs_to_tenant(auth.uid(), b.tenant_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM branches b
      WHERE b.id = custom_packages.branch_id
        AND b.tenant_id IS NOT NULL
        AND user_belongs_to_tenant(auth.uid(), b.tenant_id)
    )
  );

-- Staff with settings permission
CREATE POLICY "staff_manage_custom_packages_with_permission"
  ON custom_packages FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM staff s
      JOIN staff_permissions sp ON s.id = sp.staff_id
      JOIN staff_branch_assignments sba ON s.id = sba.staff_id
      WHERE s.auth_user_id = auth.uid()
        AND s.is_active = true
        AND sp.can_change_settings = true
        AND sba.branch_id = custom_packages.branch_id
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM staff s
      JOIN staff_permissions sp ON s.id = sp.staff_id
      JOIN staff_branch_assignments sba ON s.id = sba.staff_id
      WHERE s.auth_user_id = auth.uid()
        AND s.is_active = true
        AND sp.can_change_settings = true
        AND sba.branch_id = custom_packages.branch_id
    )
  );

-- =============================================================================
-- PT SUBSCRIPTIONS - Tenant isolation
-- =============================================================================
DROP POLICY IF EXISTS "Admins can manage PT subscriptions" ON pt_subscriptions;
DROP POLICY IF EXISTS "Public can view PT subscriptions" ON pt_subscriptions;
DROP POLICY IF EXISTS "Staff can insert PT subscriptions with permission" ON pt_subscriptions;
DROP POLICY IF EXISTS "Staff can update PT subscriptions with permission" ON pt_subscriptions;

-- Super admins full access
CREATE POLICY "super_admin_full_access_pt_subscriptions"
  ON pt_subscriptions FOR ALL
  USING (is_super_admin(auth.uid()))
  WITH CHECK (is_super_admin(auth.uid()));

-- Tenant members can manage PT subscriptions in their tenant's branches
CREATE POLICY "tenant_members_manage_pt_subscriptions"
  ON pt_subscriptions FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM branches b
      WHERE b.id = pt_subscriptions.branch_id
        AND b.tenant_id IS NOT NULL
        AND user_belongs_to_tenant(auth.uid(), b.tenant_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM branches b
      WHERE b.id = pt_subscriptions.branch_id
        AND b.tenant_id IS NOT NULL
        AND user_belongs_to_tenant(auth.uid(), b.tenant_id)
    )
  );

-- Staff with member management permission
CREATE POLICY "staff_manage_pt_subscriptions_with_permission"
  ON pt_subscriptions FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM staff s
      JOIN staff_permissions sp ON s.id = sp.staff_id
      JOIN staff_branch_assignments sba ON s.id = sba.staff_id
      WHERE s.auth_user_id = auth.uid()
        AND s.is_active = true
        AND sp.can_manage_members = true
        AND sba.branch_id = pt_subscriptions.branch_id
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM staff s
      JOIN staff_permissions sp ON s.id = sp.staff_id
      JOIN staff_branch_assignments sba ON s.id = sba.staff_id
      WHERE s.auth_user_id = auth.uid()
        AND s.is_active = true
        AND sp.can_manage_members = true
        AND sba.branch_id = pt_subscriptions.branch_id
    )
  );

-- =============================================================================
-- DAILY PASS USERS - Tenant isolation
-- =============================================================================
DROP POLICY IF EXISTS "Admins can manage daily pass users" ON daily_pass_users;
DROP POLICY IF EXISTS "Public can insert daily pass users" ON daily_pass_users;
DROP POLICY IF EXISTS "Public can view daily pass users" ON daily_pass_users;

-- Super admins full access
CREATE POLICY "super_admin_full_access_daily_pass_users"
  ON daily_pass_users FOR ALL
  USING (is_super_admin(auth.uid()))
  WITH CHECK (is_super_admin(auth.uid()));

-- Tenant members can manage daily pass users in their tenant's branches
CREATE POLICY "tenant_members_manage_daily_pass_users"
  ON daily_pass_users FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM branches b
      WHERE b.id = daily_pass_users.branch_id
        AND b.tenant_id IS NOT NULL
        AND user_belongs_to_tenant(auth.uid(), b.tenant_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM branches b
      WHERE b.id = daily_pass_users.branch_id
        AND b.tenant_id IS NOT NULL
        AND user_belongs_to_tenant(auth.uid(), b.tenant_id)
    )
  );

-- =============================================================================
-- DAILY PASS SUBSCRIPTIONS - Tenant isolation
-- =============================================================================
DROP POLICY IF EXISTS "Admins can manage daily pass subscriptions" ON daily_pass_subscriptions;
DROP POLICY IF EXISTS "Public can view daily pass subscriptions" ON daily_pass_subscriptions;

-- Super admins full access
CREATE POLICY "super_admin_full_access_daily_pass_subscriptions"
  ON daily_pass_subscriptions FOR ALL
  USING (is_super_admin(auth.uid()))
  WITH CHECK (is_super_admin(auth.uid()));

-- Tenant members can manage daily pass subscriptions in their tenant's branches
CREATE POLICY "tenant_members_manage_daily_pass_subscriptions"
  ON daily_pass_subscriptions FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM branches b
      WHERE b.id = daily_pass_subscriptions.branch_id
        AND b.tenant_id IS NOT NULL
        AND user_belongs_to_tenant(auth.uid(), b.tenant_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM branches b
      WHERE b.id = daily_pass_subscriptions.branch_id
        AND b.tenant_id IS NOT NULL
        AND user_belongs_to_tenant(auth.uid(), b.tenant_id)
    )
  );

-- =============================================================================
-- WHATSAPP NOTIFICATIONS - Tenant isolation
-- =============================================================================
DROP POLICY IF EXISTS "Admins can manage whatsapp notifications" ON whatsapp_notifications;
DROP POLICY IF EXISTS "Public can view notifications" ON whatsapp_notifications;

-- Super admins full access
CREATE POLICY "super_admin_full_access_whatsapp_notifications"
  ON whatsapp_notifications FOR ALL
  USING (is_super_admin(auth.uid()))
  WITH CHECK (is_super_admin(auth.uid()));

-- Tenant members can manage whatsapp notifications in their tenant's branches
CREATE POLICY "tenant_members_manage_whatsapp_notifications"
  ON whatsapp_notifications FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM branches b
      WHERE b.id = whatsapp_notifications.branch_id
        AND b.tenant_id IS NOT NULL
        AND user_belongs_to_tenant(auth.uid(), b.tenant_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM branches b
      WHERE b.id = whatsapp_notifications.branch_id
        AND b.tenant_id IS NOT NULL
        AND user_belongs_to_tenant(auth.uid(), b.tenant_id)
    )
  );

-- =============================================================================
-- ACTIVITY LOGS - Tenant isolation
-- =============================================================================
DROP POLICY IF EXISTS "Admins can manage admin activity logs" ON admin_activity_logs;
DROP POLICY IF EXISTS "Public can insert admin activity logs" ON admin_activity_logs;
DROP POLICY IF EXISTS "Staff can insert activity logs" ON admin_activity_logs;
DROP POLICY IF EXISTS "Staff can view activity logs" ON admin_activity_logs;

-- Super admins full access
CREATE POLICY "super_admin_full_access_admin_activity_logs"
  ON admin_activity_logs FOR ALL
  USING (is_super_admin(auth.uid()))
  WITH CHECK (is_super_admin(auth.uid()));

-- Tenant members can manage activity logs in their tenant's branches
CREATE POLICY "tenant_members_manage_admin_activity_logs"
  ON admin_activity_logs FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM branches b
      WHERE b.id = admin_activity_logs.branch_id
        AND b.tenant_id IS NOT NULL
        AND user_belongs_to_tenant(auth.uid(), b.tenant_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM branches b
      WHERE b.id = admin_activity_logs.branch_id
        AND b.tenant_id IS NOT NULL
        AND user_belongs_to_tenant(auth.uid(), b.tenant_id)
    )
  );

-- Staff can insert and view activity logs for their branches
CREATE POLICY "staff_manage_admin_activity_logs"
  ON admin_activity_logs FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM staff s
      JOIN staff_branch_assignments sba ON s.id = sba.staff_id
      WHERE s.auth_user_id = auth.uid()
        AND s.is_active = true
        AND sba.branch_id = admin_activity_logs.branch_id
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM staff s
      JOIN staff_branch_assignments sba ON s.id = sba.staff_id
      WHERE s.auth_user_id = auth.uid()
        AND s.is_active = true
        AND sba.branch_id = admin_activity_logs.branch_id
    )
  );

-- =============================================================================
-- USER ACTIVITY LOGS - Tenant isolation
-- =============================================================================
DROP POLICY IF EXISTS "Admins can manage user activity logs" ON user_activity_logs;
DROP POLICY IF EXISTS "Public can insert user activity logs" ON user_activity_logs;
DROP POLICY IF EXISTS "Public can view user activity logs" ON user_activity_logs;

-- Super admins full access
CREATE POLICY "super_admin_full_access_user_activity_logs"
  ON user_activity_logs FOR ALL
  USING (is_super_admin(auth.uid()))
  WITH CHECK (is_super_admin(auth.uid()));

-- Tenant members can manage user activity logs in their tenant's branches
CREATE POLICY "tenant_members_manage_user_activity_logs"
  ON user_activity_logs FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM branches b
      WHERE b.id = user_activity_logs.branch_id
        AND b.tenant_id IS NOT NULL
        AND user_belongs_to_tenant(auth.uid(), b.tenant_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM branches b
      WHERE b.id = user_activity_logs.branch_id
        AND b.tenant_id IS NOT NULL
        AND user_belongs_to_tenant(auth.uid(), b.tenant_id)
    )
  );

-- =============================================================================
-- MEMBER DETAILS - Tenant isolation
-- =============================================================================
DROP POLICY IF EXISTS "Admins can manage member details" ON member_details;
DROP POLICY IF EXISTS "Public can insert member details" ON member_details;
DROP POLICY IF EXISTS "Staff can insert member details with permission" ON member_details;
DROP POLICY IF EXISTS "Staff can update member details with permission" ON member_details;

-- Super admins full access
CREATE POLICY "super_admin_full_access_member_details"
  ON member_details FOR ALL
  USING (is_super_admin(auth.uid()))
  WITH CHECK (is_super_admin(auth.uid()));

-- Tenant members can manage member details in their tenant's branches
CREATE POLICY "tenant_members_manage_member_details"
  ON member_details FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM members m
      JOIN branches b ON b.id = m.branch_id
      WHERE m.id = member_details.member_id
        AND b.tenant_id IS NOT NULL
        AND user_belongs_to_tenant(auth.uid(), b.tenant_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM members m
      JOIN branches b ON b.id = m.branch_id
      WHERE m.id = member_details.member_id
        AND b.tenant_id IS NOT NULL
        AND user_belongs_to_tenant(auth.uid(), b.tenant_id)
    )
  );

-- Staff with member management permission
CREATE POLICY "staff_manage_member_details_with_permission"
  ON member_details FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM staff s
      JOIN staff_permissions sp ON s.id = sp.staff_id
      JOIN staff_branch_assignments sba ON s.id = sba.staff_id
      JOIN members m ON m.branch_id = sba.branch_id
      WHERE s.auth_user_id = auth.uid()
        AND s.is_active = true
        AND sp.can_manage_members = true
        AND m.id = member_details.member_id
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM staff s
      JOIN staff_permissions sp ON s.id = sp.staff_id
      JOIN staff_branch_assignments sba ON s.id = sba.staff_id
      JOIN members m ON m.branch_id = sba.branch_id
      WHERE s.auth_user_id = auth.uid()
        AND s.is_active = true
        AND sp.can_manage_members = true
        AND m.id = member_details.member_id
    )
  );