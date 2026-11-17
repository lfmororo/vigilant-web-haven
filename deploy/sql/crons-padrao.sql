-- Tarefas agendadas padrão do vigilant (use só se o backup da Lovable não trouxe as tarefas).
-- __CRON_URL__ e __SERVICE_KEY__ são trocados pelo install.sh. Horários em UTC (Brasil = UTC-3).
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

SELECT cron.schedule('stale-ticket-alert-daily', '0 11 * * 1-5', $$
  SELECT net.http_post(url := '__CRON_URL__/functions/v1/stale-ticket-alert',
    headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer __SERVICE_KEY__'),
    body := '{}'::jsonb) $$);

SELECT cron.schedule('daily-client-summary', '0 11 * * 1-5', $$
  SELECT net.http_post(url := '__CRON_URL__/functions/v1/daily-client-summary',
    headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer __SERVICE_KEY__'),
    body := '{}'::jsonb) $$);

-- Monitoramento: "sem dados há X min" e resumo diário (08:30 de Brasília).
SELECT cron.schedule('monitor-watchdog', '*/5 * * * *', $$
  SELECT net.http_post(url := '__CRON_URL__/functions/v1/server-monitor-watchdog',
    headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer __SERVICE_KEY__'),
    body := '{"mode":"watchdog"}'::jsonb) $$);

SELECT cron.schedule('monitor-digest', '30 11 * * *', $$
  SELECT net.http_post(url := '__CRON_URL__/functions/v1/server-monitor-watchdog',
    headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer __SERVICE_KEY__'),
    body := '{"mode":"digest"}'::jsonb) $$);

-- Limpeza do histórico de métricas (mantém 60 dias).
SELECT cron.schedule('monitor-samples-cleanup', '15 6 * * *', $$
  DELETE FROM public.monitor_metric_samples WHERE collected_at < now() - interval '60 days' $$);
