
-- Create quote_sender_profiles table
CREATE TABLE public.quote_sender_profiles (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  logo_url text,
  trade_name text NOT NULL,
  cnpj text,
  address text,
  email text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.quote_sender_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage quote sender profiles"
  ON public.quote_sender_profiles FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Storage bucket for company logos
INSERT INTO storage.buckets (id, name, public)
VALUES ('company-logos', 'company-logos', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Admins can upload company logos"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'company-logos' AND has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update company logos"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'company-logos' AND has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete company logos"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'company-logos' AND has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Anyone can view company logos"
  ON storage.objects FOR SELECT
  TO public
  USING (bucket_id = 'company-logos');
