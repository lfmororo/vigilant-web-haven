
-- Tabela para armazenar chaves de API do inventário
CREATE TABLE public.inventory_api_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  api_key text NOT NULL UNIQUE,
  description text DEFAULT '',
  is_active boolean NOT NULL DEFAULT true,
  last_used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.inventory_api_keys ENABLE ROW LEVEL SECURITY;

-- Admins can do everything
CREATE POLICY "Admins can manage inventory api keys"
ON public.inventory_api_keys
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Clients can view their own keys
CREATE POLICY "Clients can view own api keys"
ON public.inventory_api_keys
FOR SELECT
USING (client_id = auth.uid());

-- Index for faster lookups
CREATE INDEX idx_inventory_api_keys_api_key ON public.inventory_api_keys(api_key);
CREATE INDEX idx_inventory_api_keys_client_id ON public.inventory_api_keys(client_id);
