CREATE TABLE public.proxmox_interfaces (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  node_id uuid NOT NULL REFERENCES public.proxmox_nodes(id) ON DELETE CASCADE,
  interface_name text NOT NULL,
  status text NOT NULL DEFAULT 'unknown',
  mac_address text,
  speed_mbps integer,
  rx_bytes bigint,
  tx_bytes bigint,
  rx_rate_bps bigint,
  tx_rate_bps bigint,
  rx_errors bigint,
  tx_errors bigint,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (node_id, interface_name)
);

CREATE INDEX idx_proxmox_interfaces_node ON public.proxmox_interfaces(node_id);

GRANT SELECT ON public.proxmox_interfaces TO authenticated;
GRANT ALL ON public.proxmox_interfaces TO service_role;

ALTER TABLE public.proxmox_interfaces ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view proxmox interfaces"
ON public.proxmox_interfaces FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'));