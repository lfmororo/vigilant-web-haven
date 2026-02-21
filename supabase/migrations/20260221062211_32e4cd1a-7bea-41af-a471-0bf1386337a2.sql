
-- Create bucket for ticket PDFs
INSERT INTO storage.buckets (id, name, public) VALUES ('ticket-pdfs', 'ticket-pdfs', true);

-- Allow authenticated users to upload
CREATE POLICY "Authenticated users can upload ticket pdfs"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'ticket-pdfs' AND auth.uid() IS NOT NULL);

-- Public read access
CREATE POLICY "Public read access for ticket pdfs"
ON storage.objects FOR SELECT
USING (bucket_id = 'ticket-pdfs');

-- Allow authenticated users to update/delete their uploads
CREATE POLICY "Authenticated users can manage ticket pdfs"
ON storage.objects FOR UPDATE
USING (bucket_id = 'ticket-pdfs' AND auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can delete ticket pdfs"
ON storage.objects FOR DELETE
USING (bucket_id = 'ticket-pdfs' AND auth.uid() IS NOT NULL);
