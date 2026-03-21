
CREATE TABLE public.mikrotik_interface_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id uuid NOT NULL REFERENCES public.mikrotik_devices(id) ON DELETE CASCADE,
  interface_name text NOT NULL,
  event_type text NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_mikrotik_iface_events_device_time ON public.mikrotik_interface_events(device_id, recorded_at);

ALTER TABLE public.mikrotik_interface_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage interface events" ON public.mikrotik_interface_events
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Technicians can view interface events" ON public.mikrotik_interface_events
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'technician'::app_role));
