CREATE INDEX IF NOT EXISTS idx_mikrotik_traffic_history_device_id ON public.mikrotik_traffic_history(device_id);
CREATE INDEX IF NOT EXISTS idx_mikrotik_system_history_device_id ON public.mikrotik_system_history(device_id);
CREATE INDEX IF NOT EXISTS idx_mikrotik_dhcp_history_device_id ON public.mikrotik_dhcp_history(device_id);
CREATE INDEX IF NOT EXISTS idx_mikrotik_interfaces_device_id ON public.mikrotik_interfaces(device_id);
CREATE INDEX IF NOT EXISTS idx_mikrotik_interface_events_device_id ON public.mikrotik_interface_events(device_id);
CREATE INDEX IF NOT EXISTS idx_mikrotik_ping_targets_device_id ON public.mikrotik_ping_targets(device_id);