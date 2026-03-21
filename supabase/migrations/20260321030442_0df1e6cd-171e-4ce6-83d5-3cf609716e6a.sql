
CREATE TABLE public.mikrotik_system_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id uuid NOT NULL REFERENCES public.mikrotik_devices(id) ON DELETE CASCADE,
  cpu_temp numeric NULL,
  cpu_load numeric NULL,
  voltage numeric NULL,
  memory_used_pct numeric NULL,
  recorded_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_mikrotik_system_history_device_time ON public.mikrotik_system_history(device_id, recorded_at);

ALTER TABLE public.mikrotik_system_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage system history" ON public.mikrotik_system_history
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Technicians can view system history" ON public.mikrotik_system_history
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'technician'::app_role));
