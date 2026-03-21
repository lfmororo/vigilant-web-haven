
ALTER TABLE public.mikrotik_devices 
  ADD COLUMN device_type text NOT NULL DEFAULT 'mikrotik',
  ADD COLUMN snmp_community text DEFAULT 'public',
  ADD COLUMN snmp_version text DEFAULT '2c';
