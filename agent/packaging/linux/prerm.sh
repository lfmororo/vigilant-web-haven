#!/bin/sh
# mororo-agent — antes de remover o pacote (não roda em atualização).
case "$1" in
  remove|purge|0) /usr/local/bin/mororo-agent uninstall --quiet --keep-files >/dev/null 2>&1 || true ;;
esac
exit 0
