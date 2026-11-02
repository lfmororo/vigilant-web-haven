#!/usr/bin/env bash
# =============================================================================
# Agente de monitoramento Linux — Mororo.tech — v1.0.0
# Bash puro + curl (sem jq).
#
# Uso:
#   sudo bash linux-agent.sh install --token <MONITOR_TOKEN> [--url URL] \
#        [--server-id UUID] [--services "nginx postgresql"]
#   mororo-linux-agent run [--verbose]
#   sudo mororo-linux-agent uninstall
#
# O install copia o agente para /usr/local/bin/mororo-linux-agent, grava
# /etc/mororo-monitor.conf (permissão 600), cria um timer systemd a cada 5 min
# (ou cron, se não houver systemd) e roda a primeira coleta.
# Sem --server-id o servidor é cadastrado automaticamente pelo hostname
# (o token precisa estar vinculado a um cliente).
# =============================================================================
set -u

AGENT_VERSION="1.0.0"
DEFAULT_URL="https://egbusmegupjfxqswdlxq.supabase.co"
BIN_PATH="/usr/local/bin/mororo-linux-agent"
CONF_FILE="/etc/mororo-monitor.conf"
STATE_DIR="/var/lib/mororo-monitor"
UNIT_NAME="mororo-linux-agent"
VERBOSE=0

log() { [ "$VERBOSE" = "1" ] && echo "[$(date '+%F %T')] $*" >&2; return 0; }
die() { echo "ERRO: $*" >&2; exit 1; }

# ---------------------------------------------------------------- JSON helpers
json_str() {
  # Escapa string para JSON: \ " e caracteres de controle.
  local s="${1-}"
  s="${s//\\/\\\\}"
  s="${s//\"/\\\"}"
  s="${s//$'\n'/\\n}"
  s="${s//$'\r'/\\r}"
  s="${s//$'\t'/\\t}"
  s=$(printf '%s' "$s" | tr -d '\000-\010\013\014\016-\037')
  printf '"%s"' "$s"
}
json_num() { case "${1-}" in ''|*[!0-9.-]*) printf 'null' ;; *) printf '%s' "$1" ;; esac; }
json_bool() { [ "${1-}" = "1" ] || [ "${1-}" = "true" ] && printf 'true' || printf 'false'; }
join_by_comma() { local IFS=,; printf '%s' "$*"; }

# ---------------------------------------------------------------- install
cmd_install() {
  local token="" url="$DEFAULT_URL" server_id="" services=""
  while [ $# -gt 0 ]; do
    case "$1" in
      --token) token="${2-}"; shift 2 ;;
      --url) url="${2-}"; shift 2 ;;
      --server-id) server_id="${2-}"; shift 2 ;;
      --services) services="${2-}"; shift 2 ;;
      *) die "parâmetro desconhecido: $1" ;;
    esac
  done
  [ "$(id -u)" = "0" ] || die "execute o install como root (sudo)."
  [ -n "$token" ] || token="${MONITOR_TOKEN-}"
  [ -n "$token" ] || die "informe --token <MONITOR_TOKEN>."
  command -v curl >/dev/null 2>&1 || die "curl não encontrado. Instale: apt install curl  ou  dnf install curl"

  install -m 755 "$0" "$BIN_PATH" || die "falha ao copiar para $BIN_PATH"
  mkdir -p "$STATE_DIR" && chmod 700 "$STATE_DIR"
  [ -n "$server_id" ] && printf '%s' "$server_id" > "$STATE_DIR/server_id"

  ( umask 077
    {
      echo "# Configuração do agente Mororo.tech (gerado em $(date '+%F %T'))"
      printf 'MONITOR_URL=%q\n' "${url%/}"
      printf 'MONITOR_TOKEN=%q\n' "$token"
      printf 'MONITOR_SERVICES=%q\n' "$services"
    } > "$CONF_FILE" )
  chmod 600 "$CONF_FILE"

  if command -v systemctl >/dev/null 2>&1 && [ -d /run/systemd/system ]; then
    cat > "/etc/systemd/system/$UNIT_NAME.service" <<EOF
[Unit]
Description=Mororo.tech - coleta de monitoramento Linux
After=network-online.target
Wants=network-online.target

[Service]
Type=oneshot
ExecStart=$BIN_PATH run
Nice=10
TimeoutStartSec=240
EOF
    cat > "/etc/systemd/system/$UNIT_NAME.timer" <<EOF
[Unit]
Description=Mororo.tech - coleta a cada 5 minutos

[Timer]
OnBootSec=1min
OnUnitActiveSec=5min
AccuracySec=15s
Persistent=true

[Install]
WantedBy=timers.target
EOF
    systemctl daemon-reload
    systemctl enable --now "$UNIT_NAME.timer" >/dev/null 2>&1 || die "falha ao ativar o timer systemd"
    echo "Timer systemd ativo: $UNIT_NAME.timer (a cada 5 min)"
  else
    echo "*/5 * * * * root $BIN_PATH run >/dev/null 2>&1" > /etc/cron.d/$UNIT_NAME
    chmod 644 /etc/cron.d/$UNIT_NAME
    echo "systemd não encontrado — agendado via /etc/cron.d/$UNIT_NAME"
  fi

  echo "Executando a primeira coleta..."
  VERBOSE=1 "$BIN_PATH" run --verbose && echo "Instalação concluída." || echo "A primeira coleta falhou; veja a mensagem acima."
}

cmd_uninstall() {
  [ "$(id -u)" = "0" ] || die "execute como root (sudo)."
  if command -v systemctl >/dev/null 2>&1; then
    systemctl disable --now "$UNIT_NAME.timer" >/dev/null 2>&1
    rm -f "/etc/systemd/system/$UNIT_NAME.timer" "/etc/systemd/system/$UNIT_NAME.service"
    systemctl daemon-reload >/dev/null 2>&1
  fi
  rm -f "/etc/cron.d/$UNIT_NAME" "$BIN_PATH" "$CONF_FILE"
  rm -rf "$STATE_DIR"
  echo "Agente removido."
}

# ---------------------------------------------------------------- coleta
read_cpu() { awk '/^cpu /{print $2+$3+$4+$5+$6+$7+$8+$9, $5+$6, $6}' /proc/stat; }

collect_cpu() {
  local a b
  a=$(read_cpu); sleep 2; b=$(read_cpu)
  # total idle(idle+iowait) iowait
  set -- $a $b
  awk -v t1="$1" -v i1="$2" -v w1="$3" -v t2="$4" -v i2="$5" -v w2="$6" 'BEGIN{
    t=t2-t1; i=i2-i1; w=w2-w1;
    printf "%.1f %.1f", (t>0 ? (t-i)*100/t : 0), (t>0 ? w*100/t : 0) }'
}

collect_disks() {
  local items=() line fstype mount total used pct ipct
  declare -A inodes=()
  while read -r m p; do inodes["$m"]="$p"; done < <(df -Pi 2>/dev/null | awk 'NR>1{gsub("%","",$5); print $6, $5}')
  while read -r fstype total used pct mount; do
    case "$fstype" in tmpfs|devtmpfs|overlay|squashfs|fuse.*|iso9660|nsfs|ramfs) continue ;; esac
    ipct="${inodes[$mount]-}"; [ "$ipct" = "-" ] && ipct=""
    items+=("{\"mount\":$(json_str "$mount"),\"fstype\":$(json_str "$fstype"),\"pct\":$(json_num "$pct"),\"inode_pct\":$(json_num "$ipct"),\"total_gb\":$(awk -v k="$total" 'BEGIN{printf "%.1f", k/1048576}'),\"used_gb\":$(awk -v k="$used" 'BEGIN{printf "%.1f", k/1048576}')}")
  done < <(df -PT -k 2>/dev/null | awk 'NR>1{gsub("%","",$6); print $2, $3, $4, $6, $7}')
  printf '[%s]' "$(join_by_comma "${items[@]}")"
}

collect_services() {
  local items=() svc st
  for svc in ${MONITOR_SERVICES-}; do
    st=$(systemctl is-active "$svc" 2>/dev/null | head -n1)
    [ -n "$st" ] || st="unknown"
    items+=("{\"name\":$(json_str "$svc"),\"status\":$(json_str "$st")}")
  done
  printf '[%s]' "$(join_by_comma "${items[@]}")"
}

collect_failed_units() {
  local items=() u
  command -v systemctl >/dev/null 2>&1 || { printf '[]'; return; }
  while read -r u; do
    [ -n "$u" ] && items+=("$(json_str "$u")")
  done < <(systemctl --failed --no-legend --plain 2>/dev/null | awk '{print $1}' | head -n 50)
  printf '[%s]' "$(join_by_comma "${items[@]}")"
}

collect_raid() {
  local items=() dev state status degraded
  [ -r /proc/mdstat ] || { printf '[]'; return; }
  while read -r dev state status; do
    degraded=0; case "$status" in *_*) degraded=1 ;; esac
    items+=("{\"device\":$(json_str "$dev"),\"state\":$(json_str "$state $status"),\"degraded\":$(json_bool $degraded)}")
  done < <(awk '/^md[0-9]+ :/{d=$1; s=$3; getline; st=$NF; print d, s, st}' /proc/mdstat)
  printf '[%s]' "$(join_by_comma "${items[@]}")"
}

collect_zfs() {
  local items=() name health cap errs
  command -v zpool >/dev/null 2>&1 || { printf '[]'; return; }
  while read -r name health cap; do
    [ -n "$name" ] || continue
    errs=$(zpool status -x "$name" 2>/dev/null | grep -q "is healthy" && echo "" || zpool status "$name" 2>/dev/null | awk '/^errors:/{sub(/^errors: */,""); print}')
    items+=("{\"name\":$(json_str "$name"),\"health\":$(json_str "$health"),\"capacity_pct\":$(json_num "${cap%\%}"),\"errors\":$(json_str "$errs")}")
  done < <(zpool list -H -o name,health,capacity 2>/dev/null)
  printf '[%s]' "$(join_by_comma "${items[@]}")"
}

collect_smart() {
  local cache="$STATE_DIR/smart.json" now age
  command -v smartctl >/dev/null 2>&1 || { printf '[]'; return; }
  now=$(date +%s)
  if [ -f "$cache" ]; then
    age=$(( now - $(stat -c %Y "$cache" 2>/dev/null || echo 0) ))
    [ "$age" -lt 3600 ] && { cat "$cache"; return; }
  fi
  local items=() dev type res passed
  while read -r dev _ type _; do
    [ -n "$dev" ] || continue
    res=$(smartctl -H -d "$type" "$dev" 2>/dev/null | awk -F: '/overall-health|Health Status/{gsub(/^ +/,"",$2); print $2; exit}')
    [ -n "$res" ] || continue
    passed=0; case "$res" in PASSED*|OK*) passed=1 ;; esac
    items+=("{\"device\":$(json_str "$dev"),\"passed\":$(json_bool $passed),\"result\":$(json_str "$res")}")
  done < <(smartctl --scan 2>/dev/null)
  local out; out=$(printf '[%s]' "$(join_by_comma "${items[@]}")")
  printf '%s' "$out" > "$cache" 2>/dev/null
  printf '%s' "$out"
}

collect_updates() {
  # Saída: "<pendentes> <segurança>" com cache de 6h
  local cache="$STATE_DIR/updates.txt" now age p=0 s=0
  now=$(date +%s)
  if [ -f "$cache" ]; then
    age=$(( now - $(stat -c %Y "$cache" 2>/dev/null || echo 0) ))
    [ "$age" -lt 21600 ] && { cat "$cache"; return; }
  fi
  if command -v apt-get >/dev/null 2>&1; then
    local lst; lst=$(apt-get -s -o Debug::NoLocking=true upgrade 2>/dev/null | grep '^Inst ')
    p=$(printf '%s\n' "$lst" | grep -c '^Inst ')
    s=$(printf '%s\n' "$lst" | grep -ci 'securi')
  elif command -v dnf >/dev/null 2>&1; then
    p=$(dnf -q check-update 2>/dev/null | awk 'NF==3 && $1 !~ /^(Last|Obsoleting)/' | wc -l)
    s=$(dnf -q updateinfo list --security 2>/dev/null | wc -l)
  elif command -v yum >/dev/null 2>&1; then
    p=$(yum -q check-update 2>/dev/null | awk 'NF==3' | wc -l)
  fi
  printf '%s %s' "${p:-0}" "${s:-0}" > "$cache" 2>/dev/null
  printf '%s %s' "${p:-0}" "${s:-0}"
}

collect_top() {
  local items=() pid cpu mem cmd
  while read -r pid cpu mem cmd; do
    items+=("{\"pid\":$(json_num "$pid"),\"name\":$(json_str "$cmd"),\"cpu_pct\":$(json_num "$cpu"),\"mem_pct\":$(json_num "$mem")}")
  done < <(ps -eo pid=,pcpu=,pmem=,comm= --sort=-pcpu 2>/dev/null | head -n 5)
  printf '[%s]' "$(join_by_comma "${items[@]}")"
}

api_post() {
  # $1 = função, $2 = corpo JSON
  curl -sS -m 30 -X POST "$MONITOR_URL/functions/v1/$1" \
    -H "Content-Type: application/json; charset=utf-8" \
    -H "x-monitor-token: $MONITOR_TOKEN" \
    --data-binary "$2" -w '\n%{http_code}'
}

cmd_run() {
  [ "${1-}" = "--verbose" ] && VERBOSE=1
  [ -r "$CONF_FILE" ] && . "$CONF_FILE"
  MONITOR_URL="${MONITOR_URL:-$DEFAULT_URL}"; MONITOR_URL="${MONITOR_URL%/}"
  [ -n "${MONITOR_TOKEN-}" ] || die "token ausente em $CONF_FILE (rode o install)."
  mkdir -p "$STATE_DIR" 2>/dev/null

  log "Coletando métricas..."
  local cpu iowait; read -r cpu iowait <<<"$(collect_cpu)"
  local cores; cores=$(nproc 2>/dev/null || grep -c ^processor /proc/cpuinfo)
  local cpu_model; cpu_model=$(awk -F: '/model name/{gsub(/^ +/,"",$2); print $2; exit}' /proc/cpuinfo)
  local l1 l5 l15; read -r l1 l5 l15 _ < /proc/loadavg
  local mem; mem=$(awk '/^MemTotal:/{t=$2} /^MemAvailable:/{a=$2} /^SwapTotal:/{st=$2} /^SwapFree:/{sf=$2}
    END{u=t-a; printf "%.2f %.2f %.1f %.2f %.2f", t/1048576, u/1048576, (t>0 ? u*100/t : 0), st/1048576, (st-sf)/1048576}' /proc/meminfo)
  local ram_t ram_u ram_p sw_t sw_u; read -r ram_t ram_u ram_p sw_t sw_u <<<"$mem"
  local uptime_s; uptime_s=$(awk '{printf "%d", $1}' /proc/uptime)
  local distro="Linux"; [ -r /etc/os-release ] && distro=$(. /etc/os-release; echo "${PRETTY_NAME:-$NAME}")
  local kernel; kernel=$(uname -r)
  local hostname; hostname=$(hostname -f 2>/dev/null || hostname)
  local ip; ip=$(ip -4 route get 1.1.1.1 2>/dev/null | awk '{for(i=1;i<=NF;i++) if($i=="src"){print $(i+1); exit}}')
  [ -n "$ip" ] || ip=$(hostname -I 2>/dev/null | awk '{print $1}')
  local reboot=0; [ -f /var/run/reboot-required ] && reboot=1
  if [ "$reboot" = "0" ] && command -v needs-restarting >/dev/null 2>&1; then
    needs-restarting -r >/dev/null 2>&1; [ $? -eq 1 ] && reboot=1
  fi
  local upd sec; read -r upd sec <<<"$(collect_updates)"

  MAX_DISK=0
  local disks; disks=$(collect_disks)
  MAX_DISK=$(df -PT 2>/dev/null | awk 'NR>1 && $2!~/^(tmpfs|devtmpfs|overlay|squashfs|iso9660|fuse\.)/{gsub("%","",$6); if($6+0>m)m=$6+0} END{print m+0}')
  local services; services=$(collect_services)
  local failed; failed=$(collect_failed_units)
  local raid; raid=$(collect_raid)
  local zfs; zfs=$(collect_zfs)
  local smart; smart=$(collect_smart)
  local top; top=$(collect_top)

  local server_id=""; [ -s "$STATE_DIR/server_id" ] && server_id=$(cat "$STATE_DIR/server_id")
  local sid_json="null"; [ -n "$server_id" ] && sid_json=$(json_str "$server_id")

  local body
  body="{\"type\":\"linux\",\"server_id\":$sid_json,\"status\":\"online\",\"host\":$(json_str "$ip"),\"agent_version\":\"$AGENT_VERSION\","
  body+="\"info\":{\"hostname\":$(json_str "$hostname"),\"ip\":$(json_str "$ip"),\"distro\":$(json_str "$distro"),\"kernel\":$(json_str "$kernel"),"
  body+="\"cpu_model\":$(json_str "$cpu_model"),\"cpu_cores\":$(json_num "$cores"),\"cpu_usage_pct\":$(json_num "$cpu"),\"iowait_pct\":$(json_num "$iowait"),"
  body+="\"load_1\":$(json_num "$l1"),\"load_5\":$(json_num "$l5"),\"load_15\":$(json_num "$l15"),"
  body+="\"ram_total_gb\":$(json_num "$ram_t"),\"ram_used_gb\":$(json_num "$ram_u"),\"ram_usage_pct\":$(json_num "$ram_p"),"
  body+="\"swap_total_gb\":$(json_num "$sw_t"),\"swap_used_gb\":$(json_num "$sw_u"),\"disk_usage_pct\":$(json_num "$MAX_DISK"),"
  body+="\"pending_updates\":$(json_num "$upd"),\"security_updates\":$(json_num "$sec"),\"reboot_required\":$(json_bool $reboot),"
  body+="\"uptime_seconds\":$(json_num "$uptime_s"),\"agent_version\":\"$AGENT_VERSION\"},"
  body+="\"disks\":$disks,\"services\":$services,\"failed_units\":$failed,\"raid\":$raid,\"zfs\":$zfs,\"smart\":$smart,\"top_processes\":$top}"

  log "CPU ${cpu}% iowait ${iowait}% RAM ${ram_p}% disco max ${MAX_DISK}%"
  [ "$VERBOSE" = "1" ] && log "Payload: $body"

  api_post "agent-heartbeat" "{\"agent_type\":\"linux\",\"version\":\"$AGENT_VERSION\",\"host\":$(json_str "$hostname")}" >/dev/null 2>&1

  local resp code
  resp=$(api_post "server-monitor-ingest" "$body") || die "falha de rede ao enviar para $MONITOR_URL"
  code=$(printf '%s' "$resp" | tail -n1)
  resp=$(printf '%s' "$resp" | sed '$d')
  log "HTTP $code: $resp"
  if [ "$code" != "200" ]; then
    echo "ERRO: envio retornou HTTP $code: $resp" >&2
    exit 1
  fi
  local new_id; new_id=$(printf '%s' "$resp" | sed -n 's/.*"server_id"[[:space:]]*:[[:space:]]*"\([0-9a-fA-F-]\{36\}\)".*/\1/p')
  if [ -n "$new_id" ] && [ "$new_id" != "$server_id" ]; then
    printf '%s' "$new_id" > "$STATE_DIR/server_id" 2>/dev/null
    log "server_id salvo: $new_id"
  fi
  [ "$VERBOSE" = "1" ] && echo "Coleta enviada com sucesso (server_id ${new_id:-$server_id})."
  return 0
}

case "${1-}" in
  install) shift; cmd_install "$@" ;;
  run) shift; cmd_run "$@" ;;
  uninstall) shift; cmd_uninstall ;;
  version|--version) echo "$AGENT_VERSION" ;;
  *) echo "Uso: $0 install --token X [--url URL] [--server-id ID] [--services \"nginx postgresql\"] | run [--verbose] | uninstall"; exit 1 ;;
esac
