ALTER TABLE public.proxmox_interfaces REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.proxmox_interfaces;