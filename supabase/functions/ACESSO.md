# Quem pode chamar cada função

As funções abaixo estão com `verify_jwt = false` no `config.toml` (o gateway não exige login),
então cada uma confere sozinha quem está chamando. Ao criar uma função nova sem `verify_jwt`,
proteja-a com `_shared/caller.ts` e acrescente-a aqui.

| Função | Quem chama | Proteção |
|---|---|---|
| `notify-whatsapp`, `notify-telegram` | outras funções (`notify-ticket-update`, `whatsapp-webhook`) | só service_role |
| `daily-ticket-summary`, `stale-ticket-alert`, `weekly-client-report`, `agent-version-alert`, `server-monitor-watchdog` | crons (pg_cron) | só service_role |
| `process-incoming-emails`, `mikrotik-monitor` | crons e botões do painel | service_role ou admin/técnico logado |
| `notify-ticket-update` | painel (cliente, técnico, admin) | service_role ou usuário logado que enxerga o chamado (RLS) |
| `request-remote-access` | painel (cliente, técnico, admin) | usuário logado que enxerga o chamado; o remetente é sempre quem está logado |
| `whatsapp-webhook` | Evolution API | segredo `WHATSAPP_WEBHOOK_SECRET` na URL (`?secret=`) ou no cabeçalho `x-webhook-secret` |
| `create-user`, `test-imap-connection`, `test-smtp-connection` | painel (admin) | confere o login do admin dentro da função |
| `bootstrap-admin` | primeira instalação | só funciona enquanto não existe nenhum admin |
| `inventory-sync` | scripts de inventário do cliente | chave de API do cliente (`inventory_api_keys`) |
| `server-monitor-ingest`, `endpoint-agent` | coletores e Mororo.Tech Agent | token do agente (`x-monitor-token`) |
| `agent-heartbeat` | coletores antigos | chave pública (só registra que o coletor está vivo) |
| `dvr-import`, `dvr-list`, `dvr-vps-ingest` | coletor de DVR | **sem proteção — saem na etapa 2 (módulo DVR removido)** |
