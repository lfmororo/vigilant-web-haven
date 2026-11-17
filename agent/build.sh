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

( cd "$OUT" && sha256sum mororo-agent.exe mororo-agent-linux-amd64 mororo-agent-linux-arm64 > mororo-agent.sha256 )
echo "{\"version\":\"$VERSION\",\"built_at\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"}" > "$OUT/mororo-agent.json"
ls -la "$OUT"
