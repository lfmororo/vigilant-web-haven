# Cloud Backup — Node.js (OneDrive + Google Drive)

Script de linha de comando para copiar uma pasta local de um servidor para
**OneDrive** (Microsoft Graph) e/ou **Google Drive**, com autenticação OAuth 2.0,
backup incremental, retry automático e logs estruturados.

Arquivo: `cloud-backup.js` (baixe em `/cloud-backup.js` no seu app).

---

## 1. Requisitos

- Node.js **18 ou superior** (usa `fetch` nativo)
- Acesso de saída HTTPS para `graph.microsoft.com` e `googleapis.com`

## 2. Instalação

```bash
mkdir -p /opt/cloud-backup && cd /opt/cloud-backup
# copie cloud-backup.js para esta pasta
npm init -y
npm install googleapis @azure/msal-node yargs dotenv mime-types
```

## 3. Obtenção das credenciais

### Google Drive
1. Acesse <https://console.cloud.google.com/> → crie um projeto.
2. **APIs e serviços → Biblioteca** → ative a **Google Drive API**.
3. **Tela de consentimento OAuth** → tipo *Externo* → adicione seu e-mail como
   usuário de teste.
4. **Credenciais → Criar credenciais → ID do cliente OAuth → Aplicativo para computador**.
5. Em *URIs de redirecionamento autorizados*, adicione:
   `http://localhost:53682/callback`
6. Guarde o **Client ID** e o **Client Secret**.

### OneDrive (Microsoft)
1. Acesse <https://entra.microsoft.com/> → **Registros de aplicativo → Novo registro**.
2. Tipos de conta: *Contas em qualquer diretório organizacional e contas pessoais da Microsoft*.
3. Em **Autenticação**, habilite **Permitir fluxos de cliente público** (`Allow public client flows` = Sim).
   Isso é necessário para o *device code flow*.
4. Em **Permissões de API**, adicione as permissões delegadas do Microsoft Graph:
   `Files.ReadWrite` e `offline_access`.
5. Guarde o **Application (client) ID**. *Não é necessário client secret.*

## 4. Configuração (`.env`)

Crie um arquivo `.env` ao lado do script:

```ini
# --- Google Drive ---
GOOGLE_CLIENT_ID=xxxxxxxx.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-xxxxxxxx

# --- OneDrive / Microsoft Graph ---
MS_CLIENT_ID=00000000-0000-0000-0000-000000000000
MS_TENANT_ID=common          # ou o ID do seu tenant

# --- Padrões do backup (opcionais, podem vir por flag) ---
BACKUP_DIR=/var/dados/importante
BACKUP_PROVIDER=both         # google | onedrive | both
BACKUP_REMOTE_DIR=Backups/Servidor01
BACKUP_CONFLICT=overwrite    # overwrite | skip | rename
BACKUP_EXCLUDE=node_modules,.git,.tmp

# --- Operação ---
LOG_LEVEL=info               # debug | info | warn | error
OAUTH_PORT=53682
BACKUP_STATE_DIR=/opt/cloud-backup/.state
```

> **Segurança:** proteja o arquivo com `chmod 600 .env` e adicione-o ao `.gitignore`.
> Os tokens ficam em `~/.cloud-backup/tokens.json` (ou `BACKUP_STATE_DIR`) com permissão `0600`.
> Nenhum segredo é impresso nos logs.

## 5. Autorização (uma única vez por provedor)

```bash
node cloud-backup.js auth --provider google
node cloud-backup.js auth --provider onedrive
node cloud-backup.js status
```

- **Google:** abre uma URL; após aprovar, o navegador é redirecionado para o
  `localhost` do próprio script. Em servidor headless, faça um túnel SSH:
  `ssh -L 53682:localhost:53682 usuario@servidor`.
- **OneDrive:** usa *device code flow* — o terminal exibe um código para você
  digitar em <https://microsoft.com/devicelogin> a partir de qualquer dispositivo.

## 6. Uso

```bash
# Backup completo nos dois serviços
node cloud-backup.js run --dir /var/dados --provider both

# Somente Google Drive, pasta remota específica
node cloud-backup.js run -d /var/dados -p google -r "Backups/Financeiro"

# Simulação (não envia nada)
node cloud-backup.js run --dry-run

# Não sobrescrever arquivos existentes
node cloud-backup.js run --conflict skip

# Forçar reenvio de tudo (desliga o modo incremental)
node cloud-backup.js run --no-incremental

# Ignorar caminhos
node cloud-backup.js run -x node_modules -x .cache -x .git

# Revogar credenciais locais
node cloud-backup.js logout --provider onedrive
```

### Opções do comando `run`

| Flag | Padrão | Descrição |
|---|---|---|
| `--dir, -d` | `$BACKUP_DIR` | Pasta local a copiar (recursivo) |
| `--provider, -p` | `both` | `google`, `onedrive` ou `both` |
| `--remote, -r` | `Backups` | Pasta raiz de destino na nuvem |
| `--conflict, -c` | `overwrite` | `overwrite`, `skip` ou `rename` |
| `--exclude, -x` | `node_modules,.git` | Trechos de caminho ignorados |
| `--incremental` | `true` | Pula arquivos com hash SHA-256 inalterado |
| `--dry-run` | `false` | Simula sem enviar |

## 7. Agendamento

**Cron (Linux):**
```cron
0 2 * * * cd /opt/cloud-backup && /usr/bin/node cloud-backup.js run >> /var/log/cloud-backup.log 2>&1
```

**systemd timer:** `/etc/systemd/system/cloud-backup.service`
```ini
[Unit]
Description=Cloud Backup

[Service]
Type=oneshot
WorkingDirectory=/opt/cloud-backup
ExecStart=/usr/bin/node cloud-backup.js run
User=backup
```
`/etc/systemd/system/cloud-backup.timer`
```ini
[Unit]
Description=Executa o Cloud Backup diariamente

[Timer]
OnCalendar=*-*-* 02:00:00
Persistent=true

[Install]
WantedBy=timers.target
```
```bash
sudo systemctl enable --now cloud-backup.timer
```

**Windows (Agendador de Tarefas):**
```
Programa:   C:\Program Files\nodejs\node.exe
Argumentos: cloud-backup.js run
Iniciar em: C:\cloud-backup
```

## 8. Comportamento técnico

- **Estrutura de pastas** é replicada na nuvem sob a pasta remota raiz.
- **Arquivos grandes (≥ 4 MB)** no OneDrive usam *upload session* em blocos de 5 MB.
- **Retry** com backoff exponencial (3 tentativas) para erros de rede, `429` e `5xx`.
  Erros `4xx` permanentes (credencial inválida, permissão negada) falham imediatamente.
- **Falha isolada:** se um provedor estiver indisponível, o outro continua.
  Um arquivo com erro não interrompe o lote.
- **Código de saída `1`** quando há qualquer falha — útil para monitoramento no cron.
- **Escopos mínimos:** `drive.file` no Google (só acessa o que o script criou) e
  `Files.ReadWrite` no Graph.

## 9. Solução de problemas

| Sintoma | Causa provável / Solução |
|---|---|
| `Google não retornou refresh_token` | Revogue o app em <https://myaccount.google.com/permissions> e refaça o `auth`. |
| `AADSTS7000218` / erro no device code | Habilite *Allow public client flows* no registro do app. |
| `Graph 403` | Falta a permissão `Files.ReadWrite` ou o consentimento não foi concedido. |
| `Graph 401` após dias parado | Refresh token expirou (90 dias sem uso) — rode `auth` novamente. |
| `EADDRINUSE` na porta 53682 | Altere `OAUTH_PORT` no `.env` e o URI de redirecionamento no Google. |
| Timeout aguardando autorização | Use túnel SSH para expor o `localhost` do servidor. |
| Nada é enviado | Modo incremental achou tudo igual — use `--no-incremental`. |

## 10. Testes recomendados

```bash
node cloud-backup.js run --dry-run                 # valida varredura e config
node cloud-backup.js run -d ./teste-pequeno        # 1 arquivo pequeno
dd if=/dev/urandom of=./teste/grande.bin bs=1M count=50
node cloud-backup.js run -d ./teste                # valida upload em blocos
LOG_LEVEL=debug node cloud-backup.js run           # logs detalhados
```
Para testar credenciais inválidas, altere temporariamente `MS_CLIENT_ID` e
confirme que o script reporta o erro e sai com código `1`.
