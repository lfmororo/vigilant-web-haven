CREATE TABLE public.proxmox_nodes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  name text NOT NULL,
  host text NOT NULL,
  port integer NOT NULL DEFAULT 8006,
  node_name text,
  auth_mode text NOT NULL DEFAULT 'token',
  username text NOT NULL DEFAULT 'root@pam',
  token_name text,
  token_secret text,
  password text,
  is_active boolean NOT NULL DEFAULT true,
  status text NOT NULL DEFAULT 'unknown',
  pve_version text,
  cpu_model text,
  cpu_cores integer,
  cpu_usage_pct numeric,
  ram_total_gb numeric,
  ram_used_gb numeric,
  ram_usage_pct numeric,
  swap_total_gb numeric,
  swap_used_gb numeric,
  disk_total_gb numeric,
  disk_used_gb numeric,
  disk_usage_pct numeric,
  load_avg numeric,
  uptime_seconds bigint,
  storages jsonb,
  last_polled_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.proxmox_guests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  node_id uuid NOT NULL REFERENCES public.proxmox_nodes(id) ON DELETE CASCADE,
  vmid integer NOT NULL,
  name text NOT NULL,
  guest_type text NOT NULL DEFAULT 'qemu',
  status text NOT NULL DEFAULT 'unknown',
  cpu_count integer,
  cpu_usage_pct numeric,
  ram_total_gb numeric,
  ram_used_gb numeric,
  ram_usage_pct numeric,
  disk_total_gb numeric,
  disk_used_gb numeric,
  uptime_seconds bigint,
  tags text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_proxmox_nodes_client ON public.proxmox_nodes(client_id);
CREATE INDEX idx_proxmox_guests_node ON public.proxmox_guests(node_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.proxmox_nodes TO authenticated;
GRANT ALL ON public.proxmox_nodes TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.proxmox_guests TO authenticated;
GRANT ALL ON public.proxmox_guests TO service_role;

ALTER TABLE public.proxmox_nodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.proxmox_guests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage proxmox nodes" ON public.proxmox_nodes
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Technicians view proxmox nodes" ON public.proxmox_nodes
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'technician'));

CREATE POLICY "Admins manage proxmox guests" ON public.proxmox_guests
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Technicians view proxmox guests" ON public.proxmox_guests
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'technician'));

CREATE TRIGGER update_proxmox_nodes_updated_at BEFORE UPDATE ON public.proxmox_nodes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_proxmox_guests_updated_at BEFORE UPDATE ON public.proxmox_guests
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();