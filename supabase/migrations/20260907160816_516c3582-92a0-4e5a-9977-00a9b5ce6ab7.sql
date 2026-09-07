ALTER TABLE public.ilo_servers
  ADD COLUMN IF NOT EXISTS consecutive_failures integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_success_at timestamptz;