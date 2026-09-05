#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Coletor de trafego de rede para hosts Proxmox VE.
#
# Le os contadores das placas de rede diretamente do kernel (/proc/net/dev) —
# exatamente a mesma fonte usada pelo `nload` — e envia para a Edge Function
# `server-monitor-ingest`. Nao exige pacotes extras (apenas bash + curl).
#
# Uso (rodar NO host Proxmox):
#   ./proxmox-net-collector.sh --url "https://<projeto>.supabase.co" \
#       --key "<ANON_KEY>" [--node-id <uuid>] [--interfaces "vmbr0,eno1"] \
#       [--intervalo 60] [--uma-vez]
#
# Sem --node-id, o host e identificado pelo hostname (deve coincidir com o
# nome do no cadastrado no painel).
# ---------------------------------------------------------------------------
set -uo pipefail

URL=""
KEY=""
NODE_ID=""
IFACES=""
INTERVALO=60
UMA_VEZ=0

while [ $# -gt 0 ]; do
  case "$1" in
    --url) URL="${2:-}"; shift 2 ;;
    --key) KEY="${2:-}"; shift 2 ;;
    --node-id) NODE_ID="${2:-}"; shift 2 ;;
    --interfaces) IFACES="${2:-}"; shift 2 ;;
    --intervalo) INTERVALO="${2:-60}"; shift 2 ;;
    --uma-vez|--once) UMA_VEZ=1; shift ;;
    *) echo "Argumento desconhecido: $1" >&2; exit 1 ;;
  esac
done

if [ -z "$URL" ] || [ -z "$KEY" ]; then
  echo "Uso: $0 --url <SUPABASE_URL> --key <ANON_KEY> [--node-id <uuid>] [--interfaces \"vmbr0,eno1\"] [--intervalo 60] [--uma-vez]" >&2
  exit 1
fi

INGEST="${URL%/}/functions/v1/server-monitor-ingest"
HOSTNAME_LOCAL="$(hostname -s 2>/dev/null || hostname)"

# Interfaces ignoradas por padrao (loopback e pseudo-dispositivos).
ignorar() {
  case "$1" in
    lo|veth*|fwln*|fwpr*|tap*|docker*|br-*) return 0 ;;
    *) return 1 ;;
  esac
}

# Quando o usuario informa uma lista, apenas ela e considerada.
selecionada() {
  [ -z "$IFACES" ] && return 0
  case ",$IFACES," in
    *",$1,"*) return 0 ;;
    *) return 1 ;;
  esac
}

declare -A ANT_RX ANT_TX
ANT_TS=0

coletar() {
  local agora payload primeiro linha nome rx tx rxerr txerr rx_rate tx_rate delta oper mac speed
  agora=$(date +%s)
  delta=$(( agora - ANT_TS ))
  payload=""
  primeiro=1

  while read -r linha; do
    nome="${linha%%:*}"
    nome="$(echo "$nome" | tr -d ' ')"
    [ -z "$nome" ] && continue
    ignorar "$nome" && continue
    selecionada "$nome" || continue

    # Campos apos os ":" -> 1=rx_bytes 3=rx_errs 9=tx_bytes 11=tx_errs
    set -- $(echo "${linha#*:}")
    rx="${1:-0}"; rxerr="${3:-0}"; tx="${9:-0}"; txerr="${11:-0}"

    rx_rate="null"; tx_rate="null"
    if [ "$ANT_TS" -gt 0 ] && [ "$delta" -gt 0 ] && [ -n "${ANT_RX[$nome]:-}" ]; then
      if [ "$rx" -ge "${ANT_RX[$nome]}" ] && [ "$tx" -ge "${ANT_TX[$nome]}" ]; then
        rx_rate=$(( (rx - ANT_RX[$nome]) * 8 / delta ))
        tx_rate=$(( (tx - ANT_TX[$nome]) * 8 / delta ))
      fi
    fi
    ANT_RX[$nome]=$rx
    ANT_TX[$nome]=$tx

    oper="$(cat "/sys/class/net/$nome/operstate" 2>/dev/null || echo unknown)"
    mac="$(cat "/sys/class/net/$nome/address" 2>/dev/null || echo '')"
    speed="$(cat "/sys/class/net/$nome/speed" 2>/dev/null || echo '')"
    case "$speed" in ''|*[!0-9-]*) speed="null" ;; esac
    [ "$speed" = "-1" ] && speed="null"

    [ $primeiro -eq 0 ] && payload="$payload,"
    primeiro=0
    payload="$payload{\"interface_name\":\"$nome\",\"status\":\"$oper\",\"mac_address\":\"$mac\",\"speed_mbps\":$speed,\"rx_bytes\":$rx,\"tx_bytes\":$tx,\"rx_rate_bps\":$rx_rate,\"tx_rate_bps\":$tx_rate,\"rx_errors\":$rxerr,\"tx_errors\":$txerr}"
  done < <(tail -n +3 /proc/net/dev)

  ANT_TS=$agora

  if [ -z "$payload" ]; then
    echo "[$(date -Is)] Nenhuma interface para enviar."
    return
  fi

  local body resp
  body="{\"type\":\"proxmox-net\",\"node_id\":\"$NODE_ID\",\"hostname\":\"$HOSTNAME_LOCAL\",\"interfaces\":[$payload]}"
  resp=$(curl -sS -m 30 -X POST "$INGEST" \
    -H "Content-Type: application/json" \
    -H "apikey: $KEY" \
    -H "Authorization: Bearer $KEY" \
    --data "$body" 2>&1)

  if echo "$resp" | grep -q '"success"'; then
    echo "[$(date -Is)] Trafego enviado ($HOSTNAME_LOCAL)."
  else
    echo "[$(date -Is)] Falha ao enviar: $resp" >&2
  fi
}

# Primeira leitura serve de linha de base para calcular a velocidade.
coletar
if [ "$UMA_VEZ" -eq 1 ]; then
  sleep 5
  coletar
  exit 0
fi

echo "Coletor de trafego Proxmox ativo — intervalo de ${INTERVALO}s (Ctrl+C para sair)."
while true; do
  sleep "$INTERVALO"
  coletar
done
