CREATE TABLE public.linux_servers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  name text NOT NULL,
  host text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  status text NOT NULL DEFAULT 'unknown',
  hostname text, distro text, kernel text, cpu_model text, cpu_cores int,
  cpu_usage_pct numeric, iowait_pct numeric, load_1 numeric, load_5 numeric, load_15 numeric,
  ram_total_gb numeric, ram_used_gb numeric, ram_usage_pct numeric, swap_total_gb numeric, swap_used_gb numeric,
  disk_usage_pct numeric,
  disks jsonb, services_status jsonb, failed_units jsonb, raid_status jsonb, zfs_pools jsonb, top_processes jsonb,
  pending_updates int, security_updates int, reboot_required boolean, uptime_seconds bigint,
  agent_version text, thresholds jsonb, consecutive_failures int NOT NULL DEFAULT 0,
  last_success_at timestamptz, last_polled_at timestamptz, last_error text,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_linux_servers_client ON public.linux_servers(client_id);
CREATE TRIGGER update_linux_servers_updated_at BEFORE UPDATE ON public.linux_servers FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.sql_instances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  windows_server_id uuid REFERENCES public.windows_servers(id) ON DELETE SET NULL,
  name text NOT NULL,
  instance text NOT NULL,
  auth_mode text NOT NULL DEFAULT 'windows' CHECK (auth_mode IN ('windows','sql')),
  username text, password text,
  is_active boolean NOT NULL DEFAULT true,
  status text NOT NULL DEFAULT 'unknown',
  version text, edition text, uptime_seconds bigint,
  sql_cpu_pct numeric, ple_seconds numeric, buffer_cache_hit_pct numeric, batch_requests_sec numeric, user_connections int,
  blocked_sessions int, longest_block_seconds numeric,
  long_running_queries jsonb NOT NULL DEFAULT '[]', databases jsonb NOT NULL DEFAULT '[]', failed_jobs jsonb NOT NULL DEFAULT '[]',
  top_waits jsonb NOT NULL DEFAULT '[]', io_latency jsonb NOT NULL DEFAULT '[]',
  agent_running boolean, max_server_memory_mb bigint, memory_used_mb bigint,
  agent_version text, thresholds jsonb, consecutive_failures int NOT NULL DEFAULT 0,
  last_success_at timestamptz, last_polled_at timestamptz, last_error text,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_sql_instances_client ON public.sql_instances(client_id);
CREATE INDEX idx_sql_instances_winsrv ON public.sql_instances(windows_server_id);
CREATE TRIGGER update_sql_instances_updated_at BEFORE UPDATE ON public.sql_instances FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.windows_servers
  ADD COLUMN IF NOT EXISTS disks jsonb, ADD COLUMN IF NOT EXISTS top_processes jsonb, ADD COLUMN IF NOT EXISTS event_errors jsonb,
  ADD COLUMN IF NOT EXISTS pending_reboot boolean, ADD COLUMN IF NOT EXISTS pending_updates int,
  ADD COLUMN IF NOT EXISTS cpu_model text, ADD COLUMN IF NOT EXISTS cpu_cores int, ADD COLUMN IF NOT EXISTS agent_version text,
  ADD COLUMN IF NOT EXISTS thresholds jsonb, ADD COLUMN IF NOT EXISTS consecutive_failures int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_success_at timestamptz;
ALTER TABLE public.vmware_hosts
  ADD COLUMN IF NOT EXISTS thresholds jsonb, ADD COLUMN IF NOT EXISTS consecutive_failures int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_success_at timestamptz;
ALTER TABLE public.proxmox_nodes
  ADD COLUMN IF NOT EXISTS thresholds jsonb, ADD COLUMN IF NOT EXISTS consecutive_failures int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_success_at timestamptz, ADD COLUMN IF NOT EXISTS iowait_pct numeric;
ALTER TABLE public.ilo_servers ADD COLUMN IF NOT EXISTS thresholds jsonb;

CREATE TABLE public.monitor_metric_samples (
  id bigserial PRIMARY KEY,
  source_type text NOT NULL,
  source_id uuid NOT NULL,
  client_id uuid,
  cpu_pct numeric, ram_pct numeric, disk_pct numeric,
  extra jsonb,
  collected_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_monitor_samples_src_time ON public.monitor_metric_samples(source_type, source_id, collected_at DESC);
CREATE INDEX idx_monitor_samples_time ON public.monitor_metric_samples(collected_at);

CREATE TABLE public.monitor_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_type text NOT NULL,
  source_id uuid NOT NULL,
  source_name text,
  client_id uuid,
  alert_key text NOT NULL,
  category text,
  severity text NOT NULL DEFAULT 'warning' CHECK (severity IN ('info','warning','critical')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','acknowledged','resolved')),
  title text NOT NULL,
  message text,
  value numeric, threshold numeric,
  breach_count int NOT NULL DEFAULT 1,
  notify_count int NOT NULL DEFAULT 0,
  first_detected_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  last_notified_at timestamptz,
  acknowledged_by uuid, acknowledged_at timestamptz, ack_note text,
  resolved_at timestamptz,
  ticket_id uuid REFERENCES public.tickets(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source_type, source_id, alert_key)
);
CREATE INDEX idx_monitor_alerts_status ON public.monitor_alerts(status, severity);
CREATE INDEX idx_monitor_alerts_client ON public.monitor_alerts(client_id);
CREATE INDEX idx_monitor_alerts_resolved ON public.monitor_alerts(resolved_at) WHERE status = 'resolved';
CREATE TRIGGER update_monitor_alerts_updated_at BEFORE UPDATE ON public.monitor_alerts FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS monitor_notify_group boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS monitor_min_severity text NOT NULL DEFAULT 'critical' CHECK (monitor_min_severity IN ('warning','critical'));
ALTER TABLE public.whatsapp_notification_logs
  ADD COLUMN IF NOT EXISTS monitor_alert_id uuid REFERENCES public.monitor_alerts(id) ON DELETE SET NULL;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.linux_servers, public.sql_instances, public.monitor_metric_samples, public.monitor_alerts TO authenticated;
GRANT ALL ON public.linux_servers, public.sql_instances, public.monitor_metric_samples, public.monitor_alerts TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.monitor_metric_samples_id_seq TO authenticated, service_role;

ALTER TABLE public.linux_servers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sql_instances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.monitor_metric_samples ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.monitor_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage linux_servers" ON public.linux_servers FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "Technicians view linux_servers" ON public.linux_servers FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'technician'));
CREATE POLICY "Service role linux_servers" ON public.linux_servers FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Admins manage sql_instances" ON public.sql_instances FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "Technicians view sql_instances" ON public.sql_instances FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'technician'));
CREATE POLICY "Service role sql_instances" ON public.sql_instances FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Admins manage monitor_metric_samples" ON public.monitor_metric_samples FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "Technicians view monitor_metric_samples" ON public.monitor_metric_samples FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'technician'));
CREATE POLICY "Service role monitor_metric_samples" ON public.monitor_metric_samples FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Admins manage monitor_alerts" ON public.monitor_alerts FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "Technicians view monitor_alerts" ON public.monitor_alerts FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'technician'));
CREATE POLICY "Technicians update monitor_alerts" ON public.monitor_alerts FOR UPDATE TO authenticated USING (public.has_role(auth.uid(),'technician')) WITH CHECK (public.has_role(auth.uid(),'technician'));
CREATE POLICY "Service role monitor_alerts" ON public.monitor_alerts FOR ALL TO service_role USING (true) WITH CHECK (true);

ALTER PUBLICATION supabase_realtime ADD TABLE public.monitor_alerts;

CREATE OR REPLACE FUNCTION public.monitor_metric_series(p_source_type text, p_source_id uuid, p_hours int DEFAULT 24, p_bucket_minutes int DEFAULT 15)
RETURNS TABLE(bucket timestamptz, cpu_avg numeric, cpu_max numeric, ram_avg numeric, disk_max numeric, extra jsonb)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public
AS $$
  SELECT
    to_timestamp(floor(extract(epoch FROM s.collected_at) / (greatest(p_bucket_minutes,1) * 60)) * greatest(p_bucket_minutes,1) * 60) AS bucket,
    round(avg(s.cpu_pct), 2), max(s.cpu_pct), round(avg(s.ram_pct), 2), max(s.disk_pct),
    (array_agg(s.extra ORDER BY s.collected_at DESC))[1]
  FROM public.monitor_metric_samples s
  WHERE s.source_type = p_source_type AND s.source_id = p_source_id
    AND s.collected_at >= now() - make_interval(hours => greatest(p_hours,1))
  GROUP BY 1
  ORDER BY 1;
$$;

CREATE OR REPLACE FUNCTION public.monitor_disk_forecast(p_days int DEFAULT 14)
RETURNS TABLE(source_type text, source_id uuid, current_pct numeric, growth_pct_per_day numeric, days_to_full numeric)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public
AS $$
  WITH s AS (
    SELECT m.source_type, m.source_id, m.disk_pct, m.collected_at
    FROM public.monitor_metric_samples m
    WHERE m.disk_pct IS NOT NULL AND m.collected_at >= now() - make_interval(days => greatest(p_days,1))
  ), agg AS (
    SELECT s.source_type, s.source_id,
      regr_slope(s.disk_pct::float8, extract(epoch FROM s.collected_at) / 86400.0) AS slope,
      (array_agg(s.disk_pct ORDER BY s.collected_at DESC))[1] AS current_pct,
      count(*) AS n,
      max(s.collected_at) - min(s.collected_at) AS span
    FROM s GROUP BY s.source_type, s.source_id
  )
  SELECT a.source_type, a.source_id, a.current_pct,
    round(a.slope::numeric, 3),
    CASE WHEN a.slope > 0.01 THEN round(greatest(0, (100 - a.current_pct)) / a.slope::numeric, 1) END
  FROM agg a
  WHERE a.n >= 12 AND a.span >= interval '1 day';
$$;

GRANT EXECUTE ON FUNCTION public.monitor_metric_series(text, uuid, int, int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.monitor_disk_forecast(int) TO authenticated;