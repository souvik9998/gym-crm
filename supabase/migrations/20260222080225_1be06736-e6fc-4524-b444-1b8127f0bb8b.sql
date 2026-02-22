
-- Create invoices storage bucket for PDF invoices
INSERT INTO storage.buckets (id, name, public) VALUES ('invoices', 'invoices', true);

-- Allow anyone to read invoices (they have unique file names)
CREATE POLICY "Public read access for invoices"
ON storage.objects FOR SELECT
USING (bucket_id = 'invoices');

-- Allow service role to insert invoices
CREATE POLICY "Service role can upload invoices"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'invoices' AND auth.role() = 'service_role');

-- Allow service role to delete invoices
CREATE POLICY "Service role can delete invoices"
ON storage.objects FOR DELETE
USING (bucket_id = 'invoices' AND auth.role() = 'service_role');
