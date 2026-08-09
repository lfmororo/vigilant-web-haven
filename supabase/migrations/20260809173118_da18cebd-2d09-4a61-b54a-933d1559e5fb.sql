CREATE TABLE public.backup_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  agent_id uuid REFERENCES public.backup_agents(id) ON DELETE CASCADE,
  job_type text NOT NULL DEFAULT 'local' CHECK (job_type IN ('local','cloud')),
  source_path text NOT NULL,
  dest_path text NOT NULL,
  mirror boolean NOT NULL DEFAULT false,
  threads integer NOT NULL DEFAULT 32,
  schedule_cron text,
  notify_phone text,
  notify_on_start boolean NOT NULL DEFAULT true,
  notify_on_progress boolean NOT NULL DEFAULT false,
  notify_on_finish boolean NOT NULL DEFAULT true,
  notify_on_error boolean NOT NULL DEFAULT true,
  progress_step_pct integer NOT NULL DEFAULT 25,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.backup_jobs TO authenticated;
GRANT ALL ON public.backup_jobs TO service_role;

ALTER TABLE public.backup_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage backup jobs"
ON public.backup_jobs FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_backup_jobs_updated_at
BEFORE UPDATE ON public.backup_jobs
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_backup_jobs_agent_id ON public.backup_jobs(agent_id);

ALTER TABLE public.backup_runs
  ADD COLUMN job_id uuid REFERENCES public.backup_jobs(id) ON DELETE SET NULL,
  ADD COLUMN backup_type text NOT NULL DEFAULT 'cloud',
  ADD COLUMN dest_dir text,
  ADD COLUMN speed_bps bigint,
  ADD COLUMN eta_seconds integer,
  ADD COLUMN last_notified_pct integer NOT NULL DEFAULT 0;

CREATE INDEX idx_backup_runs_job_id ON public.backup_runs(job_id);