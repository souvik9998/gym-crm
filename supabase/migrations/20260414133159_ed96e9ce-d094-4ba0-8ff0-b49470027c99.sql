
-- Create member_assessments table
CREATE TABLE public.member_assessments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  member_id UUID NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  branch_id UUID NOT NULL REFERENCES public.branches(id),
  assessed_by TEXT NOT NULL DEFAULT 'Admin',
  assessment_date DATE NOT NULL DEFAULT CURRENT_DATE,
  current_condition TEXT,
  injuries_health_issues TEXT,
  mobility_limitations TEXT,
  allowed_exercises TEXT,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.member_assessments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "super_admin_full_access_member_assessments" ON public.member_assessments FOR ALL TO authenticated USING (is_super_admin(auth.uid())) WITH CHECK (is_super_admin(auth.uid()));

CREATE POLICY "tenant_members_manage_member_assessments" ON public.member_assessments FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM branches b WHERE b.id = member_assessments.branch_id AND b.tenant_id IS NOT NULL AND user_belongs_to_tenant(auth.uid(), b.tenant_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM branches b WHERE b.id = member_assessments.branch_id AND b.tenant_id IS NOT NULL AND user_belongs_to_tenant(auth.uid(), b.tenant_id)));

CREATE POLICY "staff_manage_member_assessments" ON public.member_assessments FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM staff s JOIN staff_permissions sp ON s.id = sp.staff_id JOIN staff_branch_assignments sba ON s.id = sba.staff_id WHERE s.auth_user_id = auth.uid() AND s.is_active = true AND sp.can_manage_members = true AND sba.branch_id = member_assessments.branch_id))
  WITH CHECK (EXISTS (SELECT 1 FROM staff s JOIN staff_permissions sp ON s.id = sp.staff_id JOIN staff_branch_assignments sba ON s.id = sba.staff_id WHERE s.auth_user_id = auth.uid() AND s.is_active = true AND sp.can_manage_members = true AND sba.branch_id = member_assessments.branch_id));

CREATE POLICY "service_role_full_access_member_assessments" ON public.member_assessments FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

-- Create member_exercise_plans table
CREATE TABLE public.member_exercise_plans (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  member_id UUID NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  branch_id UUID NOT NULL REFERENCES public.branches(id),
  plan_name TEXT NOT NULL,
  goal TEXT NOT NULL DEFAULT 'General Fitness',
  workout_split TEXT NOT NULL DEFAULT 'Full Body',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by TEXT NOT NULL DEFAULT 'Admin',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.member_exercise_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "super_admin_full_access_member_exercise_plans" ON public.member_exercise_plans FOR ALL TO authenticated USING (is_super_admin(auth.uid())) WITH CHECK (is_super_admin(auth.uid()));

CREATE POLICY "tenant_members_manage_member_exercise_plans" ON public.member_exercise_plans FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM branches b WHERE b.id = member_exercise_plans.branch_id AND b.tenant_id IS NOT NULL AND user_belongs_to_tenant(auth.uid(), b.tenant_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM branches b WHERE b.id = member_exercise_plans.branch_id AND b.tenant_id IS NOT NULL AND user_belongs_to_tenant(auth.uid(), b.tenant_id)));

CREATE POLICY "staff_manage_member_exercise_plans" ON public.member_exercise_plans FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM staff s JOIN staff_permissions sp ON s.id = sp.staff_id JOIN staff_branch_assignments sba ON s.id = sba.staff_id WHERE s.auth_user_id = auth.uid() AND s.is_active = true AND sp.can_manage_members = true AND sba.branch_id = member_exercise_plans.branch_id))
  WITH CHECK (EXISTS (SELECT 1 FROM staff s JOIN staff_permissions sp ON s.id = sp.staff_id JOIN staff_branch_assignments sba ON s.id = sba.staff_id WHERE s.auth_user_id = auth.uid() AND s.is_active = true AND sp.can_manage_members = true AND sba.branch_id = member_exercise_plans.branch_id));

CREATE POLICY "service_role_full_access_member_exercise_plans" ON public.member_exercise_plans FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

-- Create member_exercise_items table
CREATE TABLE public.member_exercise_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  plan_id UUID NOT NULL REFERENCES public.member_exercise_plans(id) ON DELETE CASCADE,
  exercise_name TEXT NOT NULL,
  sets INTEGER NOT NULL DEFAULT 3,
  reps TEXT NOT NULL DEFAULT '10',
  notes TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.member_exercise_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "super_admin_full_access_member_exercise_items" ON public.member_exercise_items FOR ALL TO authenticated USING (is_super_admin(auth.uid())) WITH CHECK (is_super_admin(auth.uid()));

CREATE POLICY "tenant_members_manage_member_exercise_items" ON public.member_exercise_items FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM member_exercise_plans p JOIN branches b ON b.id = p.branch_id WHERE p.id = member_exercise_items.plan_id AND b.tenant_id IS NOT NULL AND user_belongs_to_tenant(auth.uid(), b.tenant_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM member_exercise_plans p JOIN branches b ON b.id = p.branch_id WHERE p.id = member_exercise_items.plan_id AND b.tenant_id IS NOT NULL AND user_belongs_to_tenant(auth.uid(), b.tenant_id)));

CREATE POLICY "staff_manage_member_exercise_items" ON public.member_exercise_items FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM member_exercise_plans p JOIN staff s ON true JOIN staff_permissions sp ON s.id = sp.staff_id JOIN staff_branch_assignments sba ON s.id = sba.staff_id WHERE p.id = member_exercise_items.plan_id AND s.auth_user_id = auth.uid() AND s.is_active = true AND sp.can_manage_members = true AND sba.branch_id = p.branch_id))
  WITH CHECK (EXISTS (SELECT 1 FROM member_exercise_plans p JOIN staff s ON true JOIN staff_permissions sp ON s.id = sp.staff_id JOIN staff_branch_assignments sba ON s.id = sba.staff_id WHERE p.id = member_exercise_items.plan_id AND s.auth_user_id = auth.uid() AND s.is_active = true AND sp.can_manage_members = true AND sba.branch_id = p.branch_id));

CREATE POLICY "service_role_full_access_member_exercise_items" ON public.member_exercise_items FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

-- Add storage policy for member-documents bucket to allow authenticated uploads
CREATE POLICY "authenticated_upload_member_documents" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'member-documents');
CREATE POLICY "authenticated_read_member_documents" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'member-documents');
CREATE POLICY "anon_upload_member_documents" ON storage.objects FOR INSERT TO anon WITH CHECK (bucket_id = 'member-documents');
CREATE POLICY "anon_read_member_documents" ON storage.objects FOR SELECT TO anon USING (bucket_id = 'member-documents');
