INSERT INTO public.system_settings (key, value, description)
SELECT 'whatsapp_instance', 'default', 'Nome da instância da Evolution API usada para enviar/receber WhatsApp'
WHERE NOT EXISTS (SELECT 1 FROM public.system_settings WHERE key = 'whatsapp_instance');

UPDATE public.system_settings
SET description = 'URL base da Evolution API (ex.: https://evolution.seudominio.com.br)'
WHERE key = 'whatsapp_api_url';

UPDATE public.system_settings
SET description = 'API Key da Evolution API (header apikey)'
WHERE key = 'whatsapp_api_token';