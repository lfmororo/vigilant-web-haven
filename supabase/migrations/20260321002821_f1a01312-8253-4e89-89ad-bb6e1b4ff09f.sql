
-- Mikrotik devices table
CREATE TABLE public.mikrotik_devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid REFERENCES public.clients(id) ON DELETE CASCADE NOT NULL,
  name text NOT NULL,
  host text NOT NULL,
  port integer NOT NULL DEFAULT 443,
  username text NOT NULL DEFAULT 'admin',
  password text NOT NULL DEFAULT '',
  use_ssl boolean NOT NULL DEFAULT true,
  is_active boolean NOT NULL DEFAULT true,
  last_polled_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.mikrotik_devices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage mikrotik devices" ON public.mikrotik_devices FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Technicians can view mikrotik devices" ON public.mikrotik_devices FOR SELECT TO authenticated USING (has_role(auth.uid(), 'technician'::app_role));

-- Mikrotik interfaces table (updated on each poll)
CREATE TABLE public.mikrotik_interfaces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id uuid REFERENCES public.mikrotik_devices(id) ON DELETE CASCADE NOT NULL,
  interface_name text NOT NULL,
  interface_type text,
  status text NOT NULL DEFAULT 'unknown',
  running boolean NOT NULL DEFAULT false,
  disabled boolean NOT NULL DEFAULT false,
  mac_address text,
  tx_rate bigint DEFAULT 0,
  rx_rate bigint DEFAULT 0,
  tx_bytes bigint DEFAULT 0,
  rx_bytes bigint DEFAULT 0,
  tx_packets bigint DEFAULT 0,
  rx_packets bigint DEFAULT 0,
  tx_errors bigint DEFAULT 0,
  rx_errors bigint DEFAULT 0,
  tx_drops bigint DEFAULT 0,
  rx_drops bigint DEFAULT 0,
  speed text,
  ip_address text,
  gateway text,
  dns_servers text,
  uptime text,
  pppoe_user text,
  pppoe_service text,
  last_link_up timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(device_id, interface_name)
);

ALTER TABLE public.mikrotik_interfaces ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage mikrotik interfaces" ON public.mikrotik_interfaces FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Technicians can view mikrotik interfaces" ON public.mikrotik_interfaces FOR SELECT TO authenticated USING (has_role(auth.uid(), 'technician'::app_role));

-- Mikrotik ping targets
CREATE TABLE public.mikrotik_ping_targets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id uuid REFERENCES public.mikrotik_devices(id) ON DELETE CASCADE NOT NULL,
  target_ip text NOT NULL,
  label text NOT NULL DEFAULT '',
  is_active boolean NOT NULL DEFAULT true,
  latency_ms numeric,
  packet_loss_pct numeric,
  last_checked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.mikrotik_ping_targets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage mikrotik ping targets" ON public.mikrotik_ping_targets FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Technicians can view mikrotik ping targets" ON public.mikrotik_ping_targets FOR SELECT TO authenticated USING (has_role(auth.uid(), 'technician'::app_role));
