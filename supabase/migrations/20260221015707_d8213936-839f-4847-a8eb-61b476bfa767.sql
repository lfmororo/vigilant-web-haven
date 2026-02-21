
-- Add unique constraint on system_settings.key if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'system_settings_key_unique'
  ) THEN
    ALTER TABLE public.system_settings ADD CONSTRAINT system_settings_key_unique UNIQUE (key);
  END IF;
END $$;

-- Insert WhatsApp configuration keys
INSERT INTO public.system_settings (key, value, description) VALUES
  ('whatsapp_api_url', '', 'URL base da API WhatsApp (Whatsapi.my)'),
  ('whatsapp_api_token', '', 'Token da instância WhatsApp'),
  ('whatsapp_enabled', 'false', 'Ativar notificações via WhatsApp')
ON CONFLICT (key) DO NOTHING;
