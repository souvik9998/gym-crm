-- 1. Remove 'admin' from staff_role enum (need to recreate the enum)
-- First, update any existing staff with 'admin' role to 'manager'
UPDATE public.staff SET role = 'manager' WHERE role = 'admin';

-- Recreate the enum without 'admin'
-- Create new enum type
CREATE TYPE public.staff_role_new AS ENUM ('manager', 'trainer', 'reception', 'accountant');

-- Update the column to use the new type
ALTER TABLE public.staff 
  ALTER COLUMN role TYPE public.staff_role_new 
  USING role::text::public.staff_role_new;

-- Drop the old type and rename the new one
DROP TYPE public.staff_role;
ALTER TYPE public.staff_role_new RENAME TO staff_role;

-- 2. Create a function to check staff permissions (security definer to avoid RLS recursion)
CREATE OR REPLACE FUNCTION public.staff_has_permission(
  _staff_id uuid,
  _permission text
)
RETURNS boolean
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

-- 3. Create a function to get staff_id from session token
CREATE OR REPLACE FUNCTION public.get_staff_id_from_session()
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_token text;
  v_staff_id uuid;
BEGIN
  -- Get token from app setting (set by edge function)
  v_token := current_setting('app.staff_session_token', true);
  
  IF v_token IS NULL OR v_token = '' THEN
    RETURN NULL;
  END IF;
  
  -- Look up staff from session
  SELECT staff_id INTO v_staff_id
  FROM public.staff_sessions
  WHERE session_token = v_token
    AND is_revoked = false
    AND expires_at > now();
    
  RETURN v_staff_id;
END;
$$;

-- 4. Add RLS policies for staff to perform actions based on their permissions

-- Members table - allow staff with manage_members permission
CREATE POLICY "Staff can insert members with permission"
ON public.members
FOR INSERT
TO public
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.staff_permissions sp
    JOIN public.staff_branch_assignments sba ON sp.staff_id = sba.staff_id
    WHERE sp.can_manage_members = true
      AND sba.branch_id = branch_id
  )
);

CREATE POLICY "Staff can update members with permission"
ON public.members
FOR UPDATE
TO public
USING (
  EXISTS (
    SELECT 1 FROM public.staff_permissions sp
    JOIN public.staff_branch_assignments sba ON sp.staff_id = sba.staff_id
    WHERE sp.can_manage_members = true
      AND sba.branch_id = members.branch_id
  )
);

-- Member details - allow staff with manage_members permission  
CREATE POLICY "Staff can update member details with permission"
ON public.member_details
FOR UPDATE
TO public
USING (
  EXISTS (
    SELECT 1 FROM public.members m
    JOIN public.staff_permissions sp ON true
    JOIN public.staff_branch_assignments sba ON sp.staff_id = sba.staff_id
    WHERE m.id = member_details.member_id
      AND sp.can_manage_members = true
      AND sba.branch_id = m.branch_id
  )
);

-- Subscriptions - allow staff with manage_members permission
CREATE POLICY "Staff can update subscriptions with permission"
ON public.subscriptions
FOR UPDATE
TO public
USING (
  EXISTS (
    SELECT 1 FROM public.staff_permissions sp
    JOIN public.staff_branch_assignments sba ON sp.staff_id = sba.staff_id
    WHERE sp.can_manage_members = true
      AND sba.branch_id = subscriptions.branch_id
  )
);

-- Payments - allow staff with access_payments permission to insert
CREATE POLICY "Staff can insert payments with permission"
ON public.payments
FOR INSERT
TO public
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.staff_permissions sp
    JOIN public.staff_branch_assignments sba ON sp.staff_id = sba.staff_id
    WHERE sp.can_access_payments = true
      AND sba.branch_id = branch_id
  )
);

-- Ledger entries - allow staff with access_ledger permission
CREATE POLICY "Staff can insert ledger entries with permission"
ON public.ledger_entries
FOR INSERT
TO public
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.staff_permissions sp
    JOIN public.staff_branch_assignments sba ON sp.staff_id = sba.staff_id
    WHERE sp.can_access_ledger = true
      AND sba.branch_id = branch_id
  )
);

CREATE POLICY "Staff can update ledger entries with permission"
ON public.ledger_entries
FOR UPDATE
TO public
USING (
  EXISTS (
    SELECT 1 FROM public.staff_permissions sp
    JOIN public.staff_branch_assignments sba ON sp.staff_id = sba.staff_id
    WHERE sp.can_access_ledger = true
      AND sba.branch_id = ledger_entries.branch_id
  )
);

CREATE POLICY "Staff can delete ledger entries with permission"
ON public.ledger_entries
FOR DELETE
TO public
USING (
  EXISTS (
    SELECT 1 FROM public.staff_permissions sp
    JOIN public.staff_branch_assignments sba ON sp.staff_id = sba.staff_id
    WHERE sp.can_access_ledger = true
      AND sba.branch_id = ledger_entries.branch_id
  )
);

-- Gym settings - allow staff with change_settings permission
CREATE POLICY "Staff can update gym settings with permission"
ON public.gym_settings
FOR UPDATE
TO public
USING (
  EXISTS (
    SELECT 1 FROM public.staff_permissions sp
    JOIN public.staff_branch_assignments sba ON sp.staff_id = sba.staff_id
    WHERE sp.can_change_settings = true
      AND sba.branch_id = gym_settings.branch_id
  )
);

-- Monthly packages - allow staff with change_settings permission
CREATE POLICY "Staff can manage monthly packages with permission"
ON public.monthly_packages
FOR ALL
TO public
USING (
  EXISTS (
    SELECT 1 FROM public.staff_permissions sp
    JOIN public.staff_branch_assignments sba ON sp.staff_id = sba.staff_id
    WHERE sp.can_change_settings = true
      AND sba.branch_id = monthly_packages.branch_id
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.staff_permissions sp
    JOIN public.staff_branch_assignments sba ON sp.staff_id = sba.staff_id
    WHERE sp.can_change_settings = true
      AND sba.branch_id = branch_id
  )
);

-- Custom packages - allow staff with change_settings permission
CREATE POLICY "Staff can manage custom packages with permission"
ON public.custom_packages
FOR ALL
TO public
USING (
  EXISTS (
    SELECT 1 FROM public.staff_permissions sp
    JOIN public.staff_branch_assignments sba ON sp.staff_id = sba.staff_id
    WHERE sp.can_change_settings = true
      AND sba.branch_id = custom_packages.branch_id
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.staff_permissions sp
    JOIN public.staff_branch_assignments sba ON sp.staff_id = sba.staff_id
    WHERE sp.can_change_settings = true
      AND sba.branch_id = branch_id
  )
);

-- PT Subscriptions - allow staff with manage_members permission
CREATE POLICY "Staff can update PT subscriptions with permission"
ON public.pt_subscriptions
FOR UPDATE
TO public
USING (
  EXISTS (
    SELECT 1 FROM public.staff_permissions sp
    JOIN public.staff_branch_assignments sba ON sp.staff_id = sba.staff_id
    WHERE sp.can_manage_members = true
      AND sba.branch_id = pt_subscriptions.branch_id
  )
);