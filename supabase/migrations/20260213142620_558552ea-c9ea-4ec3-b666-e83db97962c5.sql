
-- Create system_settings table
CREATE TABLE public.system_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text UNIQUE NOT NULL,
  value text,
  description text,
  updated_at timestamptz DEFAULT now(),
  updated_by uuid
);

-- Enable RLS
ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;

-- Only admins can read
CREATE POLICY "Admins can view system settings"
ON public.system_settings
FOR SELECT
USING (public.has_role(auth.uid(), 'admin'));

-- Only admins can insert
CREATE POLICY "Admins can insert system settings"
ON public.system_settings
FOR INSERT
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Only admins can update
CREATE POLICY "Admins can update system settings"
ON public.system_settings
FOR UPDATE
USING (public.has_role(auth.uid(), 'admin'));

-- Only admins can delete
CREATE POLICY "Admins can delete system settings"
ON public.system_settings
FOR DELETE
USING (public.has_role(auth.uid(), 'admin'));

-- Insert initial settings
INSERT INTO public.system_settings (key, description) VALUES
  ('email_imap_host', 'Servidor IMAP para captura de emails'),
  ('email_imap_port', 'Porta do servidor IMAP'),
  ('email_imap_user', 'Email para captura de tickets'),
  ('email_imap_password', 'Senha do email de captura'),
  ('smtp_host', 'Servidor SMTP para envio de notificações'),
  ('smtp_port', 'Porta do servidor SMTP'),
  ('smtp_user', 'Email de envio de notificações'),
  ('smtp_password', 'Senha do email SMTP'),
  ('smtp_from_name', 'Nome do remetente das notificações'),
  ('notification_enabled', 'Ativar/desativar notificações por email');
