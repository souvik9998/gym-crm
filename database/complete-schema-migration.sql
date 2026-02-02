-- ============================================================================
-- COMPLETE DATABASE SCHEMA MIGRATION
-- Project: Gym QR Pro
-- Target: ydswesigiavvgllqrbze.supabase.co
-- 
-- This SQL creates all tables, enums, functions, triggers, and RLS policies
-- needed for the Gym QR Pro application.
-- ============================================================================

-- ============================================================================
-- 1. ENUMS
-- ============================================================================

CREATE TYPE public.app_role AS ENUM ('admin', 'member', 'staff');
CREATE TYPE public.payment_mode AS ENUM ('online', 'cash');
CREATE TYPE public.payment_status AS ENUM ('pending', 'success', 'failed');
CREATE TYPE public.salary_type AS ENUM ('monthly', 'session_based', 'percentage', 'both');
CREATE TYPE public.staff_role AS ENUM ('manager', 'trainer', 'reception', 'accountant');
CREATE TYPE public.subscription_status AS ENUM ('active', 'expired', 'expiring_soon', 'paused', 'inactive');

-- ============================================================================
-- 2. TABLES
-- ============================================================================

-- Branches table
CREATE TABLE public.branches (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  address TEXT,
  phone TEXT,
  email TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  is_default BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

-- User roles table (critical for auth - separate from profiles!)
CREATE TABLE public.user_roles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  role public.app_role NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (user_id, role)
);

-- Members table
CREATE TABLE public.members (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  email TEXT,
  join_date DATE DEFAULT CURRENT_DATE,
  branch_id UUID NOT NULL REFERENCES public.branches(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Member details table
CREATE TABLE public.member_details (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  member_id UUID NOT NULL UNIQUE REFERENCES public.members(id) ON DELETE CASCADE,
  date_of_birth DATE,
  gender TEXT,
  address TEXT,
  photo_id_type TEXT,
  photo_id_number TEXT,
  personal_trainer_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Personal trainers table
CREATE TABLE public.personal_trainers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT,
  specialization TEXT,
  monthly_fee NUMERIC NOT NULL DEFAULT 500,
  percentage_fee NUMERIC NOT NULL DEFAULT 0,
  session_fee NUMERIC NOT NULL DEFAULT 0,
  monthly_salary NUMERIC NOT NULL DEFAULT 0,
  payment_category TEXT NOT NULL DEFAULT 'monthly_percentage',
  is_active BOOLEAN NOT NULL DEFAULT true,
  branch_id UUID REFERENCES public.branches(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Add foreign key to member_details after personal_trainers is created
ALTER TABLE public.member_details 
ADD CONSTRAINT member_details_personal_trainer_id_fkey 
FOREIGN KEY (personal_trainer_id) REFERENCES public.personal_trainers(id);

-- Monthly packages table
CREATE TABLE public.monthly_packages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  months INTEGER NOT NULL,
  price NUMERIC NOT NULL,
  joining_fee NUMERIC NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  branch_id UUID REFERENCES public.branches(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Custom packages table
CREATE TABLE public.custom_packages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  duration_days INTEGER NOT NULL,
  price NUMERIC NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  branch_id UUID REFERENCES public.branches(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Subscriptions table
CREATE TABLE public.subscriptions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  member_id UUID NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  start_date DATE NOT NULL DEFAULT CURRENT_DATE,
  end_date DATE NOT NULL,
  plan_months INTEGER NOT NULL,
  status public.subscription_status DEFAULT 'active',
  personal_trainer_id UUID REFERENCES public.personal_trainers(id),
  trainer_fee NUMERIC DEFAULT 0,
  is_custom_package BOOLEAN DEFAULT false,
  custom_days INTEGER,
  pt_start_date DATE,
  pt_end_date DATE,
  branch_id UUID REFERENCES public.branches(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- PT Subscriptions table
CREATE TABLE public.pt_subscriptions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  member_id UUID NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  personal_trainer_id UUID NOT NULL REFERENCES public.personal_trainers(id),
  start_date DATE NOT NULL DEFAULT CURRENT_DATE,
  end_date DATE NOT NULL,
  monthly_fee NUMERIC NOT NULL DEFAULT 0,
  total_fee NUMERIC NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active',
  branch_id UUID REFERENCES public.branches(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Payments table
CREATE TABLE public.payments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  member_id UUID REFERENCES public.members(id),
  subscription_id UUID REFERENCES public.subscriptions(id),
  daily_pass_user_id UUID,
  daily_pass_subscription_id UUID,
  amount NUMERIC NOT NULL,
  payment_mode public.payment_mode NOT NULL,
  status public.payment_status DEFAULT 'pending',
  payment_type TEXT DEFAULT 'gym_membership',
  razorpay_order_id TEXT,
  razorpay_payment_id TEXT,
  notes TEXT,
  branch_id UUID REFERENCES public.branches(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Daily pass users table
CREATE TABLE public.daily_pass_users (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  email TEXT,
  gender TEXT,
  photo_id_type TEXT,
  photo_id_number TEXT,
  address TEXT,
  branch_id UUID REFERENCES public.branches(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Add foreign key to payments after daily_pass_users is created
ALTER TABLE public.payments 
ADD CONSTRAINT payments_daily_pass_user_id_fkey 
FOREIGN KEY (daily_pass_user_id) REFERENCES public.daily_pass_users(id);

-- Daily pass subscriptions table
CREATE TABLE public.daily_pass_subscriptions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  daily_pass_user_id UUID NOT NULL REFERENCES public.daily_pass_users(id) ON DELETE CASCADE,
  package_id UUID REFERENCES public.custom_packages(id),
  package_name TEXT NOT NULL,
  duration_days INTEGER NOT NULL,
  start_date DATE NOT NULL DEFAULT CURRENT_DATE,
  end_date DATE NOT NULL,
  price NUMERIC NOT NULL,
  personal_trainer_id UUID REFERENCES public.personal_trainers(id),
  trainer_fee NUMERIC DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active',
  branch_id UUID REFERENCES public.branches(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Add foreign key to payments for daily_pass_subscription
ALTER TABLE public.payments 
ADD CONSTRAINT payments_daily_pass_subscription_id_fkey 
FOREIGN KEY (daily_pass_subscription_id) REFERENCES public.daily_pass_subscriptions(id);

-- Gym settings table
CREATE TABLE public.gym_settings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  gym_name TEXT DEFAULT 'Pro Plus Fitness, Dinhata',
  gym_phone TEXT,
  gym_address TEXT,
  monthly_fee NUMERIC NOT NULL DEFAULT 500.00,
  joining_fee NUMERIC NOT NULL DEFAULT 200.00,
  monthly_packages INTEGER[] DEFAULT ARRAY[1, 3, 6, 12],
  whatsapp_enabled BOOLEAN DEFAULT false,
  branch_id UUID REFERENCES public.branches(id),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Ledger entries table
CREATE TABLE public.ledger_entries (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  entry_type TEXT NOT NULL,
  category TEXT NOT NULL,
  description TEXT NOT NULL,
  amount NUMERIC NOT NULL,
  notes TEXT,
  entry_date DATE NOT NULL DEFAULT CURRENT_DATE,
  member_id UUID REFERENCES public.members(id),
  daily_pass_user_id UUID REFERENCES public.daily_pass_users(id),
  payment_id UUID REFERENCES public.payments(id),
  trainer_id UUID REFERENCES public.personal_trainers(id),
  pt_subscription_id UUID REFERENCES public.pt_subscriptions(id),
  is_auto_generated BOOLEAN NOT NULL DEFAULT false,
  created_by UUID,
  branch_id UUID REFERENCES public.branches(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Staff table
CREATE TABLE public.staff (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  full_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  role public.staff_role NOT NULL,
  salary_type public.salary_type NOT NULL DEFAULT 'monthly',
  monthly_salary NUMERIC DEFAULT 0,
  session_fee NUMERIC DEFAULT 0,
  percentage_fee NUMERIC DEFAULT 0,
  specialization TEXT,
  id_type TEXT,
  id_number TEXT,
  auth_user_id UUID,
  password_hash TEXT,
  password_set_at TIMESTAMPTZ,
  is_active BOOLEAN NOT NULL DEFAULT true,
  failed_login_attempts INTEGER NOT NULL DEFAULT 0,
  locked_until TIMESTAMPTZ,
  last_login_at TIMESTAMPTZ,
  last_login_ip TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Staff branch assignments table
CREATE TABLE public.staff_branch_assignments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  staff_id UUID NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  branch_id UUID NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  is_primary BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Staff permissions table
CREATE TABLE public.staff_permissions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  staff_id UUID NOT NULL UNIQUE REFERENCES public.staff(id) ON DELETE CASCADE,
  can_view_members BOOLEAN NOT NULL DEFAULT false,
  can_manage_members BOOLEAN NOT NULL DEFAULT false,
  can_access_ledger BOOLEAN NOT NULL DEFAULT false,
  can_access_payments BOOLEAN NOT NULL DEFAULT false,
  can_access_analytics BOOLEAN NOT NULL DEFAULT false,
  can_change_settings BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Staff sessions table
CREATE TABLE public.staff_sessions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  staff_id UUID NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  session_token TEXT NOT NULL,
  ip_address TEXT,
  user_agent TEXT,
  is_revoked BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL
);

-- Staff login attempts table
CREATE TABLE public.staff_login_attempts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  phone TEXT NOT NULL,
  ip_address TEXT,
  user_agent TEXT,
  success BOOLEAN NOT NULL DEFAULT false,
  failure_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Admin activity logs table
CREATE TABLE public.admin_activity_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  admin_user_id UUID,
  activity_category TEXT NOT NULL,
  activity_type TEXT NOT NULL,
  description TEXT NOT NULL,
  entity_type TEXT,
  entity_id UUID,
  entity_name TEXT,
  old_value JSONB,
  new_value JSONB,
  metadata JSONB,
  branch_id UUID REFERENCES public.branches(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- User activity logs table
CREATE TABLE public.user_activity_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  activity_type TEXT NOT NULL,
  description TEXT NOT NULL,
  member_id UUID REFERENCES public.members(id),
  daily_pass_user_id UUID REFERENCES public.daily_pass_users(id),
  subscription_id UUID REFERENCES public.subscriptions(id),
  pt_subscription_id UUID REFERENCES public.pt_subscriptions(id),
  payment_id UUID REFERENCES public.payments(id),
  trainer_id UUID REFERENCES public.personal_trainers(id),
  amount NUMERIC,
  payment_mode TEXT,
  package_name TEXT,
  duration_months INTEGER,
  duration_days INTEGER,
  member_name TEXT,
  member_phone TEXT,
  trainer_name TEXT,
  start_date DATE,
  end_date DATE,
  metadata JSONB,
  branch_id UUID REFERENCES public.branches(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- WhatsApp notifications table
CREATE TABLE public.whatsapp_notifications (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  member_id UUID NOT NULL REFERENCES public.members(id),
  daily_pass_user_id UUID REFERENCES public.daily_pass_users(id),
  notification_type TEXT NOT NULL,
  recipient_phone TEXT,
  recipient_name TEXT,
  message_content TEXT,
  status TEXT NOT NULL DEFAULT 'sent',
  error_message TEXT,
  is_manual BOOLEAN DEFAULT false,
  admin_user_id UUID,
  branch_id UUID REFERENCES public.branches(id),
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Admin summary log table
CREATE TABLE public.admin_summary_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  summary_type TEXT NOT NULL,
  member_ids UUID[] NOT NULL DEFAULT '{}',
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================================
-- 3. DATABASE FUNCTIONS
-- ============================================================================

-- Function to check if user has a specific role
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF _user_id IS NULL OR _role IS NULL THEN
    RETURN false;
  END IF;
  
  RETURN EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  );
END;
$$;

-- Function to check if user is staff
CREATE OR REPLACE FUNCTION public.is_staff(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.staff
    WHERE auth_user_id = _user_id AND is_active = true
  )
$$;

-- Function to get staff ID from user ID
CREATE OR REPLACE FUNCTION public.get_staff_id(_user_id UUID)
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id
  FROM public.staff
  WHERE auth_user_id = _user_id AND is_active = true
  LIMIT 1
$$;

-- Function to check staff permission
CREATE OR REPLACE FUNCTION public.staff_has_permission(_staff_id UUID, _permission TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.staff_permissions sp
    WHERE sp.staff_id = _staff_id
      AND (
        (_permission = 'view_members' AND sp.can_view_members = true) OR
        (_permission = 'manage_members' AND sp.can_manage_members = true) OR
        (_permission = 'access_ledger' AND sp.can_access_ledger = true) OR
        (_permission = 'access_payments' AND sp.can_access_payments = true) OR
        (_permission = 'access_analytics' AND sp.can_access_analytics = true) OR
        (_permission = 'change_settings' AND sp.can_change_settings = true)
      )
  )
$$;

-- Function to get staff ID from session token
CREATE OR REPLACE FUNCTION public.get_staff_id_from_session()
RETURNS UUID
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_token TEXT;
  v_staff_id UUID;
BEGIN
  v_token := current_setting('app.staff_session_token', true);
  
  IF v_token IS NULL OR v_token = '' THEN
    RETURN NULL;
  END IF;
  
  SELECT staff_id INTO v_staff_id
  FROM public.staff_sessions
  WHERE session_token = v_token
    AND is_revoked = false
    AND expires_at > now();
    
  RETURN v_staff_id;
END;
$$;

-- Function to check phone exists (for registration)
CREATE OR REPLACE FUNCTION public.check_phone_exists(phone_number TEXT, p_branch_id UUID DEFAULT NULL)
RETURNS TABLE(
  member_exists BOOLEAN, 
  member_id UUID, 
  member_name TEXT, 
  member_phone TEXT, 
  member_email TEXT, 
  has_active_subscription BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF phone_number IS NULL OR phone_number = '' THEN
    RAISE EXCEPTION 'Phone number is required';
  END IF;
  
  IF NOT (phone_number ~ '^[6-9][0-9]{9}$') THEN
    RAISE EXCEPTION 'Invalid phone number format';
  END IF;

  RETURN QUERY 
  SELECT 
    TRUE as member_exists,
    m.id as member_id,
    m.name as member_name,
    m.phone as member_phone,
    m.email as member_email,
    EXISTS(
      SELECT 1 FROM subscriptions s 
      WHERE s.member_id = m.id 
      AND s.status IN ('active', 'expiring_soon')
    ) as has_active_subscription
  FROM members m
  WHERE m.phone = phone_number
    AND (p_branch_id IS NULL OR m.branch_id = p_branch_id)
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, NULL::TEXT, NULL::TEXT, NULL::TEXT, FALSE;
  END IF;
END;
$$;

-- Function to get member subscription info
CREATE OR REPLACE FUNCTION public.get_member_subscription_info(p_member_id UUID)
RETURNS TABLE(subscription_id UUID, start_date DATE, end_date DATE, status TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_member_id IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY 
  SELECT 
    s.id as subscription_id,
    s.start_date,
    s.end_date,
    s.status::TEXT
  FROM subscriptions s
  WHERE s.member_id = p_member_id
  ORDER BY s.end_date DESC
  LIMIT 1;
END;
$$;

-- Function to update subscription statuses
CREATE OR REPLACE FUNCTION public.refresh_subscription_statuses()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Mark members as inactive if expired > 30 days
  UPDATE subscriptions 
  SET status = 'inactive', updated_at = NOW()
  WHERE end_date < CURRENT_DATE - INTERVAL '30 days'
    AND status != 'inactive';
    
  -- Update other statuses
  UPDATE subscriptions 
  SET updated_at = NOW()
  WHERE (
    (status = 'active' AND end_date < CURRENT_DATE) OR
    (status = 'active' AND end_date <= CURRENT_DATE + INTERVAL '7 days' AND status != 'expiring_soon') OR
    (status IN ('expiring_soon', 'expired') AND end_date > CURRENT_DATE + INTERVAL '7 days')
  );
END;
$$;

-- Function to update updated_at column
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

-- Function to update subscription status trigger
CREATE OR REPLACE FUNCTION public.update_subscription_status()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.end_date < CURRENT_DATE - INTERVAL '30 days' THEN
    NEW.status = 'inactive';
  ELSIF NEW.end_date < CURRENT_DATE THEN
    NEW.status = 'expired';
  ELSIF NEW.end_date <= CURRENT_DATE + INTERVAL '7 days' THEN
    NEW.status = 'expiring_soon';
  ELSE
    NEW.status = 'active';
  END IF;
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

-- Function to set default branch for members
CREATE OR REPLACE FUNCTION public.set_members_branch_id_default()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_default_branch UUID;
BEGIN
  IF NEW.branch_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  SELECT id INTO v_default_branch
  FROM public.branches
  WHERE is_default = true
  ORDER BY created_at ASC
  LIMIT 1;

  IF v_default_branch IS NULL THEN
    SELECT id INTO v_default_branch
    FROM public.branches
    WHERE is_active = true
    ORDER BY created_at ASC
    LIMIT 1;
  END IF;

  NEW.branch_id := v_default_branch;
  RETURN NEW;
END;
$$;

-- Function to check staff phone/branch uniqueness
CREATE OR REPLACE FUNCTION public.check_staff_phone_branch_uniqueness()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF EXISTS (
    SELECT 1 
    FROM public.staff s
    JOIN public.staff_branch_assignments sba ON s.id = sba.staff_id
    WHERE s.phone = (
      SELECT phone FROM public.staff WHERE id = NEW.staff_id
    )
    AND sba.branch_id = NEW.branch_id
    AND s.id != NEW.staff_id
  ) THEN
    RAISE EXCEPTION 'A staff member with this phone number already exists in this branch';
  END IF;
  
  RETURN NEW;
END;
$$;

-- ============================================================================
-- 4. TRIGGERS
-- ============================================================================

-- Updated at triggers
CREATE TRIGGER update_members_updated_at BEFORE UPDATE ON public.members
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_member_details_updated_at BEFORE UPDATE ON public.member_details
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_branches_updated_at BEFORE UPDATE ON public.branches
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_subscriptions_updated_at BEFORE UPDATE ON public.subscriptions
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_personal_trainers_updated_at BEFORE UPDATE ON public.personal_trainers
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_staff_updated_at BEFORE UPDATE ON public.staff
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Subscription status trigger
CREATE TRIGGER update_subscription_status_trigger
BEFORE INSERT OR UPDATE ON public.subscriptions
FOR EACH ROW EXECUTE FUNCTION public.update_subscription_status();

-- Staff phone/branch uniqueness trigger
CREATE TRIGGER check_staff_phone_branch_uniqueness_trigger
BEFORE INSERT OR UPDATE ON public.staff_branch_assignments
FOR EACH ROW EXECUTE FUNCTION public.check_staff_phone_branch_uniqueness();

-- ============================================================================
-- 5. ENABLE ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE public.branches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.member_details ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.personal_trainers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.monthly_packages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.custom_packages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pt_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_pass_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_pass_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gym_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ledger_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_branch_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_login_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_activity_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_activity_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_summary_log ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- 6. RLS POLICIES
-- ============================================================================

-- Branches policies
CREATE POLICY "Admins can manage branches" ON public.branches FOR ALL 
USING (has_role(auth.uid(), 'admin'));

CREATE POLICY "Anyone can view active non-deleted branches" ON public.branches FOR SELECT 
USING (is_active = true AND deleted_at IS NULL);

-- User roles policies
CREATE POLICY "Admins can manage roles" ON public.user_roles FOR ALL 
USING (has_role(auth.uid(), 'admin'));

CREATE POLICY "Users can view own roles" ON public.user_roles FOR SELECT 
USING (auth.uid() = user_id);

-- Members policies
CREATE POLICY "Admins can view all members" ON public.members FOR SELECT 
USING (has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can insert members" ON public.members FOR INSERT 
WITH CHECK (has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update members" ON public.members FOR UPDATE 
USING (has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete members" ON public.members FOR DELETE 
USING (has_role(auth.uid(), 'admin'));

CREATE POLICY "Staff can view members with permission" ON public.members FOR SELECT 
USING (
  has_role(auth.uid(), 'admin') OR
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

CREATE POLICY "Staff can insert members with permission" ON public.members FOR INSERT 
WITH CHECK (
  has_role(auth.uid(), 'admin') OR
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

CREATE POLICY "Staff can update members with permission" ON public.members FOR UPDATE 
USING (
  has_role(auth.uid(), 'admin') OR
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

-- Member details policies
CREATE POLICY "Admins can manage member details" ON public.member_details FOR ALL 
USING (has_role(auth.uid(), 'admin'));

CREATE POLICY "Public can insert member details" ON public.member_details FOR INSERT 
WITH CHECK (true);

CREATE POLICY "Staff can insert member details with permission" ON public.member_details FOR INSERT 
WITH CHECK (
  has_role(auth.uid(), 'admin') OR
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

CREATE POLICY "Staff can update member details with permission" ON public.member_details FOR UPDATE 
USING (
  has_role(auth.uid(), 'admin') OR
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

-- Personal trainers policies
CREATE POLICY "Admins can manage trainers" ON public.personal_trainers FOR ALL 
USING (has_role(auth.uid(), 'admin'));

CREATE POLICY "Anyone can view active trainers" ON public.personal_trainers FOR SELECT 
USING (is_active = true);

-- Monthly packages policies
CREATE POLICY "Admins can manage monthly packages" ON public.monthly_packages FOR ALL 
USING (has_role(auth.uid(), 'admin'));

CREATE POLICY "Anyone can view active monthly packages" ON public.monthly_packages FOR SELECT 
USING (is_active = true);

CREATE POLICY "Staff can manage monthly packages with permission" ON public.monthly_packages FOR ALL 
USING (
  EXISTS (
    SELECT 1 FROM staff_permissions sp
    JOIN staff_branch_assignments sba ON sp.staff_id = sba.staff_id
    WHERE sp.can_change_settings = true 
    AND sba.branch_id = monthly_packages.branch_id
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM staff_permissions sp
    JOIN staff_branch_assignments sba ON sp.staff_id = sba.staff_id
    WHERE sp.can_change_settings = true 
    AND sba.branch_id = sba.branch_id
  )
);

-- Custom packages policies
CREATE POLICY "Admins can manage packages" ON public.custom_packages FOR ALL 
USING (has_role(auth.uid(), 'admin'));

CREATE POLICY "Anyone can view active packages" ON public.custom_packages FOR SELECT 
USING (is_active = true);

CREATE POLICY "Staff can manage custom packages with permission" ON public.custom_packages FOR ALL 
USING (
  EXISTS (
    SELECT 1 FROM staff_permissions sp
    JOIN staff_branch_assignments sba ON sp.staff_id = sba.staff_id
    WHERE sp.can_change_settings = true 
    AND sba.branch_id = custom_packages.branch_id
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM staff_permissions sp
    JOIN staff_branch_assignments sba ON sp.staff_id = sba.staff_id
    WHERE sp.can_change_settings = true 
    AND sba.branch_id = sba.branch_id
  )
);

-- Subscriptions policies
CREATE POLICY "Admins can manage subscriptions" ON public.subscriptions FOR ALL 
USING (has_role(auth.uid(), 'admin'));

CREATE POLICY "Public can view subscriptions" ON public.subscriptions FOR SELECT 
USING (true);

CREATE POLICY "Staff can view subscriptions with permission" ON public.subscriptions FOR SELECT 
USING (
  has_role(auth.uid(), 'admin') OR
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

CREATE POLICY "Staff can insert subscriptions with permission" ON public.subscriptions FOR INSERT 
WITH CHECK (
  has_role(auth.uid(), 'admin') OR
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

CREATE POLICY "Staff can update subscriptions with permission" ON public.subscriptions FOR UPDATE 
USING (
  has_role(auth.uid(), 'admin') OR
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

-- PT Subscriptions policies
CREATE POLICY "Admins can manage PT subscriptions" ON public.pt_subscriptions FOR ALL 
USING (has_role(auth.uid(), 'admin'));

CREATE POLICY "Public can view PT subscriptions" ON public.pt_subscriptions FOR SELECT 
USING (true);

CREATE POLICY "Staff can insert PT subscriptions with permission" ON public.pt_subscriptions FOR INSERT 
WITH CHECK (
  EXISTS (
    SELECT 1 FROM staff_permissions sp
    JOIN staff_branch_assignments sba ON sp.staff_id = sba.staff_id
    WHERE sp.can_manage_members = true
  )
);

CREATE POLICY "Staff can update PT subscriptions with permission" ON public.pt_subscriptions FOR UPDATE 
USING (
  EXISTS (
    SELECT 1 FROM staff_permissions sp
    JOIN staff_branch_assignments sba ON sp.staff_id = sba.staff_id
    WHERE sp.can_manage_members = true 
    AND sba.branch_id = pt_subscriptions.branch_id
  )
);

-- Payments policies
CREATE POLICY "Admins can manage payments" ON public.payments FOR ALL 
USING (has_role(auth.uid(), 'admin'));

CREATE POLICY "Public can view own payments" ON public.payments FOR SELECT 
USING (true);

CREATE POLICY "Staff can view payments with permission" ON public.payments FOR SELECT 
USING (
  has_role(auth.uid(), 'admin') OR
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

CREATE POLICY "Staff can insert payments with permission" ON public.payments FOR INSERT 
WITH CHECK (
  has_role(auth.uid(), 'admin') OR
  EXISTS (
    SELECT 1 FROM staff s
    JOIN staff_permissions sp ON s.id = sp.staff_id
    JOIN staff_branch_assignments sba ON s.id = sba.staff_id
    WHERE s.auth_user_id = auth.uid() 
    AND s.is_active = true 
    AND sp.can_access_payments = true
    AND sba.branch_id = sba.branch_id
  )
);

-- Daily pass users policies
CREATE POLICY "Admins can manage daily pass users" ON public.daily_pass_users FOR ALL 
USING (has_role(auth.uid(), 'admin'));

CREATE POLICY "Public can insert daily pass users" ON public.daily_pass_users FOR INSERT 
WITH CHECK (true);

CREATE POLICY "Public can view daily pass users" ON public.daily_pass_users FOR SELECT 
USING (true);

-- Daily pass subscriptions policies
CREATE POLICY "Admins can manage daily pass subscriptions" ON public.daily_pass_subscriptions FOR ALL 
USING (has_role(auth.uid(), 'admin'));

CREATE POLICY "Public can view daily pass subscriptions" ON public.daily_pass_subscriptions FOR SELECT 
USING (true);

-- Gym settings policies
CREATE POLICY "Anyone can view gym settings" ON public.gym_settings FOR SELECT 
USING (true);

CREATE POLICY "Admins can insert gym settings" ON public.gym_settings FOR INSERT 
WITH CHECK (has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update gym settings" ON public.gym_settings FOR UPDATE 
USING (has_role(auth.uid(), 'admin'));

CREATE POLICY "Staff can update gym settings with permission" ON public.gym_settings FOR UPDATE 
USING (
  EXISTS (
    SELECT 1 FROM staff_permissions sp
    JOIN staff_branch_assignments sba ON sp.staff_id = sba.staff_id
    WHERE sp.can_change_settings = true 
    AND sba.branch_id = gym_settings.branch_id
  )
);

-- Ledger entries policies
CREATE POLICY "Admins can manage ledger entries" ON public.ledger_entries FOR ALL 
USING (has_role(auth.uid(), 'admin'));

CREATE POLICY "Public can view ledger entries" ON public.ledger_entries FOR SELECT 
USING (true);

CREATE POLICY "Staff can view ledger with permission" ON public.ledger_entries FOR SELECT 
USING (
  has_role(auth.uid(), 'admin') OR
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

CREATE POLICY "Staff can insert ledger entries with permission" ON public.ledger_entries FOR INSERT 
WITH CHECK (
  has_role(auth.uid(), 'admin') OR
  EXISTS (
    SELECT 1 FROM staff s
    JOIN staff_permissions sp ON s.id = sp.staff_id
    JOIN staff_branch_assignments sba ON s.id = sba.staff_id
    WHERE s.auth_user_id = auth.uid() 
    AND s.is_active = true 
    AND sp.can_access_ledger = true
    AND sba.branch_id = sba.branch_id
  )
);

CREATE POLICY "Staff can update ledger entries with permission" ON public.ledger_entries FOR UPDATE 
USING (
  has_role(auth.uid(), 'admin') OR
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

CREATE POLICY "Staff can delete ledger entries with permission" ON public.ledger_entries FOR DELETE 
USING (
  has_role(auth.uid(), 'admin') OR
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

-- Staff policies
CREATE POLICY "Admins can manage staff" ON public.staff FOR ALL 
USING (has_role(auth.uid(), 'admin'));

CREATE POLICY "Staff can view own profile via auth" ON public.staff FOR SELECT 
USING (has_role(auth.uid(), 'admin') OR auth_user_id = auth.uid());

-- Staff branch assignments policies
CREATE POLICY "Admins can manage staff branch assignments" ON public.staff_branch_assignments FOR ALL 
USING (has_role(auth.uid(), 'admin'));

CREATE POLICY "Public can view staff branch assignments" ON public.staff_branch_assignments FOR SELECT 
USING (true);

CREATE POLICY "Staff can view own branch assignments via auth" ON public.staff_branch_assignments FOR SELECT 
USING (
  has_role(auth.uid(), 'admin') OR
  EXISTS (
    SELECT 1 FROM staff s
    WHERE s.id = staff_branch_assignments.staff_id 
    AND s.auth_user_id = auth.uid()
  )
);

-- Staff permissions policies
CREATE POLICY "Admins can manage staff permissions" ON public.staff_permissions FOR ALL 
USING (has_role(auth.uid(), 'admin'));

CREATE POLICY "Public can view staff permissions" ON public.staff_permissions FOR SELECT 
USING (true);

CREATE POLICY "Staff can view own permissions via auth" ON public.staff_permissions FOR SELECT 
USING (
  has_role(auth.uid(), 'admin') OR
  EXISTS (
    SELECT 1 FROM staff s
    WHERE s.id = staff_permissions.staff_id 
    AND s.auth_user_id = auth.uid()
  )
);

-- Staff sessions policies
CREATE POLICY "Admins can manage staff sessions" ON public.staff_sessions FOR ALL 
USING (has_role(auth.uid(), 'admin'));

CREATE POLICY "Public can view staff sessions" ON public.staff_sessions FOR SELECT 
USING (true);

CREATE POLICY "Public can update staff sessions" ON public.staff_sessions FOR UPDATE 
USING (true);

-- Staff login attempts policies
CREATE POLICY "Admins can view login attempts" ON public.staff_login_attempts FOR ALL 
USING (has_role(auth.uid(), 'admin'));

CREATE POLICY "Public can view login attempts" ON public.staff_login_attempts FOR SELECT 
USING (true);

-- Admin activity logs policies
CREATE POLICY "Admins can manage admin activity logs" ON public.admin_activity_logs FOR ALL 
USING (has_role(auth.uid(), 'admin'));

CREATE POLICY "Public can insert admin activity logs" ON public.admin_activity_logs FOR INSERT 
WITH CHECK (true);

CREATE POLICY "Staff can insert activity logs" ON public.admin_activity_logs FOR INSERT 
WITH CHECK (admin_user_id IS NULL OR admin_user_id = auth.uid());

CREATE POLICY "Staff can view activity logs" ON public.admin_activity_logs FOR SELECT 
USING (EXISTS (SELECT 1 FROM staff_permissions sp WHERE sp.staff_id IS NOT NULL) OR true);

-- User activity logs policies
CREATE POLICY "Admins can manage user activity logs" ON public.user_activity_logs FOR ALL 
USING (has_role(auth.uid(), 'admin'));

CREATE POLICY "Public can insert user activity logs" ON public.user_activity_logs FOR INSERT 
WITH CHECK (true);

CREATE POLICY "Public can view user activity logs" ON public.user_activity_logs FOR SELECT 
USING (true);

-- WhatsApp notifications policies
CREATE POLICY "Admins can manage whatsapp notifications" ON public.whatsapp_notifications FOR ALL 
USING (has_role(auth.uid(), 'admin'));

CREATE POLICY "Public can view notifications" ON public.whatsapp_notifications FOR SELECT 
USING (true);

-- Admin summary log policies
CREATE POLICY "Admins can manage admin summary log" ON public.admin_summary_log FOR ALL 
USING (has_role(auth.uid(), 'admin'));

CREATE POLICY "Public can view admin summary log" ON public.admin_summary_log FOR SELECT 
USING (true);

-- ============================================================================
-- 7. INDEXES FOR PERFORMANCE
-- ============================================================================

CREATE INDEX idx_members_branch_id ON public.members(branch_id);
CREATE INDEX idx_members_phone ON public.members(phone);
CREATE INDEX idx_subscriptions_member_id ON public.subscriptions(member_id);
CREATE INDEX idx_subscriptions_status ON public.subscriptions(status);
CREATE INDEX idx_subscriptions_end_date ON public.subscriptions(end_date);
CREATE INDEX idx_payments_member_id ON public.payments(member_id);
CREATE INDEX idx_payments_branch_id ON public.payments(branch_id);
CREATE INDEX idx_payments_status ON public.payments(status);
CREATE INDEX idx_ledger_entries_branch_id ON public.ledger_entries(branch_id);
CREATE INDEX idx_ledger_entries_entry_date ON public.ledger_entries(entry_date);
CREATE INDEX idx_staff_phone ON public.staff(phone);
CREATE INDEX idx_staff_auth_user_id ON public.staff(auth_user_id);
CREATE INDEX idx_pt_subscriptions_member_id ON public.pt_subscriptions(member_id);
CREATE INDEX idx_pt_subscriptions_trainer_id ON public.pt_subscriptions(personal_trainer_id);
CREATE INDEX idx_daily_pass_users_branch_id ON public.daily_pass_users(branch_id);

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================

-- After running this migration, you need to:
-- 1. Create an admin user in Supabase Auth
-- 2. Add their user_id to user_roles with role='admin'
-- 3. Configure edge function secrets
-- 4. Deploy edge functions
-- 5. Update frontend environment variables
