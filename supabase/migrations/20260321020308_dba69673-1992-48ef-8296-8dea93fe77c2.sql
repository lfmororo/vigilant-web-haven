ALTER TABLE public.mikrotik_devices 
ADD COLUMN IF NOT EXISTS last_dhcp_summary jsonb DEFAULT NULL,
ADD COLUMN IF NOT EXISTS last_log_alerts jsonb DEFAULT NULL,
ADD COLUMN IF NOT EXISTS last_system_info jsonb DEFAULT NULL;