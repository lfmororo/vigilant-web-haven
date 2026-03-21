
CREATE TABLE public.mikrotik_dhcp_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id uuid NOT NULL REFERENCES public.mikrotik_devices(id) ON DELETE CASCADE,
  total_leases integer NOT NULL DEFAULT 0,
  active_leases integer NOT NULL DEFAULT 0,
  dynamic_leases integer NOT NULL DEFAULT 0,
  static_leases integer NOT NULL DEFAULT 0,
  by_server jsonb DEFAULT NULL,
  recorded_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX idx_dhcp_history_device_recorded ON public.mikrotik_dhcp_history(device_id, recorded_at DESC);

ALTER TABLE public.mikrotik_dhcp_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage dhcp history"
  ON public.mikrotik_dhcp_history FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Technicians can view dhcp history"
  ON public.mikrotik_dhcp_history FOR SELECT
  TO authenticated
  USING (has_role(auth.uid(), 'technician'::app_role));
