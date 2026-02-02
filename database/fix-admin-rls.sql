-- ============================================================================
-- ADMIN RLS FIX SCRIPT
-- Project: Gym QR Pro
-- Target: ydswesigiavvgllqrbze.supabase.co
-- 
-- Run this to fix admin RLS policies after migration.
-- ============================================================================

-- ============================================================================
-- 1. ENSURE user_roles TABLE EXISTS
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.user_roles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  role public.app_role NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (user_id, role)
);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- 2. CREATE/UPDATE has_role FUNCTION (CRITICAL FOR ALL RLS)
-- ============================================================================

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

-- ============================================================================
-- 3. FIX user_roles RLS POLICIES
-- ============================================================================

DROP POLICY IF EXISTS "Admins can manage roles" ON public.user_roles;
DROP POLICY IF EXISTS "Users can view own roles" ON public.user_roles;

CREATE POLICY "Admins can manage roles" ON public.user_roles FOR ALL 
USING (has_role(auth.uid(), 'admin'));

CREATE POLICY "Users can view own roles" ON public.user_roles FOR SELECT 
USING (auth.uid() = user_id);

-- ============================================================================
-- 4. ADD YOUR ADMIN USER TO user_roles
-- Replace 'YOUR_ADMIN_USER_ID' with your actual admin user's UUID
-- You can find this in Supabase Dashboard -> Authentication -> Users
-- ============================================================================

-- IMPORTANT: Uncomment and update this line with your admin user's UUID:
-- INSERT INTO public.user_roles (user_id, role) 
-- VALUES ('YOUR_ADMIN_USER_ID_HERE', 'admin')
-- ON CONFLICT (user_id, role) DO NOTHING;

-- ============================================================================
-- 5. VERIFY SETUP
-- ============================================================================

-- Check if has_role function exists
SELECT 'has_role function exists' as check, 
       EXISTS(SELECT 1 FROM pg_proc WHERE proname = 'has_role') as result;

-- Check user_roles table
SELECT 'user_roles table exists' as check,
       EXISTS(SELECT 1 FROM information_schema.tables WHERE table_name = 'user_roles') as result;

-- List all admin users
SELECT 'Admin users in database:' as info;
SELECT ur.user_id, ur.role, au.email 
FROM public.user_roles ur
LEFT JOIN auth.users au ON ur.user_id = au.id
WHERE ur.role = 'admin';

-- ============================================================================
-- 6. IF NO ADMIN EXISTS, FIND YOUR USER ID AND ADD IT
-- ============================================================================

-- List all authenticated users to find your admin user:
SELECT 'All authenticated users:' as info;
SELECT id, email, created_at FROM auth.users ORDER BY created_at DESC LIMIT 10;

-- ============================================================================
-- AFTER RUNNING THIS, COPY YOUR ADMIN USER'S ID AND RUN:
-- 
-- INSERT INTO public.user_roles (user_id, role) 
-- VALUES ('paste-your-uuid-here', 'admin')
-- ON CONFLICT (user_id, role) DO NOTHING;
-- ============================================================================
