-- Agente unificado Mororo.Tech (mororo-agent): endpoints (servidores e estações),
-- inventário de software, checagens de rede (ping/porta/HTTP) e descoberta de rede.

-- Escopo 'agent' nos tokens (o agente unificado usa um único token por cliente).
ALTER TABLE public.monitor_agent_tokens DROP CONSTRAINT IF EXISTS monitor_agent_tokens_scopes_check;
ALTER TABLE public.monitor_agent_tokens ADD CONSTRAINT monitor_agent_tokens_scopes_check
  CHECK (scopes <@ ARRAY['windows','linux','sqlserver','vmware','proxmox','ilo','agent']::text[]);

-- ---------------------------------------------------------------- endpoints
CREATE TABLE public.agent_endpoints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  machine_id text NOT NULL,
  name text NOT NULL,
  hostname text,
  role text NOT NULL DEFAULT 'workstation' CHECK (role IN ('server','workstation')),
  is_active boolean NOT NULL DEFAULT true,
  status text NOT NULL DEFAULT 'unknown',
  os_family text, os_name text, os_version text, arch text,
  domain text, logged_user text,
  manufacturer text, model text, serial_number text, bios_version text,
  cpu_model text, cpu_cores int, ram_total_gb numeric,
  ip_addresses jsonb NOT NULL DEFAULT '[]',
  mac_addresses jsonb NOT NULL DEFAULT '[]',
  cpu_usage_pct numeric, ram_usage_pct numeric, disk_usage_pct numeric,
  disks jsonb NOT NULL DEFAULT '[]',
  physical_disks jsonb NOT NULL DEFAULT '[]',
  antivirus jsonb NOT NULL DEFAULT '[]',
  top_processes jsonb,
  pending_reboot boolean,
  uptime_seconds bigint, last_boot_time timestamptz,
  remote_access_id text,
  software_count int,
  agent_version text,
  settings jsonb NOT NULL DEFAULT '{}',
  thresholds jsonb,
  windows_server_id uuid REFERENCES public.windows_servers(id) ON DELETE SET NULL,
  linux_server_id uuid REFERENCES public.linux_servers(id) ON DELETE SET NULL,
  equipment_id uuid REFERENCES public.equipment_inventory(id) ON DELETE SET NULL,
  last_seen_at timestamptz, inventory_updated_at timestamptz, last_error text,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (client_id, machine_id)
);
CREATE INDEX idx_agent_endpoints_client ON public.agent_endpoints(client_id);
CREATE INDEX idx_agent_endpoints_seen ON public.agent_endpoints(last_seen_at);
CREATE TRIGGER update_agent_endpoints_updated_at BEFORE UPDATE ON public.agent_endpoints FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.agent_software (
  id bigserial PRIMARY KEY,
  endpoint_id uuid NOT NULL REFERENCES public.agent_endpoints(id) ON DELETE CASCADE,
  name text NOT NULL,
  version text, publisher text, install_date text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_agent_software_endpoint ON public.agent_software(endpoint_id);
CREATE INDEX idx_agent_software_name ON public.agent_software(lower(name));

-- ---------------------------------------------------------------- checagens de rede
CREATE TABLE public.network_probes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  endpoint_id uuid REFERENCES public.agent_endpoints(id) ON DELETE SET NULL,
  name text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('ping','tcp','http')),
  device_type text NOT NULL DEFAULT 'other',
  target text NOT NULL,
  port int,
  expected_status int,
  keyword text,
  interval_seconds int NOT NULL DEFAULT 60,
  failures_before_alert int NOT NULL DEFAULT 3,
  ssl_warn_days int NOT NULL DEFAULT 15,
  severity text NOT NULL DEFAULT 'critical' CHECK (severity IN ('warning','critical')),
  is_active boolean NOT NULL DEFAULT true,
  status text NOT NULL DEFAULT 'unknown',
  latency_ms numeric, packet_loss_pct numeric, http_status int,
  ssl_expires_at timestamptz,
  consecutive_failures int NOT NULL DEFAULT 0,
  last_polled_at timestamptz, last_change_at timestamptz, last_error text,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_network_probes_client ON public.network_probes(client_id);
CREATE INDEX idx_network_probes_endpoint ON public.network_probes(endpoint_id);
CREATE TRIGGER update_network_probes_updated_at BEFORE UPDATE ON public.network_probes FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.network_discoveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  endpoint_id uuid REFERENCES public.agent_endpoints(id) ON DELETE CASCADE,
  ip text NOT NULL,
  mac text, hostname text, vendor text,
  device_type text,
  open_ports jsonb NOT NULL DEFAULT '[]',
  details jsonb,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (client_id, ip)
);
CREATE INDEX idx_network_discoveries_client ON public.network_discoveries(client_id);

-- ---------------------------------------------------------------- quem coleta cada fonte
-- NULL = coletores avulsos antigos; preenchido = agente unificado daquele endpoint.
ALTER TABLE public.windows_servers ADD COLUMN IF NOT EXISTS collector_endpoint_id uuid REFERENCES public.agent_endpoints(id) ON DELETE SET NULL;
ALTER TABLE public.linux_servers ADD COLUMN IF NOT EXISTS collector_endpoint_id uuid REFERENCES public.agent_endpoints(id) ON DELETE SET NULL;
ALTER TABLE public.vmware_hosts ADD COLUMN IF NOT EXISTS collector_endpoint_id uuid REFERENCES public.agent_endpoints(id) ON DELETE SET NULL;
ALTER TABLE public.ilo_servers ADD COLUMN IF NOT EXISTS collector_endpoint_id uuid REFERENCES public.agent_endpoints(id) ON DELETE SET NULL;
ALTER TABLE public.sql_instances ADD COLUMN IF NOT EXISTS collector_endpoint_id uuid REFERENCES public.agent_endpoints(id) ON DELETE SET NULL;
ALTER TABLE public.proxmox_nodes ADD COLUMN IF NOT EXISTS collector_endpoint_id uuid REFERENCES public.agent_endpoints(id) ON DELETE SET NULL;

-- Colunas de credenciais continuam fora do alcance do navegador (AGENTS.md): concede só as novas.
GRANT SELECT (collector_endpoint_id) ON public.vmware_hosts TO authenticated;
GRANT SELECT (collector_endpoint_id) ON public.ilo_servers TO authenticated;
GRANT SELECT (collector_endpoint_id) ON public.sql_instances TO authenticated;
GRANT SELECT (collector_endpoint_id) ON public.proxmox_nodes TO authenticated;

-- ---------------------------------------------------------------- permissões
GRANT SELECT, INSERT, UPDATE, DELETE ON public.agent_endpoints, public.agent_software, public.network_probes, public.network_discoveries TO authenticated;
GRANT ALL ON public.agent_endpoints, public.agent_software, public.network_probes, public.network_discoveries TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.agent_software_id_seq TO authenticated, service_role;

ALTER TABLE public.agent_endpoints ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_software ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.network_probes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.network_discoveries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage agent_endpoints" ON public.agent_endpoints FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "Technicians view agent_endpoints" ON public.agent_endpoints FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'technician'));
CREATE POLICY "Service role agent_endpoints" ON public.agent_endpoints FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Admins manage agent_software" ON public.agent_software FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "Technicians view agent_software" ON public.agent_software FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'technician'));
CREATE POLICY "Service role agent_software" ON public.agent_software FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Admins manage network_probes" ON public.network_probes FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "Technicians view network_probes" ON public.network_probes FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'technician'));
CREATE POLICY "Service role network_probes" ON public.network_probes FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Admins manage network_discoveries" ON public.network_discoveries FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "Technicians view network_discoveries" ON public.network_discoveries FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'technician'));
CREATE POLICY "Service role network_discoveries" ON public.network_discoveries FOR ALL TO service_role USING (true) WITH CHECK (true);
