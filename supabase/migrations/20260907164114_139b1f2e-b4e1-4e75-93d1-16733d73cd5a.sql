CREATE TABLE public.collector_agent_status (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  agent_type text NOT NULL,
  agent_key text NOT NULL,
  name text,
  version text,
  host text,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (agent_type, agent_key)
);

GRANT SELECT ON public.collector_agent_status TO authenticated;
GRANT ALL ON public.collector_agent_status TO service_role;

ALTER TABLE public.collector_agent_status ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins podem ver versoes dos agentes"
ON public.collector_agent_status
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_collector_agent_status_updated_at
BEFORE UPDATE ON public.collector_agent_status
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_collector_agent_status_type ON public.collector_agent_status(agent_type);