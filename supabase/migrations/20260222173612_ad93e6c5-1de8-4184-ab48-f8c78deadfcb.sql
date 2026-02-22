-- Enable pg_cron and pg_net extensions
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Grant usage on cron schema
GRANT USAGE ON SCHEMA cron TO postgres;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA cron TO postgres;

-- Schedule stale-ticket-alert: every day at 08:00 BRT (11:00 UTC), weekdays only
SELECT cron.schedule(
  'stale-ticket-alert-daily',
  '0 11 * * 1-5',
  $$
  SELECT net.http_post(
    url := 'https://egbusmegupjfxqswdlxq.supabase.co/functions/v1/stale-ticket-alert',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVnYnVzbWVndXBqZnhxc3dkbHhxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY0MDUxMDYsImV4cCI6MjA4MTk4MTEwNn0.SPh-z2s1UEyacv5ucviiMwWO58JifVKQ8NIYYYcfuQw'
    ),
    body := '{}'::jsonb
  ) AS request_id;
  $$
);

-- Schedule daily-client-summary: every day at 08:00 BRT (11:00 UTC), weekdays only
SELECT cron.schedule(
  'daily-client-summary',
  '0 11 * * 1-5',
  $$
  SELECT net.http_post(
    url := 'https://egbusmegupjfxqswdlxq.supabase.co/functions/v1/daily-client-summary',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVnYnVzbWVndXBqZnhxc3dkbHhxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY0MDUxMDYsImV4cCI6MjA4MTk4MTEwNn0.SPh-z2s1UEyacv5ucviiMwWO58JifVKQ8NIYYYcfuQw'
    ),
    body := '{}'::jsonb
  ) AS request_id;
  $$
);
