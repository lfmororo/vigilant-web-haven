

## Verificacao Automatica de Emails a Cada Minuto

Configurar um cron job no banco de dados usando as extensoes `pg_cron` e `pg_net` para chamar a edge function `process-incoming-emails` automaticamente a cada minuto.

---

### 1. Habilitar extensoes `pg_cron` e `pg_net`

Criar uma migration que ativa as extensoes necessarias:

```sql
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;
```

---

### 2. Criar o cron job via SQL (executado manualmente)

Como o SQL contem dados especificos do projeto (URL e chave), sera executado via ferramenta de insert SQL (nao como migration):

```sql
SELECT cron.schedule(
  'process-incoming-emails-every-minute',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := 'https://egbusmegupjfxqswdlxq.supabase.co/functions/v1/process-incoming-emails',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."}'::jsonb,
    body := '{}'::jsonb
  ) AS request_id;
  $$
);
```

---

### Detalhes Tecnicos

- `pg_cron` permite agendar tarefas SQL recorrentes dentro do banco de dados
- `pg_net` permite fazer chamadas HTTP de dentro do banco, necessario para invocar a edge function
- O cron roda a cada minuto (`* * * * *`)
- A edge function ja esta configurada com `verify_jwt = false`, entao aceita a chamada do cron
- Nenhuma alteracao de codigo frontend e necessaria

