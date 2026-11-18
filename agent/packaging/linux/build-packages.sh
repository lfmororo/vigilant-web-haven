#!/usr/bin/env bash
# Gera mororo-agent_<versão>_{amd64,arm64}.deb e mororo-agent-<versão>.{x86_64,aarch64}.rpm
#   build-packages.sh <versão> <pasta com mororo-agent-linux-amd64/arm64> <saída>
set -euo pipefail
VERSION="$1"; SRC="$2"; OUT="$3"
HERE="$(cd "$(dirname "$0")" && pwd)"
mkdir -p "$OUT"
for arch in amd64 arm64; do
  bin="$SRC/mororo-agent-linux-$arch"
  [ -f "$bin" ] || { echo "faltando $bin"; continue; }
  # ---------- .deb
  if command -v dpkg-deb >/dev/null; then
    root=$(mktemp -d)
    install -Dm755 "$bin" "$root/usr/local/bin/mororo-agent"
    mkdir -p "$root/DEBIAN"
    install -m755 "$HERE/postinst.sh" "$root/DEBIAN/postinst"
    install -m755 "$HERE/prerm.sh" "$root/DEBIAN/prerm"
    cat > "$root/DEBIAN/control" <<CTRL
Package: mororo-agent
Version: $VERSION
Section: admin
Priority: optional
Architecture: $arch
Maintainer: Mororo.Tech <contato@mororo.tech>
Homepage: https://mororo.tech
Description: Mororo.Tech Agent - monitoramento, inventario e suporte
 Envia metricas, inventario de hardware/software e checagens de rede
 para o painel da Mororo.Tech (vigilant-web-haven).
CTRL
    dpkg-deb --root-owner-group --build "$root" "$OUT/mororo-agent_${VERSION}_${arch}.deb" >/dev/null
    rm -rf "$root"
  fi
  # ---------- .rpm
  if command -v rpmbuild >/dev/null; then
    rarch=$([ "$arch" = amd64 ] && echo x86_64 || echo aarch64)
    top=$(mktemp -d)
    mkdir -p "$top"/{BUILD,RPMS,SOURCES,SPECS,SRPMS}
    cp "$bin" "$top/SOURCES/mororo-agent"
    cat > "$top/SPECS/mororo-agent.spec" <<SPEC
Name:           mororo-agent
Version:        $VERSION
Release:        1
Summary:        Mororo.Tech Agent - monitoramento, inventario e suporte
License:        Proprietary
URL:            https://mororo.tech
AutoReqProv:    no
%global debug_package %{nil}
%global __strip /bin/true
%description
Envia metricas, inventario e checagens de rede para o painel da Mororo.Tech.
%install
install -Dm755 %{_sourcedir}/mororo-agent %{buildroot}/usr/local/bin/mororo-agent
%files
/usr/local/bin/mororo-agent
%post
$(sed '1,/^set -e/d' "$HERE/postinst.sh")
%preun
if [ "\$1" = "0" ]; then /usr/local/bin/mororo-agent uninstall --quiet --keep-files >/dev/null 2>&1 || true; fi
SPEC
    rpmbuild --quiet --define "_topdir $top" --target "$rarch" -bb "$top/SPECS/mororo-agent.spec" >/dev/null 2>&1 \
      && cp "$top"/RPMS/*/*.rpm "$OUT/" || echo "rpm $rarch falhou"
    rm -rf "$top"
  fi
done
ls -la "$OUT" | grep -E "\.deb|\.rpm" || true
