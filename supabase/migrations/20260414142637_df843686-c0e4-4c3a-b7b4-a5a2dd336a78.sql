
-- 1. Add new permission columns to staff_permissions
ALTER TABLE public.staff_permissions
  ADD COLUMN IF NOT EXISTS member_access_type text NOT NULL DEFAULT 'all',
  ADD COLUMN IF NOT EXISTS can_manage_time_slots boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_create_time_slots boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_edit_delete_time_slots boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_view_time_slots boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS can_assign_members_to_slots boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_view_slot_members boolean NOT NULL DEFAULT false;

-- 2. Create trainer_time_slots table
CREATE TABLE public.trainer_time_slots (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  trainer_id uuid NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  branch_id uuid NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  start_time time NOT NULL,
  end_time time NOT NULL,
  capacity integer NOT NULL DEFAULT 10,
  is_recurring boolean NOT NULL DEFAULT false,
  recurring_days integer[] DEFAULT NULL,
  status text NOT NULL DEFAULT 'available',
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.trainer_time_slots ENABLE ROW LEVEL SECURITY;

-- RLS for trainer_time_slots
CREATE POLICY "super_admin_full_access_trainer_time_slots"
  ON public.trainer_time_slots FOR ALL
  TO authenticated
  USING (is_super_admin(auth.uid()))
  WITH CHECK (is_super_admin(auth.uid()));

CREATE POLICY "tenant_members_manage_trainer_time_slots"
  ON public.trainer_time_slots FOR ALL
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM branches b
    WHERE b.id = trainer_time_slots.branch_id
      AND b.tenant_id IS NOT NULL
      AND user_belongs_to_tenant(auth.uid(), b.tenant_id)
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM branches b
    WHERE b.id = trainer_time_slots.branch_id
      AND b.tenant_id IS NOT NULL
      AND user_belongs_to_tenant(auth.uid(), b.tenant_id)
  ));

CREATE POLICY "staff_manage_trainer_time_slots"
  ON public.trainer_time_slots FOR ALL
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM staff s
    JOIN staff_permissions sp ON s.id = sp.staff_id
    JOIN staff_branch_assignments sba ON s.id = sba.staff_id
    WHERE s.auth_user_id = auth.uid()
      AND s.is_active = true
      AND sp.can_manage_time_slots = true
      AND sba.branch_id = trainer_time_slots.branch_id
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM staff s
    JOIN staff_permissions sp ON s.id = sp.staff_id
    JOIN staff_branch_assignments sba ON s.id = sba.staff_id
    WHERE s.auth_user_id = auth.uid()
      AND s.is_active = true
      AND sp.can_manage_time_slots = true
      AND sba.branch_id = trainer_time_slots.branch_id
  ));

CREATE POLICY "staff_view_trainer_time_slots"
  ON public.trainer_time_slots FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM staff s
    JOIN staff_permissions sp ON s.id = sp.staff_id
    JOIN staff_branch_assignments sba ON s.id = sba.staff_id
    WHERE s.auth_user_id = auth.uid()
      AND s.is_active = true
      AND sp.can_view_time_slots = true
      AND sba.branch_id = trainer_time_slots.branch_id
  ));

-- 3. Create time_slot_members table
CREATE TABLE public.time_slot_members (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  time_slot_id uuid NOT NULL REFERENCES public.trainer_time_slots(id) ON DELETE CASCADE,
  member_id uuid NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  branch_id uuid NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  assigned_by text DEFAULT 'Admin',
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(time_slot_id, member_id)
);

ALTER TABLE public.time_slot_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "super_admin_full_access_time_slot_members"
  ON public.time_slot_members FOR ALL
  TO authenticated
  USING (is_super_admin(auth.uid()))
  WITH CHECK (is_super_admin(auth.uid()));

CREATE POLICY "tenant_members_manage_time_slot_members"
  ON public.time_slot_members FOR ALL
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM branches b
    WHERE b.id = time_slot_members.branch_id
      AND b.tenant_id IS NOT NULL
      AND user_belongs_to_tenant(auth.uid(), b.tenant_id)
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM branches b
    WHERE b.id = time_slot_members.branch_id
      AND b.tenant_id IS NOT NULL
      AND user_belongs_to_tenant(auth.uid(), b.tenant_id)
  ));

CREATE POLICY "staff_manage_time_slot_members"
  ON public.time_slot_members FOR ALL
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM staff s
    JOIN staff_permissions sp ON s.id = sp.staff_id
    JOIN staff_branch_assignments sba ON s.id = sba.staff_id
    WHERE s.auth_user_id = auth.uid()
      AND s.is_active = true
      AND sp.can_assign_members_to_slots = true
      AND sba.branch_id = time_slot_members.branch_id
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM staff s
    JOIN staff_permissions sp ON s.id = sp.staff_id
    JOIN staff_branch_assignments sba ON s.id = sba.staff_id
    WHERE s.auth_user_id = auth.uid()
      AND s.is_active = true
      AND sp.can_assign_members_to_slots = true
      AND sba.branch_id = time_slot_members.branch_id
  ));

CREATE POLICY "staff_view_time_slot_members"
  ON public.time_slot_members FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM staff s
    JOIN staff_permissions sp ON s.id = sp.staff_id
    JOIN staff_branch_assignments sba ON s.id = sba.staff_id
    WHERE s.auth_user_id = auth.uid()
      AND s.is_active = true
      AND sp.can_view_slot_members = true
      AND sba.branch_id = time_slot_members.branch_id
  ));

-- 4. Add indexes
CREATE INDEX idx_trainer_time_slots_trainer ON public.trainer_time_slots(trainer_id);
CREATE INDEX idx_trainer_time_slots_branch ON public.trainer_time_slots(branch_id);
CREATE INDEX idx_time_slot_members_slot ON public.time_slot_members(time_slot_id);
CREATE INDEX idx_time_slot_members_member ON public.time_slot_members(member_id);
CREATE INDEX idx_time_slot_members_branch ON public.time_slot_members(branch_id);

-- 5. Add updated_at trigger for trainer_time_slots
CREATE TRIGGER update_trainer_time_slots_updated_at
  BEFORE UPDATE ON public.trainer_time_slots
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
