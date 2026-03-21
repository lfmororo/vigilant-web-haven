ALTER TABLE public.mikrotik_devices 
  ADD COLUMN IF NOT EXISTS proxy_url text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS api_port integer DEFAULT 8728;