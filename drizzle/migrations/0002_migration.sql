CREATE TABLE public.ad_diagnostic_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  scope text NOT NULL DEFAULT 'workstation',
  hostname text NOT NULL,
  domain text,
  ok_count integer NOT NULL DEFAULT 0,
  warning_count integer NOT NULL DEFAULT 0,
  error_count integer NOT NULL DEFAULT 0,
  fixed_count integer NOT NULL DEFAULT 0,
  findings jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ad_diag_created_idx ON public.ad_diagnostic_reports (created_at DESC);
ALTER TABLE public.ad_diagnostic_reports ENABLE ROW LEVEL SECURITY;
GRANT SELECT, DELETE ON public.ad_diagnostic_reports TO authenticated;
GRANT ALL ON public.ad_diagnostic_reports TO service_role;
CREATE POLICY "Admins gerenciam diagnosticos" ON public.ad_diagnostic_reports
  FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));