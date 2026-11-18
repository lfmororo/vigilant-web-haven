# Migrar o vigilant-web-haven da Lovable para a VPS

O sistema passa a rodar inteiro na sua VPS:

| | Antes (Lovable) | Depois (VPS) |
|---|---|---|
| Painel | vigilant-web-haven.lovable.app | **https://painel.mororo.tech** (nginx/Caddy, arquivos estáticos) |
| Banco, login, arquivos, funções | Lovable Cloud (Supabase gerenciado) | **https://api.mororo.tech** — Supabase auto-hospedado em Docker, Postgres local |
| IA dos chamados | gateway da Lovable | Google Gemini direto (`GEMINI_API_KEY`) |
| Tarefas agendadas | pg_cron da Lovable | pg_cron local (copiadas do backup) |

O código continua o mesmo: as funções em `supabase/functions` e as telas em `src` rodam sem mudança de lógica.
Se quiser, dá para continuar editando pela Lovable com o GitHub sincronizado e só publicar na VPS.

---

## 0. Antes de começar

- **DNS**: crie registros **A** para `painel.mororo.tech` e `api.mororo.tech` apontando para o IP da VPS.
- **VPS**: Ubuntu 22.04/24.04 com **4 GB de RAM livres** (o Supabase usa ~2,5–4 GB) e ~10 GB de disco.
  Na mesma VPS da Evolution API/RustDesk não há conflito de portas: o Supabase só escuta em `127.0.0.1:54321/54322/54329`.
  Se faltar memória, crie swap: `fallocate -l 4G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile && echo '/swapfile none swap sw 0 0' >> /etc/fstab`
- **Chave do Gemini**: https://aistudio.google.com → *Get API key*.

## 1. Exportar o banco da Lovable

No projeto na Lovable: **Cloud → Overview → Advanced settings → Export**. Baixe o arquivo (backup `pg_dump`).
Não clique em *Remove* ainda — a Lovable continua no ar até a VPS estar conferida.

Copie o arquivo para a VPS:

```bash
scp ~/Downloads/<arquivo-exportado> root@<ip-da-vps>:/root/lovable.dump
```

## 2. Baixar o projeto na VPS

```bash
ssh root@<ip-da-vps>
git clone https://github.com/lfmororo/vigilant-web-haven.git /opt/vigilant-src
cd /opt/vigilant-src
cp deploy/vigilant.env.example deploy/vigilant.env
nano deploy/vigilant.env      # domínios, e-mail do SSL, GEMINI_API_KEY, Telegram/Evolution (se usar)
```

(Repositório privado: use um token do GitHub na URL ou uma chave SSH de deploy.)

## 3. Instalar

```bash
sudo bash deploy/install.sh --dump /root/lovable.dump
```

O script faz, nesta ordem:

1. Instala Docker (se faltar) e baixa a versão estável do Supabase auto-hospedado em `/opt/vigilant/supabase`, gerando chaves novas.
2. Copia as funções e liga o `verify_jwt` por função conforme `supabase/config.toml`.
3. Sobe os containers.
4. Restaura o backup: **usuários com as mesmas senhas**, todas as tabelas/dados/políticas, gatilhos, buckets e as tarefas agendadas (reapontadas para a VPS).
5. Copia os arquivos do Storage (logos, anexos, PDFs) do endereço antigo para a VPS.
6. Compila o painel e o `mororo-agent` com o endereço novo e publica em `/opt/vigilant/painel`.
7. Configura o proxy com HTTPS: usa o **nginx** ou o **Caddy** que já estiverem rodando; se a porta 80 estiver livre, instala o Caddy. Se a porta 80 for de um Traefik/nginx em Docker, ele deixa os modelos prontos em `/opt/vigilant/proxy/`.
8. Agenda backup diário do banco em `/opt/vigilant/backups` (14 dias).

No fim ele mostra os endereços, como abrir o Studio (painel do banco, só por túnel SSH) e onde estão as chaves.

## 4. Conferir

- Entre em https://painel.mororo.tech com seu usuário e senha de sempre.
- Abra chamados, clientes, inventário e o Monitor de Servidores.
- `/opt/vigilant/restore-report.json` lista o que foi restaurado (usuários, gatilhos, tarefas agendadas e eventuais erros).
- Tarefas agendadas: no Studio → *Integrations → Cron*, ou `docker exec -it supabase-db psql -U supabase_admin -c "select jobname, schedule, active from cron.job"`.
- Logs das funções: `cd /opt/vigilant/supabase && docker compose logs -f functions`.

## 5. Virar os agentes e integrações para o endereço novo

Os tokens dos agentes vieram no backup e continuam valendo — só o endereço muda para `https://api.mororo.tech`.

| Onde | O que mudar |
|---|---|
| **mororo-agent** (novo) | Rode o instalador de novo (baixe em *Agentes & Alertas*) **ou** troque `"url"` em `C:\ProgramData\MororoAgent\config.json` (Linux: `/etc/mororo-agent/config.json`) e reinicie o serviço *Mororo.Tech Agent*. |
| Agente Linux (`linux-agent.sh`) | `MONITOR_URL=` em `/etc/mororo-monitor.conf` (o agente lê o arquivo a cada 5 min; não precisa reiniciar). |
| Coletores Windows/SQL/Proxmox/iLO/iDRAC/VMware (serviços) | Reinstale com `instalar-agente-servico.ps1 -Url "https://api.mororo.tech"` (os pacotes baixados do painel novo já vêm com o endereço certo). |
| Coletores que usam `--key`/anon key (MikroTik VPS) | Endereço novo **e** a chave anon nova (`ANON_KEY` em `/opt/vigilant/supabase/.env`). |
| Webhook da Evolution API | `https://api.mororo.tech/functions/v1/whatsapp-webhook` |
| Google Drive (backup em nuvem) | No Google Cloud Console, adicione o novo endereço de retorno OAuth mostrado em *Backup*. |
| E-mails de recuperação de senha | Preencha `SMTP_*` no `deploy/vigilant.env` e rode o `install.sh` de novo. |

## 6. Desligar a Lovable Cloud

Quando tudo estiver conferido (deixe uns dias rodando junto se puder):
Lovable → **Cloud → Overview → Advanced settings → Remove**. Antes, faça um último *Export* e rode
`sudo bash deploy/install.sh --dump <novo-arquivo>` só se houve dados novos lá no meio tempo (em banco limpo).

---

## Dia a dia

```bash
cd /opt/vigilant-src && git pull && sudo bash deploy/install.sh   # publica mudanças (funções, migrações, painel)
cd /opt/vigilant/supabase && docker compose ps                     # estado dos containers
cd /opt/vigilant/supabase && docker compose logs -f functions      # logs das funções
ls /opt/vigilant/backups                                           # backups diários
```

- **Migrações novas** (`supabase/migrations` ou `drizzle/migrations`) são aplicadas automaticamente pelo `install.sh` e registradas em `_vigilant.migrations`.
- **Segredos das funções**: edite `deploy/vigilant.env` e rode o `install.sh` (eles vão para `/opt/vigilant/supabase/vigilant-functions.env`).
- **Restaurar um backup**: `docker exec -i supabase-db pg_restore -U supabase_admin -d postgres --clean --if-exists < /opt/vigilant/backups/vigilant-AAAA-MM-DD.dump`
- **Pesquisa na internet do diagnóstico do AD** (`ad-diagnostics-research`) usa um conector exclusivo da Lovable e fica indisponível fora dela.

## Se algo der errado

| Sintoma | Verifique |
|---|---|
| `install.sh` para em "O Supabase não respondeu" | `docker compose logs --tail 50` em `/opt/vigilant/supabase`; RAM livre (`free -m`). |
| Login não funciona | `docker compose logs auth`; o relatório mostra quantos `auth.users` foram importados. |
| Função retorna 401 | Se for chamada por agente/webhook, ela precisa de `verify_jwt = false` no `supabase/config.toml`. |
| Arquivos não aparecem | Rode de novo: `python3 deploy/lib/pull_storage.py --old-url <url-lovable> --new-url http://127.0.0.1:54321 --key <SERVICE_ROLE_KEY>` |
| HTTPS não emitiu | DNS dos dois domínios apontando para a VPS e portas 80/443 abertas no firewall. |
