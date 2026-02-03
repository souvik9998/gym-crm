-- Consolidate role hierarchy: super_admin (SaaS owner) > admin (gym owner)
-- Remove tenant_admin redundancy by converting all tenant_admin to admin

-- Step 1: Update existing tenant_admin roles to admin
UPDATE public.user_roles 
SET role = 'admin' 
WHERE role = 'tenant_admin';

-- Step 2: Update tenant_members table - change tenant_admin role references to admin
UPDATE public.tenant_members 
SET role = 'admin' 
WHERE role = 'tenant_admin';

-- Step 3: Update the is_tenant_admin function to check for admin role instead
-- (Now admin = gym owner, which is what tenant_admin was)
CREATE OR REPLACE FUNCTION public.is_tenant_admin(_user_id uuid, _tenant_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.tenant_members
        WHERE user_id = _user_id 
          AND tenant_id = _tenant_id 
          AND (role = 'admin' OR is_owner = true)
    )
$$;

-- Step 4: Create a simpler function to check if user is a gym owner (admin of a tenant)
CREATE OR REPLACE FUNCTION public.is_gym_owner(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.tenant_members
        WHERE user_id = _user_id 
          AND (role = 'admin' OR is_owner = true)
    )
$$;

-- Step 5: Get user's tenant_id (for gym owners)
CREATE OR REPLACE FUNCTION public.get_user_tenant_id(_user_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT tenant_id FROM public.tenant_members
    WHERE user_id = _user_id
    LIMIT 1
$$;

-- Step 6: Update user_belongs_to_tenant to work with admin role
CREATE OR REPLACE FUNCTION public.user_belongs_to_tenant(_user_id uuid, _tenant_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.tenant_members
        WHERE user_id = _user_id 
          AND tenant_id = _tenant_id
    )
$$;

-- Step 7: Ensure branches are properly isolated by tenant
-- Update RLS policy for branches to include tenant isolation
DROP POLICY IF EXISTS "Admins can manage branches" ON public.branches;
DROP POLICY IF EXISTS "Gym owners can manage their branches" ON public.branches;
DROP POLICY IF EXISTS "Super admins can manage all branches" ON public.branches;

-- Super admins can see all branches
CREATE POLICY "Super admins can manage all branches"
ON public.branches FOR ALL
TO authenticated
USING (public.is_super_admin(auth.uid()))
WITH CHECK (public.is_super_admin(auth.uid()));

-- Gym owners (admin role) can only see branches belonging to their tenant
CREATE POLICY "Gym owners can manage their branches"
ON public.branches FOR ALL
TO authenticated
USING (
    tenant_id IN (
        SELECT tenant_id FROM public.tenant_members 
        WHERE user_id = auth.uid()
    )
)
WITH CHECK (
    tenant_id IN (
        SELECT tenant_id FROM public.tenant_members 
        WHERE user_id = auth.uid()
    )
);

-- Step 8: Ensure members are isolated by tenant through branch
DROP POLICY IF EXISTS "Admins can manage members" ON public.members;
DROP POLICY IF EXISTS "Gym owners can manage their members" ON public.members;
DROP POLICY IF EXISTS "Super admins can manage all members" ON public.members;

-- Super admins can see all members
CREATE POLICY "Super admins can manage all members"
ON public.members FOR ALL
TO authenticated
USING (public.is_super_admin(auth.uid()));

-- Gym owners can only see members in branches belonging to their tenant
CREATE POLICY "Gym owners can manage their members"
ON public.members FOR ALL
TO authenticated
USING (
    branch_id IN (
        SELECT b.id FROM public.branches b
        INNER JOIN public.tenant_members tm ON b.tenant_id = tm.tenant_id
        WHERE tm.user_id = auth.uid()
    )
)
WITH CHECK (
    branch_id IN (
        SELECT b.id FROM public.branches b
        INNER JOIN public.tenant_members tm ON b.tenant_id = tm.tenant_id
        WHERE tm.user_id = auth.uid()
    )
);

-- Step 9: Update subscriptions to be tenant-isolated
DROP POLICY IF EXISTS "Gym owners can manage subscriptions" ON public.subscriptions;
DROP POLICY IF EXISTS "Super admins can manage all subscriptions" ON public.subscriptions;

CREATE POLICY "Super admins can manage all subscriptions"
ON public.subscriptions FOR ALL
TO authenticated
USING (public.is_super_admin(auth.uid()));

CREATE POLICY "Gym owners can manage subscriptions"
ON public.subscriptions FOR ALL
TO authenticated
USING (
    branch_id IN (
        SELECT b.id FROM public.branches b
        INNER JOIN public.tenant_members tm ON b.tenant_id = tm.tenant_id
        WHERE tm.user_id = auth.uid()
    )
)
WITH CHECK (
    branch_id IN (
        SELECT b.id FROM public.branches b
        INNER JOIN public.tenant_members tm ON b.tenant_id = tm.tenant_id
        WHERE tm.user_id = auth.uid()
    )
);

-- Step 10: Update payments to be tenant-isolated
DROP POLICY IF EXISTS "Gym owners can manage payments" ON public.payments;
DROP POLICY IF EXISTS "Super admins can manage all payments" ON public.payments;

CREATE POLICY "Super admins can manage all payments"
ON public.payments FOR ALL
TO authenticated
USING (public.is_super_admin(auth.uid()));

CREATE POLICY "Gym owners can manage payments"
ON public.payments FOR ALL
TO authenticated
USING (
    branch_id IN (
        SELECT b.id FROM public.branches b
        INNER JOIN public.tenant_members tm ON b.tenant_id = tm.tenant_id
        WHERE tm.user_id = auth.uid()
    )
)
WITH CHECK (
    branch_id IN (
        SELECT b.id FROM public.branches b
        INNER JOIN public.tenant_members tm ON b.tenant_id = tm.tenant_id
        WHERE tm.user_id = auth.uid()
    )
);