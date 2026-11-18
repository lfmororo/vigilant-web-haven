#!/bin/sh
# mororo-agent — após instalar/atualizar o pacote.
#   Instalação nova:  sudo MORORO_TOKEN=mt_xxx MORORO_ROLE=server apt install ./mororo-agent_*.deb
#                     (ou depois: sudo mororo-agent install --token mt_xxx --role server --quiet)
#   Atualização:      reinstala o serviço com a configuração já salva.
set -e
BIN=/usr/local/bin/mororo-agent
if [ -n "${MORORO_TOKEN:-}" ]; then
  "$BIN" install --token "$MORORO_TOKEN" --role "${MORORO_ROLE:-server}" ${MORORO_URL:+--url "$MORORO_URL"} --quiet --no-arp || {
    echo "mororo-agent: não foi possível ativar com o token informado. Rode: sudo mororo-agent install --token <TOKEN> --quiet"; exit 0; }
elif [ -f /etc/mororo-agent/config.json ]; then
  "$BIN" install --quiet --no-arp --reuse >/dev/null 2>&1 || true
else
  echo ""
  echo "Mororo.Tech Agent instalado. Para ativar neste servidor:"
  echo "  sudo mororo-agent install --token <TOKEN_DO_CLIENTE> --role server --quiet"
  echo "ou abra o assistente (varre a rede): sudo mororo-agent install"
  echo ""
fi
exit 0
