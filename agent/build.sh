#!/usr/bin/env bash
# Compila o mororo-agent e publica em public/downloads (servido pelo site do vigilant).
#   ./build.sh            usa a versão do main.go
#   VERSION=1.0.1 ./build.sh
set -euo pipefail
cd "$(dirname "$0")"
VERSION="${VERSION:-$(grep -oP 'Version\s*=\s*"\K[^"]+' main.go | head -1)}"
URL="${MONITOR_URL:-https://egbusmegupjfxqswdlxq.supabase.co}"
OUT="../public/downloads"
mkdir -p "$OUT"
export CGO_ENABLED=0 GOTOOLCHAIN=local GOFLAGS=-mod=mod
LDF="-s -w -X main.Version=${VERSION} -X main.DefaultURL=${URL}"

if command -v go-winres >/dev/null; then
  go-winres make --in winres/winres.json --arch amd64,386,arm64 --product-version "$VERSION" --file-version "$VERSION"
fi

GOOS=windows GOARCH=amd64 go build -trimpath -ldflags "$LDF -H windowsgui" -o "$OUT/mororo-agent.exe" .
GOOS=linux   GOARCH=amd64 go build -trimpath -ldflags "$LDF" -o "$OUT/mororo-agent-linux-amd64" .
GOOS=linux   GOARCH=arm64 go build -trimpath -ldflags "$LDF" -o "$OUT/mororo-agent-linux-arm64" .

# ---------------------------------------------------------------- instaladores
# Cada um é opcional: se a ferramenta não existir, o passo é pulado (o .exe continua valendo).
ANON_KEY="${ANON_KEY:-}"
PUB="$(cd ../public && pwd)"
ABS_OUT="$(cd "$OUT" && pwd)"
ARTS=(mororo-agent.exe mororo-agent-linux-amd64 mororo-agent-linux-arm64)

if command -v makensis >/dev/null; then
  ( cd packaging/nsis && makensis -V2 -DVERSION="$VERSION" -DURL="$URL" -DSRC="$ABS_OUT" \
      -DOUT="$ABS_OUT/mororo-agent-setup.exe" agent-setup.nsi ) && ARTS+=(mororo-agent-setup.exe)

  # Coletores avulsos: empacota ssh2/axios/ping (VMware e DVR) junto.
  if command -v npm >/dev/null; then
    NM="$(mktemp -d)"
    ( cd "$NM" && npm init -y >/dev/null && npm install --omit=optional --no-audit --no-fund ssh2 axios ping >/dev/null )
    ( cd packaging/nsis && makensis -V2 -DVERSION="$VERSION" -DURL="$URL" -DANONKEY="$ANON_KEY" -DSRC="$PUB" \
        -DNODEMODS="$NM/node_modules" -DOUT="$ABS_OUT/mororo-coletores-setup.exe" coletores-setup.nsi ) \
      && ARTS+=(mororo-coletores-setup.exe)
    rm -rf "$NM"
  else
    echo "npm ausente: instalador dos coletores não gerado"
  fi
else
  echo "makensis ausente: Setup.exe não gerado (apt install nsis)"
fi

if command -v wixl >/dev/null; then
  ( cd packaging/wix && wixl -a x64 -D Version="$VERSION" -D Url="$URL" -D Src="$ABS_OUT" \
      -o "$ABS_OUT/mororo-agent.msi" agent.wxs ) && ARTS+=(mororo-agent.msi)
else
  echo "wixl ausente: MSI não gerado (apt install wixl)"
fi

if command -v dpkg-deb >/dev/null; then
  PK="$(mktemp -d)"
  bash packaging/linux/build-packages.sh "$VERSION" "$ABS_OUT" "$PK" >/dev/null || true
  # Nomes fixos para os links do painel.
  for f in "$PK"/*.deb "$PK"/*.rpm; do
    [ -e "$f" ] || continue
    case "$f" in
      *_amd64.deb)   n=mororo-agent_amd64.deb ;;
      *_arm64.deb)   n=mororo-agent_arm64.deb ;;
      *x86_64.rpm)   n=mororo-agent.x86_64.rpm ;;
      *aarch64.rpm)  n=mororo-agent.aarch64.rpm ;;
      *) continue ;;
    esac
    cp "$f" "$OUT/$n" && ARTS+=("$n")
  done
  rm -rf "$PK"
fi

( cd "$OUT" && sha256sum "${ARTS[@]}" > mororo-agent.sha256 )
echo "{\"version\":\"$VERSION\",\"built_at\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"}" > "$OUT/mororo-agent.json"
ls -la "$OUT"
