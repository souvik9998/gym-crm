-- Create enum for staff roles
CREATE TYPE public.staff_role AS ENUM ('admin', 'manager', 'trainer', 'reception', 'accountant');

-- Create enum for salary type
CREATE TYPE public.salary_type AS ENUM ('monthly', 'session_based', 'percentage', 'both');

-- Create staff table
CREATE TABLE public.staff (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    phone TEXT NOT NULL UNIQUE,
    full_name TEXT NOT NULL,
    role staff_role NOT NULL,
    id_type TEXT, -- aadhaar/pan/voter
    id_number TEXT,
    salary_type salary_type NOT NULL DEFAULT 'monthly',
    monthly_salary NUMERIC DEFAULT 0,
    session_fee NUMERIC DEFAULT 0,
    percentage_fee NUMERIC DEFAULT 0,
    specialization TEXT, -- For trainers
    password_hash TEXT, -- bcrypt hashed password
    password_set_at TIMESTAMP WITH TIME ZONE,
    is_active BOOLEAN NOT NULL DEFAULT true,
    failed_login_attempts INTEGER NOT NULL DEFAULT 0,
    locked_until TIMESTAMP WITH TIME ZONE,
    last_login_at TIMESTAMP WITH TIME ZONE,
    last_login_ip TEXT,
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create staff_branch_assignments table for multi-branch support
CREATE TABLE public.staff_branch_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    staff_id UUID NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
    branch_id UUID NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
    is_primary BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    UNIQUE(staff_id, branch_id)
);

-- Create staff_permissions table
CREATE TABLE public.staff_permissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    staff_id UUID NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE UNIQUE,
    can_view_members BOOLEAN NOT NULL DEFAULT false,
    can_manage_members BOOLEAN NOT NULL DEFAULT false, -- create/edit/update
    can_access_financials BOOLEAN NOT NULL DEFAULT false,
    can_access_analytics BOOLEAN NOT NULL DEFAULT false,
    can_change_settings BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create staff_sessions table for session management
CREATE TABLE public.staff_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    staff_id UUID NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
    session_token TEXT NOT NULL UNIQUE,
    ip_address TEXT,
    user_agent TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    is_revoked BOOLEAN NOT NULL DEFAULT false
);

-- Create login_attempts table for security tracking
CREATE TABLE public.staff_login_attempts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    phone TEXT NOT NULL,
    ip_address TEXT,
    user_agent TEXT,
    success BOOLEAN NOT NULL DEFAULT false,
    failure_reason TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on all tables
ALTER TABLE public.staff ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_branch_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_login_attempts ENABLE ROW LEVEL SECURITY;

-- RLS Policies for staff table
CREATE POLICY "Admins can manage staff"
ON public.staff FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Staff can view own profile"
ON public.staff FOR SELECT
USING (phone = current_setting('app.current_staff_phone', true));

-- RLS Policies for staff_branch_assignments
CREATE POLICY "Admins can manage staff branch assignments"
ON public.staff_branch_assignments FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Public can view staff branch assignments"
ON public.staff_branch_assignments FOR SELECT
USING (true);

-- RLS Policies for staff_permissions
CREATE POLICY "Admins can manage staff permissions"
ON public.staff_permissions FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Public can view staff permissions"
ON public.staff_permissions FOR SELECT
USING (true);

-- RLS Policies for staff_sessions
CREATE POLICY "Admins can manage staff sessions"
ON public.staff_sessions FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Public can insert staff sessions"
ON public.staff_sessions FOR INSERT
WITH CHECK (true);

CREATE POLICY "Public can view staff sessions"
ON public.staff_sessions FOR SELECT
USING (true);

CREATE POLICY "Public can update staff sessions"
ON public.staff_sessions FOR UPDATE
USING (true);

-- RLS Policies for staff_login_attempts
CREATE POLICY "Admins can view login attempts"
ON public.staff_login_attempts FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Public can insert login attempts"
ON public.staff_login_attempts FOR INSERT
WITH CHECK (true);

CREATE POLICY "Public can view login attempts"
ON public.staff_login_attempts FOR SELECT
USING (true);

-- Create updated_at trigger for staff table
CREATE TRIGGER update_staff_updated_at
    BEFORE UPDATE ON public.staff
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

-- Create updated_at trigger for staff_permissions table
CREATE TRIGGER update_staff_permissions_updated_at
    BEFORE UPDATE ON public.staff_permissions
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

-- Create indexes for performance
CREATE INDEX idx_staff_phone ON public.staff(phone);
CREATE INDEX idx_staff_role ON public.staff(role);
CREATE INDEX idx_staff_is_active ON public.staff(is_active);
CREATE INDEX idx_staff_branch_assignments_staff_id ON public.staff_branch_assignments(staff_id);
CREATE INDEX idx_staff_branch_assignments_branch_id ON public.staff_branch_assignments(branch_id);
CREATE INDEX idx_staff_sessions_token ON public.staff_sessions(session_token);
CREATE INDEX idx_staff_sessions_staff_id ON public.staff_sessions(staff_id);
CREATE INDEX idx_staff_login_attempts_phone ON public.staff_login_attempts(phone);
CREATE INDEX idx_staff_login_attempts_created_at ON public.staff_login_attempts(created_at);