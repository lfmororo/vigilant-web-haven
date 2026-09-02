-- Servidores HP com iLO4
CREATE TABLE public.ilo_servers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  name text NOT NULL,
  host text NOT NULL,
  port integer NOT NULL DEFAULT 443,
  username text NOT NULL,
  password text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  status text NOT NULL DEFAULT 'unknown',
  health_summary text,
  power_state text,
  post_state text,
  indicator_led text,
  server_model text,
  serial_number text,
  ilo_version text,
  ilo_firmware text,
  bios_version text,
  cpu_model text,
  cpu_count integer,
  ram_total_gb numeric,
  health_processor text,
  health_memory text,
  health_storage text,
  health_fans text,
  health_power text,
  health_temperature text,
  health_network text,
  uptime_seconds bigint,
  last_polled_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ilo_servers TO authenticated;
GRANT ALL ON public.ilo_servers TO service_role;
ALTER TABLE public.ilo_servers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can manage ilo servers" ON public.ilo_servers FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Technicians can view ilo servers" ON public.ilo_servers FOR SELECT TO authenticated USING (has_role(auth.uid(), 'technician'::app_role));
CREATE TRIGGER update_ilo_servers_updated_at BEFORE UPDATE ON public.ilo_servers FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Sensores (temperatura, ventiladores, fontes, voltagens, discos)
CREATE TABLE public.ilo_sensors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  server_id uuid NOT NULL REFERENCES public.ilo_servers(id) ON DELETE CASCADE,
  sensor_type text NOT NULL,
  name text NOT NULL,
  reading numeric,
  unit text,
  status text,
  health text,
  upper_critical numeric,
  location text,
  details jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_ilo_sensors_server ON public.ilo_sensors(server_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ilo_sensors TO authenticated;
GRANT ALL ON public.ilo_sensors TO service_role;
ALTER TABLE public.ilo_sensors ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can manage ilo sensors" ON public.ilo_sensors FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Technicians can view ilo sensors" ON public.ilo_sensors FOR SELECT TO authenticated USING (has_role(auth.uid(), 'technician'::app_role));

-- Eventos de hardware (IML)
CREATE TABLE public.ilo_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  server_id uuid NOT NULL REFERENCES public.ilo_servers(id) ON DELETE CASCADE,
  event_key text NOT NULL,
  severity text NOT NULL DEFAULT 'info',
  category text,
  message text NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  notified boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (server_id, event_key)
);

CREATE INDEX idx_ilo_events_server ON public.ilo_events(server_id, recorded_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ilo_events TO authenticated;
GRANT ALL ON public.ilo_events TO service_role;
ALTER TABLE public.ilo_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can manage ilo events" ON public.ilo_events FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Technicians can view ilo events" ON public.ilo_events FOR SELECT TO authenticated USING (has_role(auth.uid(), 'technician'::app_role));