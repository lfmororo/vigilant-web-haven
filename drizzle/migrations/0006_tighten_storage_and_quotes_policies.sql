DROP POLICY IF EXISTS "Authenticated users can view quote_items" ON public.quote_items;
CREATE POLICY "Staff can view quote_items" ON public.quote_items FOR SELECT TO authenticated
USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'technician'));
DROP POLICY IF EXISTS "Authenticated users can view quotes" ON public.quotes;
CREATE POLICY "Staff can view quotes" ON public.quotes FOR SELECT TO authenticated
USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'technician'));
DROP POLICY IF EXISTS "Authenticated read sophos telemetry" ON public.sophos_telemetry_logs;
CREATE POLICY "Staff read sophos telemetry" ON public.sophos_telemetry_logs FOR SELECT TO authenticated
USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'technician'));

DROP POLICY IF EXISTS "Authenticated users can upload ticket pdfs" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete ticket pdfs" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can manage ticket pdfs" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete ticket attachments" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload ticket attachments" ON storage.objects;
DROP POLICY IF EXISTS "Admins can upload email assets" ON storage.objects;

CREATE POLICY "Users upload own ticket pdfs" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'ticket-pdfs' AND owner = auth.uid());
CREATE POLICY "Owners or admins update ticket pdfs" ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'ticket-pdfs' AND (owner = auth.uid() OR public.has_role(auth.uid(),'admin')))
WITH CHECK (bucket_id = 'ticket-pdfs' AND (owner = auth.uid() OR public.has_role(auth.uid(),'admin')));
CREATE POLICY "Owners or admins delete ticket pdfs" ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'ticket-pdfs' AND (owner = auth.uid() OR public.has_role(auth.uid(),'admin')));
CREATE POLICY "Users upload own ticket attachments" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'ticket-attachments' AND owner = auth.uid());
CREATE POLICY "Owners or admins delete ticket attachments" ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'ticket-attachments' AND (owner = auth.uid() OR public.has_role(auth.uid(),'admin')));
CREATE POLICY "Admins upload email assets" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'email-assets' AND public.has_role(auth.uid(),'admin'));