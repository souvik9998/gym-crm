-- =====================================================
-- Security Hardening: Restrict Public INSERT Policies
-- =====================================================
-- This migration removes overly permissive public INSERT policies
-- and replaces them with proper role-based access control.
-- Edge functions use service_role which bypasses RLS entirely.
-- =====================================================

-- ========== CRITICAL: STAFF SESSIONS ==========
-- Only edge functions (service_role) should create sessions
DROP POLICY IF EXISTS "Public can insert staff sessions" ON public.staff_sessions;

-- ========== CRITICAL: STAFF LOGIN ATTEMPTS ==========
-- Only edge functions (service_role) should log attempts
DROP POLICY IF EXISTS "Public can insert login attempts" ON public.staff_login_attempts;

-- ========== CRITICAL: SUBSCRIPTIONS ==========
-- Only edge functions (service_role) should create subscriptions
DROP POLICY IF EXISTS "Public can insert subscriptions" ON public.subscriptions;

-- ========== CRITICAL: PT SUBSCRIPTIONS ==========
-- Admin/staff dialogs and edge functions create these
-- Drop public policy, add staff policy
DROP POLICY IF EXISTS "Public can insert PT subscriptions" ON public.pt_subscriptions;

-- Staff with can_manage_members can insert PT subscriptions
CREATE POLICY "Staff can insert PT subscriptions with permission"
ON public.pt_subscriptions
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM staff_permissions sp
    JOIN staff_branch_assignments sba ON sp.staff_id = sba.staff_id
    WHERE sp.can_manage_members = true
  )
);

-- ========== CRITICAL: PAYMENTS ==========
-- Already has "Staff can insert payments with permission" policy
-- Drop the overly permissive public policy
DROP POLICY IF EXISTS "Public can insert payments" ON public.payments;

-- ========== CRITICAL: LEDGER ENTRIES ==========
-- Already has staff INSERT policy, drop public policy
DROP POLICY IF EXISTS "Public can insert ledger entries" ON public.ledger_entries;

-- ========== MEMBER DETAILS ==========
-- Admin dialog and edge functions create these
-- Keep the public policy for now since edge functions use service_role anyway
-- and the verify-razorpay-payment creates member_details
-- The existing "Public can insert member details" is needed for registration flow

-- ========== DAILY PASS USERS ==========
-- Used in public registration flow via API layer
-- Keep the public INSERT policy but it's also handled by edge functions
-- The createDailyPassUser in dailyPass.ts inserts directly
-- This needs the public policy OR we move it to edge function

-- ========== DAILY PASS SUBSCRIPTIONS ==========
-- Only edge functions create these, drop public policy
DROP POLICY IF EXISTS "Public can insert daily pass subscriptions" ON public.daily_pass_subscriptions;

-- ========== ADMIN SUMMARY LOG ==========
-- Only edge functions create these (daily-whatsapp-job)
DROP POLICY IF EXISTS "Public can insert admin summary log" ON public.admin_summary_log;

-- ========== WHATSAPP NOTIFICATIONS ==========
-- Only edge functions create these
DROP POLICY IF EXISTS "Public can insert notifications" ON public.whatsapp_notifications;