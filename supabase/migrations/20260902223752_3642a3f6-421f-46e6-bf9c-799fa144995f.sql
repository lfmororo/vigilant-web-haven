CREATE TABLE public.server_sensor_alerts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  server_id UUID NOT NULL REFERENCES public.ilo_servers(id) ON DELETE CASCADE,
  sensor_key TEXT NOT NULL,
  sensor_name TEXT NOT NULL,
  sensor_type TEXT,
  severity TEXT NOT NULL DEFAULT 'warning' CHECK (severity IN ('warning','critical')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','resolved')),
  reading NUMERIC,
  unit TEXT,
  message TEXT,
  first_detected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_notified_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (server_id, sensor_key)
);

CREATE INDEX idx_server_sensor_alerts_server ON public.server_sensor_alerts(server_id);
CREATE INDEX idx_server_sensor_alerts_status ON public.server_sensor_alerts(status);

GRANT SELECT ON public.server_sensor_alerts TO authenticated;
GRANT ALL ON public.server_sensor_alerts TO service_role;

ALTER TABLE public.server_sensor_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins podem ver alertas de sensores"
ON public.server_sensor_alerts FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_server_sensor_alerts_updated_at
BEFORE UPDATE ON public.server_sensor_alerts
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();