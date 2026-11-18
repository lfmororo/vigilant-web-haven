-- Remove do banco os módulos DVR/CFTV e Firewalls Sophos (retirados do painel na etapa 2).
-- NÃO roda sozinho no install.sh: os dados são apagados de vez.
--
-- 1) Guarde um backup só dessas tabelas:
--    docker exec supabase-db pg_dump -U supabase_admin -d postgres -Fc \
--      -t public.dvr_devices -t public.dvr_cameras -t public.dvr_events \
--      -t public.sophos_firewalls -t public.sophos_alerts -t public.sophos_telemetry_logs \
--      > /opt/vigilant/backups/dvr-sophos-$(date +%F).dump
-- 2) Rode este script:
--    docker exec -i supabase-db psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 < deploy/sql/remover-dvr-sophos.sql
--
-- Para voltar atrás: pg_restore -d postgres no arquivo do passo 1.

BEGIN;

-- Crons que chamavam as funções removidas (dvr-*, sophos-telemetry)
DO $$
DECLARE j record;
BEGIN
  IF to_regclass('cron.job') IS NOT NULL THEN
    FOR j IN SELECT jobid, jobname FROM cron.job
             WHERE command ILIKE '%dvr-%' OR command ILIKE '%sophos%'
    LOOP
      PERFORM cron.unschedule(j.jobid);
      RAISE NOTICE 'cron removido: % (%)', j.jobname, j.jobid;
    END LOOP;
  END IF;
END $$;

DROP TABLE IF EXISTS public.dvr_events CASCADE;
DROP TABLE IF EXISTS public.dvr_cameras CASCADE;
DROP TABLE IF EXISTS public.dvr_devices CASCADE;
DROP TABLE IF EXISTS public.sophos_telemetry_logs CASCADE;
DROP TABLE IF EXISTS public.sophos_alerts CASCADE;
DROP TABLE IF EXISTS public.sophos_firewalls CASCADE;

COMMIT;
