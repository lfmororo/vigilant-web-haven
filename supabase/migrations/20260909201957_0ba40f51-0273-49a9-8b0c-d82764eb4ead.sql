CREATE TABLE public.provisioning_templates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  sector_id UUID REFERENCES public.client_sectors(id) ON DELETE CASCADE,
  ad_ou TEXT,
  ad_groups TEXT[] NOT NULL DEFAULT '{}',
  base_path TEXT,
  subfolders TEXT[] NOT NULL DEFAULT ARRAY['Documentos','Area de Trabalho','Downloads'],
  home_drive TEXT,
  email_domain TEXT,
  email_groups TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX uniq_provisioning_template_sector ON public.provisioning_templates(client_id, COALESCE(sector_id, '00000000-0000-0000-0000-000000000000'::uuid));
CREATE INDEX idx_provisioning_templates_client ON public.provisioning_templates(client_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.provisioning_templates TO authenticated;
GRANT ALL ON public.provisioning_templates TO service_role;
ALTER TABLE public.provisioning_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage provisioning templates" ON public.provisioning_templates
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.provisioning_requests (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  sector_id UUID REFERENCES public.client_sectors(id) ON DELETE SET NULL,
  full_name TEXT NOT NULL,
  username TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  job_title TEXT,
  initial_password TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','running','done','error','partial')),
  email_status TEXT NOT NULL DEFAULT 'pending' CHECK (email_status IN ('pending','done','skipped','error')),
  steps JSONB NOT NULL DEFAULT '[]'::jsonb,
  log TEXT,
  agent_key TEXT,
  claimed_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_provisioning_requests_status ON public.provisioning_requests(status);
CREATE INDEX idx_provisioning_requests_client ON public.provisioning_requests(client_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.provisioning_requests TO authenticated;
GRANT ALL ON public.provisioning_requests TO service_role;
ALTER TABLE public.provisioning_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage provisioning requests" ON public.provisioning_requests
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_provisioning_templates_updated_at BEFORE UPDATE ON public.provisioning_templates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_provisioning_requests_updated_at BEFORE UPDATE ON public.provisioning_requests
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();