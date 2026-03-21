
CREATE TABLE public.mikrotik_traffic_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id uuid NOT NULL REFERENCES public.mikrotik_devices(id) ON DELETE CASCADE,
  interface_name text NOT NULL,
  tx_bytes bigint NOT NULL DEFAULT 0,
  rx_bytes bigint NOT NULL DEFAULT 0,
  tx_packets bigint NOT NULL DEFAULT 0,
  rx_packets bigint NOT NULL DEFAULT 0,
  tx_errors bigint NOT NULL DEFAULT 0,
  rx_errors bigint NOT NULL DEFAULT 0,
  recorded_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX idx_traffic_history_device_recorded ON public.mikrotik_traffic_history(device_id, recorded_at DESC);

ALTER TABLE public.mikrotik_traffic_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage traffic history"
  ON public.mikrotik_traffic_history FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Technicians can view traffic history"
  ON public.mikrotik_traffic_history FOR SELECT
  TO authenticated
  USING (has_role(auth.uid(), 'technician'::app_role));
