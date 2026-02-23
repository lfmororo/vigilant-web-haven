
-- Create storage bucket for ticket attachments (email images)
INSERT INTO storage.buckets (id, name, public)
VALUES ('ticket-attachments', 'ticket-attachments', true)
ON CONFLICT (id) DO NOTHING;

-- Allow public read access
CREATE POLICY "Ticket attachments are publicly accessible"
ON storage.objects FOR SELECT
USING (bucket_id = 'ticket-attachments');

-- Allow service role / authenticated users to upload
CREATE POLICY "Authenticated users can upload ticket attachments"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'ticket-attachments');

-- Allow deletion by authenticated users
CREATE POLICY "Authenticated users can delete ticket attachments"
ON storage.objects FOR DELETE
USING (bucket_id = 'ticket-attachments');
