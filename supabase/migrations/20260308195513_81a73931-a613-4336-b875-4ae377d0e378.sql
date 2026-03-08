
-- Create gym_holidays table
CREATE TABLE public.gym_holidays (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    branch_id uuid NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
    holiday_name text NOT NULL,
    holiday_date date NOT NULL,
    description text,
    holiday_type text NOT NULL DEFAULT 'full_day',
    half_day_start_time time,
    half_day_end_time time,
    notify_members boolean NOT NULL DEFAULT false,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now(),
    created_by uuid,
    UNIQUE(branch_id, holiday_date)
);

-- Create index for performance
CREATE INDEX idx_gym_holidays_branch_date ON public.gym_holidays(branch_id, holiday_date);

-- Enable RLS
ALTER TABLE public.gym_holidays ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "tenant_members_manage_gym_holidays"
ON public.gym_holidays FOR ALL
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.branches b
        WHERE b.id = gym_holidays.branch_id
        AND b.tenant_id IS NOT NULL
        AND user_belongs_to_tenant(auth.uid(), b.tenant_id)
    )
)
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.branches b
        WHERE b.id = gym_holidays.branch_id
        AND b.tenant_id IS NOT NULL
        AND user_belongs_to_tenant(auth.uid(), b.tenant_id)
    )
);

CREATE POLICY "super_admin_full_access_gym_holidays"
ON public.gym_holidays FOR ALL
TO authenticated
USING (is_super_admin(auth.uid()))
WITH CHECK (is_super_admin(auth.uid()));

CREATE POLICY "staff_manage_gym_holidays_with_permission"
ON public.gym_holidays FOR ALL
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM staff s
        JOIN staff_permissions sp ON s.id = sp.staff_id
        JOIN staff_branch_assignments sba ON s.id = sba.staff_id
        WHERE s.auth_user_id = auth.uid()
        AND s.is_active = true
        AND sp.can_change_settings = true
        AND sba.branch_id = gym_holidays.branch_id
    )
)
WITH CHECK (
    EXISTS (
        SELECT 1 FROM staff s
        JOIN staff_permissions sp ON s.id = sp.staff_id
        JOIN staff_branch_assignments sba ON s.id = sba.staff_id
        WHERE s.auth_user_id = auth.uid()
        AND s.is_active = true
        AND sp.can_change_settings = true
        AND sba.branch_id = gym_holidays.branch_id
    )
);
