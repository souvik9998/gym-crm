
-- Add logo_url column to branches table
ALTER TABLE public.branches ADD COLUMN IF NOT EXISTS logo_url text;

-- Create storage bucket for branch logos
INSERT INTO storage.buckets (id, name, public) VALUES ('branch-logos', 'branch-logos', true)
ON CONFLICT (id) DO NOTHING;

-- Allow anyone to view branch logos (public bucket)
CREATE POLICY "Branch logos are publicly accessible"
ON storage.objects FOR SELECT
USING (bucket_id = 'branch-logos');

-- Allow authenticated users to upload branch logos
CREATE POLICY "Authenticated users can upload branch logos"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'branch-logos' AND auth.role() = 'authenticated');

-- Allow authenticated users to update branch logos
CREATE POLICY "Authenticated users can update branch logos"
ON storage.objects FOR UPDATE
USING (bucket_id = 'branch-logos' AND auth.role() = 'authenticated');

-- Allow authenticated users to delete branch logos
CREATE POLICY "Authenticated users can delete branch logos"
ON storage.objects FOR DELETE
USING (bucket_id = 'branch-logos' AND auth.role() = 'authenticated');
