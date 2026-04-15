-- Create storage bucket for event assets (banners)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('event-assets', 'event-assets', true, 5242880, ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
ON CONFLICT (id) DO NOTHING;

-- Allow anyone to view event assets (public bucket)
CREATE POLICY "Event assets are publicly accessible"
ON storage.objects FOR SELECT
USING (bucket_id = 'event-assets');

-- Allow authenticated users to upload event assets
CREATE POLICY "Authenticated users can upload event assets"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'event-assets' AND auth.role() = 'authenticated');

-- Allow authenticated users to delete event assets
CREATE POLICY "Authenticated users can delete event assets"
ON storage.objects FOR DELETE
USING (bucket_id = 'event-assets' AND auth.role() = 'authenticated');