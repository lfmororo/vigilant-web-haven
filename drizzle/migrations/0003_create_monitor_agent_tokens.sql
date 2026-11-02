CREATE TABLE public.monitor_agent_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  name text NOT NULL,
  token_prefix text NOT NULL,
  token_hash text NOT NULL UNIQUE,
  scopes text[] NOT NULL DEFAULT '{}',
  revoked_at timestamptz,
  last_used_at timestamptz,
  last_ip text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT monitor_agent_tokens_scopes_check CHECK (scopes <@ ARRAY['windows','linux','sqlserver','vmware','proxmox','ilo']::text[])
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.monitor_agent_tokens TO authenticated;
GRANT ALL ON public.monitor_agent_tokens TO service_role;
ALTER TABLE public.monitor_agent_tokens ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage monitor agent tokens" ON public.monitor_agent_tokens
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));