-- ==============================================================
-- SECURITY FIX: Tighten RLS policies and add secure RPC functions
-- ==============================================================

-- 1. Create secure RPC function for phone existence check (replaces public SELECT on members)
CREATE OR REPLACE FUNCTION public.check_phone_exists(phone_number TEXT, p_branch_id UUID DEFAULT NULL)
RETURNS TABLE (
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
  -- Validate phone format (Indian mobile: starts with 6-9, 10 digits)
  IF phone_number IS NULL OR phone_number = '' THEN
    RAISE EXCEPTION 'Phone number is required';
  END IF;
  
  IF NOT (phone_number ~ '^[6-9][0-9]{9}$') THEN
    RAISE EXCEPTION 'Invalid phone number format';
  END IF;

  -- Return member info and subscription status
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

  -- If no rows returned above, return a "not found" row
  IF NOT FOUND THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, NULL::TEXT, NULL::TEXT, NULL::TEXT, FALSE;
  END IF;
END;
$$;

-- Grant execute to anon and authenticated
GRANT EXECUTE ON FUNCTION public.check_phone_exists(TEXT, UUID) TO anon, authenticated;

-- 2. Create secure RPC function to get member subscription info (for renewal flow)
CREATE OR REPLACE FUNCTION public.get_member_subscription_info(p_member_id UUID)
RETURNS TABLE (
  subscription_id UUID,
  start_date DATE,
  end_date DATE,
  status TEXT
)
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

GRANT EXECUTE ON FUNCTION public.get_member_subscription_info(UUID) TO anon, authenticated;

-- 3. Drop overly permissive policies on members table
DROP POLICY IF EXISTS "Public can check if member exists by phone" ON members;
DROP POLICY IF EXISTS "Public can register as member" ON members;

-- 4. Drop overly permissive policy on member_details
DROP POLICY IF EXISTS "Public can view member details" ON member_details;

-- 5. Update has_role function to validate NULL inputs
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Validate inputs - return false for NULL
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

-- 6. Fix check_staff_phone_branch_uniqueness function - add search_path
CREATE OR REPLACE FUNCTION public.check_staff_phone_branch_uniqueness()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  -- Check if any other staff with the same phone is already assigned to the same branch
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