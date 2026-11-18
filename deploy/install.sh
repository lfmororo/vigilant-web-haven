#!/usr/bin/env bash
# Instala o vigilant-web-haven na VPS: Supabase auto-hospedado (banco local, login, arquivos,
# funções) + painel React + proxy reverso com HTTPS.
#
#   sudo bash deploy/install.sh --dump /root/lovable.dump   # primeira vez, trazendo os dados da Lovable
#   sudo bash deploy/install.sh --fresh                     # primeira vez, banco vazio (só a estrutura)
#   sudo bash deploy/install.sh                             # atualizar (código, funções, migrações, painel)
#
# Configuração: deploy/vigilant.env (copie de deploy/vigilant.env.example).
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEPLOY="$REPO/deploy"
DUMP=""; FRESH=0; SKIP_PROXY=0; SKIP_STORAGE=0
while [ $# -gt 0 ]; do
  case "$1" in
    --dump) DUMP="$(readlink -f "$2")"; shift 2 ;;
    --fresh) FRESH=1; shift ;;
    --skip-proxy) SKIP_PROXY=1; shift ;;
    --skip-storage) SKIP_STORAGE=1; shift ;;
    -h|--help) sed -n 2,10p "$0"; exit 0 ;;
    *) echo "opção desconhecida: $1"; exit 2 ;;
  esac
done

say()  { printf '\n\033[1;36m▶ %s\033[0m\n' "$*"; }
ok()   { printf '  \033[32m✔\033[0m %s\n' "$*"; }
warn() { printf '  \033[33m!\033[0m %s\n' "$*"; }
die()  { printf '\n\033[31m✖ %s\033[0m\n' "$*"; exit 1; }

[ "$(id -u)" = 0 ] || die "Rode como root (sudo)."
[ -f "$DEPLOY/vigilant.env" ] || { cp "$DEPLOY/vigilant.env.example" "$DEPLOY/vigilant.env"; die "Preencha $DEPLOY/vigilant.env e rode de novo."; }
set -a; . "$DEPLOY/vigilant.env"; set +a
: "${PAINEL_DOMAIN:?}" "${API_DOMAIN:?}" "${INSTALL_DIR:=/opt/vigilant}"
: "${API_LOCAL_PORT:=54321}" "${DB_LOCAL_PORT:=54322}" "${POOLER_LOCAL_PORT:=54329}"
: "${OLD_SUPABASE_URL:=https://egbusmegupjfxqswdlxq.supabase.co}"
SB="$INSTALL_DIR/supabase"
API_URL="https://$API_DOMAIN"
PAINEL_URL="https://$PAINEL_DOMAIN"
FIRST=0; [ -f "$SB/.env" ] || FIRST=1
if [ $FIRST = 1 ] && [ -z "$DUMP" ] && [ $FRESH = 0 ]; then
  die "Primeira instalação: informe --dump <arquivo exportado da Lovable> ou --fresh."
fi
[ -z "$DUMP" ] || [ -f "$DUMP" ] || die "Arquivo não encontrado: $DUMP"

env_set() { # env_set arquivo CHAVE valor
  local f="$1" k="$2" v="$3" esc
  esc=$(printf '%s' "$v" | sed -e 's/[\/&|]/\\&/g')
  if grep -q "^$k=" "$f"; then sed -i "s|^$k=.*|$k=$esc|" "$f"; else printf '%s=%s\n' "$k" "$v" >> "$f"; fi
}
env_get() { grep -m1 "^$2=" "$1" | cut -d= -f2-; }

# ------------------------------------------------------------------ 1. dependências
say "Dependências do sistema"
if command -v apt-get >/dev/null; then
  DEBIAN_FRONTEND=noninteractive apt-get update -qq
  DEBIAN_FRONTEND=noninteractive apt-get install -y -qq git curl jq openssl ca-certificates python3 rsync >/dev/null
else
  warn "Sistema sem apt — garanta git, curl, jq, openssl, python3 e rsync instalados."
fi
if ! command -v docker >/dev/null; then
  curl -fsSL https://get.docker.com | sh
fi
docker compose version >/dev/null 2>&1 || die "Docker Compose v2 não encontrado."
CV=$(docker compose version --short | sed 's/^v//')
if [ "$(printf '%s\n2.24.4\n' "$CV" | sort -V | head -1)" != "2.24.4" ]; then
  die "Docker Compose $CV é antigo (precisa 2.24.4+). Atualize: apt-get install docker-compose-plugin"
fi
ok "Docker $(docker --version | awk '{print $3}' | tr -d ,) / Compose $CV"
FREE_MB=$(awk '/MemAvailable/ {print int($2/1024)}' /proc/meminfo)
[ "$FREE_MB" -ge 2500 ] || warn "Só ${FREE_MB} MB de RAM livres — o Supabase usa cerca de 2,5–4 GB. Considere aumentar a VPS ou criar swap."

# ------------------------------------------------------------------ 2. Supabase
say "Supabase auto-hospedado em $SB"
mkdir -p "$INSTALL_DIR"
if [ $FIRST = 1 ]; then
  TAG=$(git ls-remote --tags --refs https://github.com/supabase/supabase 'self-hosted/v*' | awk -F'refs/tags/' '{print $2}' | sort -V | tail -1)
  TMP=$(mktemp -d)
  git clone -q --depth 1 --filter=blob:none --sparse ${TAG:+--branch "$TAG"} https://github.com/supabase/supabase "$TMP/supabase"
  git -C "$TMP/supabase" sparse-checkout set docker
  mkdir -p "$SB"; cp -a "$TMP/supabase/docker/." "$SB/"; rm -rf "$TMP"
  echo "${TAG:-HEAD}" > "$SB/.vigilant-supabase-version"
  cp "$SB/.env.example" "$SB/.env"
  (cd "$SB" && sh utils/generate-keys.sh --update-env >/dev/null)
  chmod 600 "$SB/.env"
  ok "Supabase ${TAG:-HEAD} baixado e chaves geradas"
fi
E="$SB/.env"
API_EXT=$(env_get "$E" API_EXTERNAL_URL); case "$API_EXT" in */auth/v1) env_set "$E" API_EXTERNAL_URL "$API_URL/auth/v1" ;; *) env_set "$E" API_EXTERNAL_URL "$API_URL" ;; esac
env_set "$E" SUPABASE_PUBLIC_URL "$API_URL"
env_set "$E" SITE_URL "$PAINEL_URL"
env_set "$E" ADDITIONAL_REDIRECT_URLS "$PAINEL_URL/**"
env_set "$E" ENABLE_EMAIL_AUTOCONFIRM "${ENABLE_EMAIL_AUTOCONFIRM:-true}"
env_set "$E" STUDIO_DEFAULT_ORGANIZATION "Mororo.Tech"
env_set "$E" STUDIO_DEFAULT_PROJECT "vigilant-web-haven"
env_set "$E" FUNCTIONS_VERIFY_JWT "true"
env_set "$E" API_LOCAL_PORT "$API_LOCAL_PORT"
env_set "$E" DB_LOCAL_PORT "$DB_LOCAL_PORT"
env_set "$E" POOLER_LOCAL_PORT "$POOLER_LOCAL_PORT"
if [ -n "${SMTP_HOST:-}" ]; then
  for k in SMTP_HOST SMTP_PORT SMTP_USER SMTP_PASS SMTP_ADMIN_EMAIL SMTP_SENDER_NAME; do env_set "$E" "$k" "${!k:-}"; done
fi
# Funções com verify_jwt = false (agentes, webhooks, cron) — lidas do supabase/config.toml.
NOJWT=$(python3 - "$REPO/supabase/config.toml" <<'PY'
import re, sys
cur, out = None, []
for line in open(sys.argv[1], encoding="utf-8"):
    m = re.match(r'\s*\[functions\.([\w-]+)\]', line)
    if m: cur = m.group(1); continue
    if cur and re.match(r'\s*verify_jwt\s*=\s*false', line): out.append(cur)
print(",".join(out))
PY
)
env_set "$E" NO_VERIFY_JWT_FUNCTIONS "$NOJWT"
cp "$DEPLOY/templates/docker-compose.vigilant.yml" "$SB/docker-compose.vigilant.yml"
CF=$(env_get "$E" COMPOSE_FILE); [ -n "$CF" ] || CF="docker-compose.yml"
case ":$CF:" in *":docker-compose.vigilant.yml:"*) ;; *) env_set "$E" COMPOSE_FILE "$CF:docker-compose.vigilant.yml" ;; esac

# Segredos das funções
# Segredo do webhook do WhatsApp: gerado uma vez e guardado no vigilant.env.
if [ -z "${WHATSAPP_WEBHOOK_SECRET:-}" ]; then
  WHATSAPP_WEBHOOK_SECRET=$(openssl rand -hex 24)
  printf '\n# Gerado pelo install.sh: vai na URL do webhook da Evolution (?secret=...)\nWHATSAPP_WEBHOOK_SECRET=%s\n' "$WHATSAPP_WEBHOOK_SECRET" >> "$DEPLOY/vigilant.env"
fi
FENV="$SB/vigilant-functions.env"
{
  echo "# gerado por deploy/install.sh a partir de deploy/vigilant.env"
  echo "APP_BASE_URL=$PAINEL_URL"
  for k in GEMINI_API_KEY AI_MODEL TELEGRAM_BOT_TOKEN TELEGRAM_CHAT_ID EVOLUTION_API_KEY EVOLUTION_INSTANCE MONITOR_REQUIRE_TOKEN PARALLEL_API_KEY WHATSAPP_WEBHOOK_SECRET; do
    [ -n "${!k:-}" ] && echo "$k=${!k}"
  done
} > "$FENV"; chmod 600 "$FENV"

ANON=$(env_get "$E" ANON_KEY); SERVICE=$(env_get "$E" SERVICE_ROLE_KEY)

# ------------------------------------------------------------------ 3. funções
say "Edge Functions"
FN="$SB/volumes/functions"
rsync -a --delete --exclude main --exclude hello --exclude deno.jsonc "$REPO/supabase/functions/" "$FN/"
python3 - "$FN/main/index.ts" <<'PY'
import sys
p = sys.argv[1]; s = open(p, encoding="utf-8").read()
if "NO_VERIFY_JWT" not in s:
    old = "if (req.method !== 'OPTIONS' && VERIFY_JWT) {"
    if old not in s:
        sys.exit("Não consegui ajustar main/index.ts (versão nova do Supabase?). Verifique o verify_jwt por função.")
    s = s.replace(old, "if (req.method !== 'OPTIONS' && VERIFY_JWT && !NO_VERIFY_JWT.has(new URL(req.url).pathname.split('/')[1])) {")
    s = s.replace("const VERIFY_JWT =", "// vigilant: funções com verify_jwt = false (supabase/config.toml)\nconst NO_VERIFY_JWT = new Set((Deno.env.get('NO_VERIFY_JWT_FUNCTIONS') || '').split(',').map((s) => s.trim()).filter(Boolean))\nconst VERIFY_JWT =", 1)
    open(p, "w", encoding="utf-8").write(s)
PY
ok "$(ls -d "$FN"/*/ | grep -vc -e /main/ -e /hello/) funções sincronizadas ($(echo "$NOJWT" | tr ',' '\n' | grep -c .) sem verificação de JWT)"

# ------------------------------------------------------------------ 4. subir
say "Subindo os containers (a primeira vez demora alguns minutos)"
# Baixa só as imagens que ainda não existem (o Docker Hub às vezes estoura o tempo):
# em atualizações nada é baixado; numa instalação nova, tenta até 3 vezes, 2 por vez.
for t in 1 2 3; do
  (cd "$SB" && COMPOSE_PARALLEL_LIMIT=2 docker compose up -d --remove-orphans --pull missing) && break
  [ $t = 3 ] && die "Não consegui subir os containers (falha ao baixar imagens do Docker Hub). Rode o comando de novo em alguns minutos."
  warn "Falha ao subir/baixar imagens (tentativa $t de 3) — tentando de novo em 15 s"; sleep 15
done
for i in $(seq 1 90); do
  if docker exec supabase-db pg_isready -U postgres -h localhost >/dev/null 2>&1 && \
     curl -fs -o /dev/null "http://127.0.0.1:$API_LOCAL_PORT/auth/v1/health" -H "apikey: $ANON"; then break; fi
  sleep 4
done
curl -fs -o /dev/null "http://127.0.0.1:$API_LOCAL_PORT/auth/v1/health" -H "apikey: $ANON" || die "O Supabase não respondeu. Veja: cd $SB && docker compose ps && docker compose logs --tail 50"
(cd "$SB" && docker compose restart functions >/dev/null)
ok "Supabase no ar em 127.0.0.1:$API_LOCAL_PORT"

# ------------------------------------------------------------------ 5. banco
say "Banco de dados"
if [ -n "$DUMP" ]; then
  docker cp "$DUMP" supabase-db:/tmp/lovable.dump
  python3 "$DEPLOY/lib/restore_lovable.py" --exec "docker exec -i supabase-db" --dump /tmp/lovable.dump \
    --old-url "$OLD_SUPABASE_URL" --cron-url "http://kong:8000" --cron-key "$SERVICE" --report "$INSTALL_DIR/restore-report.json" \
    || die "A restauração falhou (veja acima)."
  CRONS=$(jq '.crons | length' "$INSTALL_DIR/restore-report.json")
  bash "$DEPLOY/lib/apply_migrations.sh" "$REPO" --baseline
  if [ "$CRONS" = 0 ]; then
    sed -e "s|__CRON_URL__|http://kong:8000|g" -e "s|__SERVICE_KEY__|$SERVICE|g" "$DEPLOY/sql/crons-padrao.sql" \
      | docker exec -i supabase-db psql -X -q -U supabase_admin -d postgres >/dev/null && ok "Tarefas agendadas padrão criadas"
  fi
  if [ $SKIP_STORAGE = 0 ]; then
    say "Arquivos (Storage) da Lovable → VPS"
    python3 "$DEPLOY/lib/pull_storage.py" --old-url "$OLD_SUPABASE_URL" --new-url "http://127.0.0.1:$API_LOCAL_PORT" --key "$SERVICE" \
      || warn "Alguns arquivos não foram copiados (veja storage-falhas.txt). Dá para rodar de novo depois."
  fi
elif [ $FRESH = 1 ] && [ $FIRST = 1 ]; then
  bash "$DEPLOY/lib/apply_migrations.sh" "$REPO"
  sed -e "s|__CRON_URL__|http://kong:8000|g" -e "s|__SERVICE_KEY__|$SERVICE|g" "$DEPLOY/sql/crons-padrao.sql" \
    | docker exec -i supabase-db psql -X -q -U supabase_admin -d postgres >/dev/null && ok "Tarefas agendadas criadas"
else
  bash "$DEPLOY/lib/apply_migrations.sh" "$REPO"
fi
# Links enviados nos e-mails/WhatsApp apontam para o painel novo.
if [ -n "$DUMP" ] || { [ $FRESH = 1 ] && [ $FIRST = 1 ]; }; then
  docker exec -i supabase-db psql -X -q -U supabase_admin -d postgres -c \
    "INSERT INTO public.system_settings (key, value, description) VALUES ('app_base_url', '$PAINEL_URL', 'Endereço do painel') ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;" >/dev/null \
    && ok "app_base_url = $PAINEL_URL" || warn "Não consegui ajustar app_base_url em system_settings."
fi

# ------------------------------------------------------------------ 6. painel + agentes
say "Compilando o painel e os agentes com os endereços novos"
BUILD="$INSTALL_DIR/build"
rm -rf "$BUILD"; mkdir -p "$BUILD"
rsync -a --exclude .git --exclude node_modules --exclude dist --exclude deploy/vigilant.env "$REPO/" "$BUILD/"
# Endereço antigo da Lovable → novo (scripts dos coletores e telas).
grep -rlF "$OLD_SUPABASE_URL" "$BUILD/public" "$BUILD/src" "$BUILD"/*.js 2>/dev/null | xargs -r sed -i "s#$OLD_SUPABASE_URL#$API_URL#g"
OLD_HOST=${OLD_SUPABASE_URL#https://}
grep -rlF "$OLD_HOST" "$BUILD/src" 2>/dev/null | xargs -r sed -i "s#$OLD_HOST#$API_DOMAIN#g"
cat > "$BUILD/.env" <<EOF
VITE_SUPABASE_URL="$API_URL"
VITE_SUPABASE_PUBLISHABLE_KEY="$ANON"
VITE_SUPABASE_PROJECT_ID="vigilant"
EOF
if [ -d "$BUILD/agent" ]; then
  # Além dos binários, gera os instaladores: Setup.exe e coletores (NSIS), MSI (wixl) e .deb/.rpm.
  docker run --rm -v "$BUILD:/src" -w /src/agent -e MONITOR_URL="$API_URL" -e ANON_KEY="$ANON" -e GOFLAGS=-mod=mod golang:1.24 \
    bash -c 'git config --global --add safe.directory "*" >/dev/null 2>&1
             (apt-get update -qq && DEBIAN_FRONTEND=noninteractive apt-get install -y -qq nsis wixl rpm npm >/dev/null 2>&1) \
               || echo "aviso: não consegui instalar nsis/wixl/rpm/npm — só os binários serão gerados"
             ./build.sh >/dev/null' \
    && ok "Agente e instaladores recompilados para $API_URL" || warn "Não consegui recompilar o mororo-agent (os downloads antigos continuam)."
fi
docker run --rm -v "$BUILD:/app" -w /app node:22 bash -c "npm install --no-audit --no-fund --loglevel=error >/dev/null && npm run build" >/dev/null \
  || die "O build do painel falhou. Rode manualmente: cd $BUILD && docker run --rm -it -v \$PWD:/app -w /app node:22 bash"
mkdir -p "$INSTALL_DIR/painel"
rsync -a --delete "$BUILD/dist/" "$INSTALL_DIR/painel/"
ok "Painel publicado em $INSTALL_DIR/painel"

# ------------------------------------------------------------------ 7. proxy e HTTPS
render() { sed -e "s|__PAINEL_DOMAIN__|$PAINEL_DOMAIN|g" -e "s|__API_DOMAIN__|$API_DOMAIN|g" \
               -e "s|__INSTALL_DIR__|$INSTALL_DIR|g" -e "s|__API_LOCAL_PORT__|$API_LOCAL_PORT|g" "$1"; }
if [ $SKIP_PROXY = 0 ]; then
  say "Proxy reverso e HTTPS"
  mkdir -p "$INSTALL_DIR/proxy"
  render "$DEPLOY/templates/nginx-vigilant.conf" > "$INSTALL_DIR/proxy/nginx-vigilant.conf"
  render "$DEPLOY/templates/Caddyfile" > "$INSTALL_DIR/proxy/Caddyfile"
  PORT80=$(ss -ltnp 2>/dev/null | awk '$4 ~ /:80$/ {print $NF}' | head -1)
  if command -v nginx >/dev/null && systemctl is-active --quiet nginx; then
    cp "$INSTALL_DIR/proxy/nginx-vigilant.conf" /etc/nginx/sites-available/vigilant.conf 2>/dev/null \
      || cp "$INSTALL_DIR/proxy/nginx-vigilant.conf" /etc/nginx/conf.d/vigilant.conf
    [ -d /etc/nginx/sites-enabled ] && ln -sf /etc/nginx/sites-available/vigilant.conf /etc/nginx/sites-enabled/vigilant.conf
    nginx -t && systemctl reload nginx
    if [ -n "${LETSENCRYPT_EMAIL:-}" ]; then
      command -v certbot >/dev/null || DEBIAN_FRONTEND=noninteractive apt-get install -y -qq certbot python3-certbot-nginx >/dev/null
      certbot --nginx -n --agree-tos -m "$LETSENCRYPT_EMAIL" --redirect -d "$PAINEL_DOMAIN" -d "$API_DOMAIN" \
        && ok "HTTPS ativo (Let's Encrypt)" || warn "Certificado não emitido: confira o DNS dos dois domínios e rode o certbot de novo."
    else
      warn "Defina LETSENCRYPT_EMAIL para emitir o HTTPS automaticamente."
    fi
    ok "nginx configurado"
  elif command -v caddy >/dev/null && systemctl is-active --quiet caddy; then
    cp "$INSTALL_DIR/proxy/Caddyfile" /etc/caddy/vigilant.caddy
    grep -q "import vigilant.caddy" /etc/caddy/Caddyfile || echo "import vigilant.caddy" >> /etc/caddy/Caddyfile
    systemctl reload caddy && ok "Caddy configurado (HTTPS automático)"
  elif [ -z "$PORT80" ]; then
    DEBIAN_FRONTEND=noninteractive apt-get install -y -qq debian-keyring debian-archive-keyring apt-transport-https gnupg >/dev/null
    curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg --yes
    curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' > /etc/apt/sources.list.d/caddy-stable.list
    apt-get update -qq && DEBIAN_FRONTEND=noninteractive apt-get install -y -qq caddy >/dev/null
    { [ -n "${LETSENCRYPT_EMAIL:-}" ] && printf '{\n    email %s\n}\n\n' "$LETSENCRYPT_EMAIL"; echo "import vigilant.caddy"; } > /etc/caddy/Caddyfile
    cp "$INSTALL_DIR/proxy/Caddyfile" /etc/caddy/vigilant.caddy
    systemctl enable --now caddy >/dev/null 2>&1; systemctl reload caddy
    ok "Caddy instalado (HTTPS automático)"
  else
    warn "A porta 80 já é usada por: $PORT80 (Traefik/nginx em Docker?)."
    warn "Configure o seu proxy com os modelos em $INSTALL_DIR/proxy/ (nginx-vigilant.conf ou Caddyfile):"
    warn "  $PAINEL_DOMAIN → arquivos em $INSTALL_DIR/painel   |   $API_DOMAIN → http://127.0.0.1:$API_LOCAL_PORT"
  fi
fi

# ------------------------------------------------------------------ 8. backup diário
cat > /etc/cron.d/vigilant-backup <<EOF
# Backup diário do banco do vigilant (mantém 14 dias)
30 3 * * * root mkdir -p $INSTALL_DIR/backups && docker exec supabase-db pg_dump -U supabase_admin -d postgres -Fc -n public -n auth -n storage > $INSTALL_DIR/backups/vigilant-\$(date +\%F).dump 2>/dev/null; find $INSTALL_DIR/backups -name 'vigilant-*.dump' -mtime +14 -delete
EOF
ok "Backup diário em $INSTALL_DIR/backups"

# ------------------------------------------------------------------ resumo
DASH_USER=$(env_get "$E" DASHBOARD_USERNAME); DASH_PASS=$(env_get "$E" DASHBOARD_PASSWORD)
cat <<EOF

────────────────────────────────────────────────────────────
 vigilant-web-haven instalado
   Painel:   $PAINEL_URL
   API:      $API_URL   (é este endereço que os agentes usam)
   Studio:   ssh -L $API_LOCAL_PORT:127.0.0.1:$API_LOCAL_PORT root@<vps>  →  http://127.0.0.1:$API_LOCAL_PORT
             usuário $DASH_USER / senha $DASH_PASS
   Chaves:   $E   (guarde uma cópia em local seguro)
   Relatório da restauração: $INSTALL_DIR/restore-report.json
   Webhook WhatsApp (Evolution): $API_URL/functions/v1/whatsapp-webhook?secret=$WHATSAPP_WEBHOOK_SECRET
 Atualizar depois de mudanças no GitHub:  cd $REPO && git pull && sudo bash deploy/install.sh --skip-proxy --skip-storage
────────────────────────────────────────────────────────────
EOF
