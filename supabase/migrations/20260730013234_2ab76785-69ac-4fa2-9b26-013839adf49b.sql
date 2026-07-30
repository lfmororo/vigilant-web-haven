CREATE TABLE public.backup_agents (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  hostname text,
  api_key text not null unique,
  active boolean not null default true,
  last_seen_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.backup_agents TO authenticated;
GRANT ALL ON public.backup_agents TO service_role;
ALTER TABLE public.backup_agents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage backup agents" ON public.backup_agents FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.backup_runs (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid references public.backup_agents(id) on delete cascade,
  status text not null default 'running' check (status in ('running','success','partial','failed')),
  source_dir text,
  providers text,
  total_files integer not null default 0,
  processed_files integer not null default 0,
  uploaded integer not null default 0,
  updated integer not null default 0,
  skipped integer not null default 0,
  failed integer not null default 0,
  bytes bigint not null default 0,
  current_file text,
  error_message text,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
CREATE INDEX idx_backup_runs_agent ON public.backup_runs(agent_id);
CREATE INDEX idx_backup_runs_started ON public.backup_runs(started_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.backup_runs TO authenticated;
GRANT ALL ON public.backup_runs TO service_role;
ALTER TABLE public.backup_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage backup runs" ON public.backup_runs FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.backup_run_logs (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.backup_runs(id) on delete cascade,
  level text not null default 'info',
  message text not null,
  created_at timestamptz not null default now()
);
CREATE INDEX idx_backup_run_logs_run ON public.backup_run_logs(run_id, created_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.backup_run_logs TO authenticated;
GRANT ALL ON public.backup_run_logs TO service_role;
ALTER TABLE public.backup_run_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage backup run logs" ON public.backup_run_logs FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_backup_agents_updated_at BEFORE UPDATE ON public.backup_agents
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_backup_runs_updated_at BEFORE UPDATE ON public.backup_runs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER PUBLICATION supabase_realtime ADD TABLE public.backup_runs;