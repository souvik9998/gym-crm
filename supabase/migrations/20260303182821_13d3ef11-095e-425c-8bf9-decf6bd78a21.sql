
-- Performance indexes for frequently filtered/joined columns

-- Members
CREATE INDEX IF NOT EXISTS idx_members_branch_id ON public.members(branch_id);
CREATE INDEX IF NOT EXISTS idx_members_phone ON public.members(phone);
CREATE INDEX IF NOT EXISTS idx_members_created_at ON public.members(created_at);

-- Subscriptions
CREATE INDEX IF NOT EXISTS idx_subscriptions_member_id ON public.subscriptions(member_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_branch_id ON public.subscriptions(branch_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON public.subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_subscriptions_end_date ON public.subscriptions(end_date);
CREATE INDEX IF NOT EXISTS idx_subscriptions_branch_status ON public.subscriptions(branch_id, status);

-- Payments
CREATE INDEX IF NOT EXISTS idx_payments_branch_id ON public.payments(branch_id);
CREATE INDEX IF NOT EXISTS idx_payments_status ON public.payments(status);
CREATE INDEX IF NOT EXISTS idx_payments_created_at ON public.payments(created_at);
CREATE INDEX IF NOT EXISTS idx_payments_branch_status_created ON public.payments(branch_id, status, created_at);
CREATE INDEX IF NOT EXISTS idx_payments_member_id ON public.payments(member_id);

-- Ledger entries
CREATE INDEX IF NOT EXISTS idx_ledger_branch_id ON public.ledger_entries(branch_id);
CREATE INDEX IF NOT EXISTS idx_ledger_entry_type ON public.ledger_entries(entry_type);
CREATE INDEX IF NOT EXISTS idx_ledger_category ON public.ledger_entries(category);
CREATE INDEX IF NOT EXISTS idx_ledger_entry_date ON public.ledger_entries(entry_date);
CREATE INDEX IF NOT EXISTS idx_ledger_branch_type_cat ON public.ledger_entries(branch_id, entry_type, category);

-- PT Subscriptions
CREATE INDEX IF NOT EXISTS idx_pt_subs_member_id ON public.pt_subscriptions(member_id);
CREATE INDEX IF NOT EXISTS idx_pt_subs_branch_id ON public.pt_subscriptions(branch_id);
CREATE INDEX IF NOT EXISTS idx_pt_subs_trainer_id ON public.pt_subscriptions(personal_trainer_id);
CREATE INDEX IF NOT EXISTS idx_pt_subs_status ON public.pt_subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_pt_subs_end_date ON public.pt_subscriptions(end_date);

-- Activity Logs
CREATE INDEX IF NOT EXISTS idx_admin_logs_branch_id ON public.admin_activity_logs(branch_id);
CREATE INDEX IF NOT EXISTS idx_admin_logs_created_at ON public.admin_activity_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_admin_logs_admin_user_id ON public.admin_activity_logs(admin_user_id);
CREATE INDEX IF NOT EXISTS idx_user_logs_branch_id ON public.user_activity_logs(branch_id);
CREATE INDEX IF NOT EXISTS idx_user_logs_created_at ON public.user_activity_logs(created_at);

-- Attendance
CREATE INDEX IF NOT EXISTS idx_attendance_branch_id ON public.attendance_logs(branch_id);
CREATE INDEX IF NOT EXISTS idx_attendance_date ON public.attendance_logs(date);
CREATE INDEX IF NOT EXISTS idx_attendance_member_id ON public.attendance_logs(member_id);

-- Staff
CREATE INDEX IF NOT EXISTS idx_staff_auth_user_id ON public.staff(auth_user_id);
CREATE INDEX IF NOT EXISTS idx_staff_branch_assignments_branch ON public.staff_branch_assignments(branch_id);
CREATE INDEX IF NOT EXISTS idx_staff_branch_assignments_staff ON public.staff_branch_assignments(staff_id);
CREATE INDEX IF NOT EXISTS idx_staff_permissions_staff ON public.staff_permissions(staff_id);

-- Daily pass
CREATE INDEX IF NOT EXISTS idx_daily_pass_branch_id ON public.daily_pass_users(branch_id);
CREATE INDEX IF NOT EXISTS idx_daily_pass_subs_user ON public.daily_pass_subscriptions(daily_pass_user_id);
CREATE INDEX IF NOT EXISTS idx_daily_pass_subs_branch ON public.daily_pass_subscriptions(branch_id);

-- WhatsApp notifications
CREATE INDEX IF NOT EXISTS idx_whatsapp_branch_id ON public.whatsapp_notifications(branch_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_sent_at ON public.whatsapp_notifications(sent_at);
CREATE INDEX IF NOT EXISTS idx_whatsapp_status ON public.whatsapp_notifications(status);

-- Branches
CREATE INDEX IF NOT EXISTS idx_branches_tenant_id ON public.branches(tenant_id);

-- Tenant members
CREATE INDEX IF NOT EXISTS idx_tenant_members_user ON public.tenant_members(user_id);
CREATE INDEX IF NOT EXISTS idx_tenant_members_tenant ON public.tenant_members(tenant_id);
