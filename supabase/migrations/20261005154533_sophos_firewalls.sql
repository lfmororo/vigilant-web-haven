-- ============================================================
-- Sophos XG/SFOS Firewall Monitoring
-- ============================================================

-- ── sophos_firewalls ───────────────────────────────────────
CREATE TABLE public.sophos_firewalls (
  id               UUID                                        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id        UUID                                        NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  name             TEXT                                        NOT NULL,
  serial_number    TEXT,
  model            TEXT,
  firmware_version TEXT,
  api_token        TEXT                                        NOT NULL UNIQUE,
  sophos_ip        TEXT,
  status           TEXT                                        NOT NULL DEFAULT 'offline' CHECK (status IN ('online','offline','warning')),
  last_seen_at     TIMESTAMPTZ,
  created_at       TIMESTAMPTZ                                 NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ                                 NOT NULL DEFAULT now()
);

CREATE INDEX idx_sophos_firewalls_client   ON public.sophos_firewalls(client_id);
CREATE INDEX idx_sophos_firewalls_api_token ON public.sophos_firewalls(api_token);

-- ── sophos_telemetry_logs ──────────────────────────────────
CREATE TABLE public.sophos_telemetry_logs (
  id           UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  firewall_id  UUID        NOT NULL REFERENCES public.sophos_firewalls(id) ON DELETE CASCADE,
  cpu_usage    INTEGER,
  memory_usage INTEGER,
  disk_usage   INTEGER,
  interfaces   JSONB,
  vpn_tunnels  JSONB,
  raw_payload  JSONB,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_sophos_telemetry_firewall  ON public.sophos_telemetry_logs(firewall_id);
CREATE INDEX idx_sophos_telemetry_created   ON public.sophos_telemetry_logs(created_at DESC);

-- ── sophos_alerts ───────────────────────────────────────────
CREATE TABLE public.sophos_alerts (
  id          UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  firewall_id UUID        NOT NULL REFERENCES public.sophos_firewalls(id) ON DELETE CASCADE,
  severity    TEXT        NOT NULL CHECK (severity IN ('info','warning','critical')),
  title       TEXT        NOT NULL,
  message     TEXT        NOT NULL,
  resolved    BOOLEAN     NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_sophos_alerts_firewall ON public.sophos_alerts(firewall_id);
CREATE INDEX idx_sophos_alerts_resolved ON public.sophos_alerts(resolved) WHERE resolved = false;

-- ── RLS & Grants ────────────────────────────────────────────
ALTER TABLE public.sophos_firewalls     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sophos_telemetry_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sophos_alerts        ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.sophos_firewalls      TO authenticated;
GRANT SELECT, INSERT                   ON public.sophos_telemetry_logs TO authenticated;
GRANT SELECT, INSERT, UPDATE           ON public.sophos_alerts        TO authenticated;
GRANT ALL                             ON public.sophos_firewalls      TO service_role;
GRANT ALL                             ON public.sophos_telemetry_logs TO service_role;
GRANT ALL                             ON public.sophos_alerts         TO service_role;

-- Admins leem todos; agentes via service_role (Edge Function)
CREATE POLICY "Admins manage sophos firewalls" ON public.sophos_firewalls
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Authenticated read sophos telemetry" ON public.sophos_telemetry_logs
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins manage sophos alerts" ON public.sophos_alerts
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- ── updated_at trigger ─────────────────────────────────────
CREATE TRIGGER update_sophos_firewalls_updated_at
  BEFORE UPDATE ON public.sophos_firewalls
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
