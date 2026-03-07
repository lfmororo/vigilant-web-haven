INSERT INTO public.system_settings (key, value, description)
VALUES ('admin_contact_phone', '', 'Telefone do administrador exibido nas notificações WhatsApp')
ON CONFLICT (key) DO NOTHING;