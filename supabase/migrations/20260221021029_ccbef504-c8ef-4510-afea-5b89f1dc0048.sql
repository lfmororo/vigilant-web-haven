
-- Table for multiple IMAP email capture accounts
CREATE TABLE public.imap_accounts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  label TEXT NOT NULL DEFAULT '',
  host TEXT NOT NULL DEFAULT '',
  port TEXT NOT NULL DEFAULT '993',
  username TEXT NOT NULL DEFAULT '',
  password TEXT NOT NULL DEFAULT '',
  client_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  last_checked_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.imap_accounts ENABLE ROW LEVEL SECURITY;

-- Only admins can manage IMAP accounts
CREATE POLICY "Admins can manage imap accounts"
  ON public.imap_accounts
  FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Migrate existing IMAP settings if they exist
INSERT INTO public.imap_accounts (label, host, port, username, password)
SELECT
  'Conta Principal',
  MAX(CASE WHEN key = 'email_imap_host' THEN value END),
  COALESCE(MAX(CASE WHEN key = 'email_imap_port' THEN value END), '993'),
  MAX(CASE WHEN key = 'email_imap_user' THEN value END),
  MAX(CASE WHEN key = 'email_imap_password' THEN value END)
FROM public.system_settings
WHERE key IN ('email_imap_host', 'email_imap_port', 'email_imap_user', 'email_imap_password')
HAVING MAX(CASE WHEN key = 'email_imap_host' THEN value END) IS NOT NULL
   AND MAX(CASE WHEN key = 'email_imap_host' THEN value END) != '';
