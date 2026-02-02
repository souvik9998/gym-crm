-- ============================================================================
-- ADMIN USER SETUP
-- 
-- Run this AFTER creating your admin user in Supabase Auth Dashboard.
-- Replace 'YOUR_ADMIN_USER_ID' with the actual UUID from auth.users
-- ============================================================================

-- Step 1: First, create a user in Supabase Auth Dashboard
-- Go to: Dashboard → Authentication → Users → Add User
-- Email: your-admin-email@example.com
-- Password: your-secure-password

-- Step 2: Get the user's ID from the users list and replace below
-- Then run this SQL:

-- INSERT INTO public.user_roles (user_id, role)
-- VALUES ('YOUR_ADMIN_USER_ID', 'admin');

-- ============================================================================
-- EXAMPLE: Setting up first admin
-- ============================================================================

-- After creating user in Auth, get their ID and run:
-- INSERT INTO public.user_roles (user_id, role) VALUES ('xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx', 'admin');

-- ============================================================================
-- VERIFY ADMIN SETUP
-- ============================================================================

-- Check if admin exists:
-- SELECT ur.*, au.email 
-- FROM public.user_roles ur 
-- JOIN auth.users au ON au.id = ur.user_id 
-- WHERE ur.role = 'admin';
