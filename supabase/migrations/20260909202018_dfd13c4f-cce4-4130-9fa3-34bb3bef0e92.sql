INSERT INTO public.system_settings (key, value, description)
SELECT 'provisioning_agent_key', replace(gen_random_uuid()::text, '-', ''), 'Chave de acesso do agente de provisionamento (AD/pastas)'
WHERE NOT EXISTS (SELECT 1 FROM public.system_settings WHERE key = 'provisioning_agent_key');