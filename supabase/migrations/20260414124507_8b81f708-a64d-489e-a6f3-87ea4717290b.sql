
-- Add registration field settings to gym_settings
ALTER TABLE public.gym_settings
ADD COLUMN IF NOT EXISTS registration_field_settings jsonb NOT NULL DEFAULT '{
  "name": {"enabled": true, "required": true, "locked": true},
  "phone": {"enabled": true, "required": true, "locked": true},
  "gender": {"enabled": true, "required": true, "locked": true},
  "date_of_birth": {"enabled": true, "required": true, "locked": true},
  "address": {"enabled": true, "required": false, "locked": false},
  "photo_id": {"enabled": true, "required": false, "locked": false},
  "identity_proof_upload": {"enabled": false, "required": false, "locked": false},
  "health_details": {"enabled": false, "required": false, "locked": false},
  "medical_records_upload": {"enabled": false, "required": false, "locked": false}
}'::jsonb;

-- Add health columns to member_details
ALTER TABLE public.member_details
ADD COLUMN IF NOT EXISTS blood_group text,
ADD COLUMN IF NOT EXISTS height_cm numeric,
ADD COLUMN IF NOT EXISTS weight_kg numeric,
ADD COLUMN IF NOT EXISTS medical_conditions text,
ADD COLUMN IF NOT EXISTS allergies text,
ADD COLUMN IF NOT EXISTS emergency_contact_name text,
ADD COLUMN IF NOT EXISTS emergency_contact_phone text;

-- Create member_documents table
CREATE TABLE IF NOT EXISTS public.member_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id uuid NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  document_type text NOT NULL,
  file_url text NOT NULL,
  file_name text NOT NULL,
  file_size bigint,
  uploaded_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.member_documents ENABLE ROW LEVEL SECURITY;

-- RLS for member_documents
CREATE POLICY "tenant_members_manage_member_documents"
ON public.member_documents FOR ALL
TO authenticated
USING (EXISTS (
  SELECT 1 FROM members m JOIN branches b ON b.id = m.branch_id
  WHERE m.id = member_documents.member_id AND b.tenant_id IS NOT NULL AND user_belongs_to_tenant(auth.uid(), b.tenant_id)
))
WITH CHECK (EXISTS (
  SELECT 1 FROM members m JOIN branches b ON b.id = m.branch_id
  WHERE m.id = member_documents.member_id AND b.tenant_id IS NOT NULL AND user_belongs_to_tenant(auth.uid(), b.tenant_id)
));

CREATE POLICY "super_admin_full_access_member_documents"
ON public.member_documents FOR ALL
TO authenticated
USING (is_super_admin(auth.uid()))
WITH CHECK (is_super_admin(auth.uid()));

CREATE POLICY "staff_manage_member_documents_with_permission"
ON public.member_documents FOR ALL
TO authenticated
USING (EXISTS (
  SELECT 1 FROM staff s
  JOIN staff_permissions sp ON s.id = sp.staff_id
  JOIN staff_branch_assignments sba ON s.id = sba.staff_id
  JOIN members m ON m.branch_id = sba.branch_id
  WHERE s.auth_user_id = auth.uid() AND s.is_active = true AND sp.can_manage_members = true AND m.id = member_documents.member_id
))
WITH CHECK (EXISTS (
  SELECT 1 FROM staff s
  JOIN staff_permissions sp ON s.id = sp.staff_id
  JOIN staff_branch_assignments sba ON s.id = sba.staff_id
  JOIN members m ON m.branch_id = sba.branch_id
  WHERE s.auth_user_id = auth.uid() AND s.is_active = true AND sp.can_manage_members = true AND m.id = member_documents.member_id
));

-- Service role access for edge functions (public registration)
CREATE POLICY "service_role_full_access_member_documents"
ON public.member_documents FOR ALL
TO public
USING (auth.role() = 'service_role'::text)
WITH CHECK (auth.role() = 'service_role'::text);

-- Create storage bucket for member documents
INSERT INTO storage.buckets (id, name, public) VALUES ('member-documents', 'member-documents', false)
ON CONFLICT (id) DO NOTHING;

-- Storage policies
CREATE POLICY "Authenticated users can upload member documents"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'member-documents');

CREATE POLICY "Authenticated users can view member documents"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'member-documents');

CREATE POLICY "Service role full access member documents storage"
ON storage.objects FOR ALL
TO public
USING (bucket_id = 'member-documents' AND auth.role() = 'service_role'::text)
WITH CHECK (bucket_id = 'member-documents' AND auth.role() = 'service_role'::text);

CREATE POLICY "Anon can upload member documents"
ON storage.objects FOR INSERT
TO anon
WITH CHECK (bucket_id = 'member-documents');

-- Trigger for updated_at
CREATE TRIGGER update_member_documents_updated_at
BEFORE UPDATE ON public.member_documents
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
