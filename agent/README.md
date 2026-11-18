# Mororo.Tech Agent (`mororo-agent`)

Um único executável para **servidores e estações** (Windows e Linux) que envia tudo para o vigilant-web-haven:

| O quê | Onde aparece no painel |
|---|---|
| CPU, RAM, discos, serviços, eventos, reinício pendente | Servidores: abas Windows/Linux (alertas completos). Estações: aba **Máquinas (agente)** |
| Inventário de hardware e programas instalados | **Máquinas (agente)** e **Inventário de Equipamentos** (sincronizado) |
| Saúde do disco (SMART), antivírus | **Máquinas (agente)** + alertas |
| Proxmox, VMware ESXi (SSH), HP iLO / Dell iDRAC (Redfish), SQL Server | Abas existentes (mesmo formato do `server-monitor-ingest`) |
| Ping, porta TCP, sites com validade do SSL | **Rede e sites** |
| Varredura da rede | **Rede e sites → Equipamentos encontrados** |
| Informações de suporte no papel de parede (Windows) | — (na tela do usuário) |

## Instalação

1. No painel: **Monitor de Servidores → Agentes & Alertas → Gerar token**, escolha o **cliente** e marque **Agente unificado**.
2. Baixe `mororo-agent.exe` (botão no mesmo card) e dê dois cliques na máquina do cliente.
   O assistente abre no navegador: token → servidor ou estação → varredura da rede → equipamentos e credenciais → instalar.

Instalação silenciosa (GPO, script, RMM):

```bat
mororo-agent.exe install --token mt_xxx --role workstation --quiet
mororo-agent.exe install --token mt_xxx --role server --services "MSSQLSERVER,W3SVC" --quiet
```

```bash
curl -fsSL https://<site>/downloads/mororo-agent-linux-amd64 -o mororo-agent && chmod +x mororo-agent
sudo ./mororo-agent install --token mt_xxx --role server --quiet
# assistente num servidor sem tela: sudo ./mororo-agent install  (e use o túnel SSH que ele mostra)
```

Outros comandos: `status`, `once` (coleta de teste), `once --dry-run` (só mostra o JSON), `scan --cidr 192.168.0.0/24`, `uninstall`.

## Onde fica cada coisa

| | Windows | Linux |
|---|---|---|
| Executável | `C:\Program Files\MororoTech\Agent\mororo-agent.exe` | `/usr/local/bin/mororo-agent` |
| Configuração (token, só administradores) | `C:\ProgramData\MororoAgent\config.json` | `/etc/mororo-agent/config.json` |
| Logs | `C:\ProgramData\MororoAgent\logs\agent.log` | `/var/lib/mororo-agent/logs/agent.log` |
| Serviço | `MororoAgent` (automático, reinicia se cair) | `MororoAgent.service` (systemd) |
| Papel de parede | `HKLM\...\Run\MororoAgentDesktop` → `mororo-agent.exe desktop --loop` na sessão do usuário | — |

## Backend

- `supabase/functions/endpoint-agent` — `whoami`, `enroll`, `config`, `report`, `discovery`, `register-devices`.
- Migração `drizzle/migrations/0007_mororo_agent_endpoints.sql` — `agent_endpoints`, `agent_software`, `network_probes`,
  `network_discoveries`, escopo `agent` nos tokens e `collector_endpoint_id` nas fontes (quem coleta cada equipamento).
- Os coletores avulsos antigos continuam funcionando: eles só recebem as fontes **sem** `collector_endpoint_id`.

## Compilar

```bash
./build.sh                 # gera public/downloads/mororo-agent.exe, -linux-amd64, -linux-arm64 e .sha256
VERSION=1.0.1 ./build.sh   # nova versão (atualize também AGENT_VERSIONS["mororo-agent"] nos dois agentVersions.ts)
```

Requer Go 1.22+ e, para o ícone/versão do `.exe`, o `go-winres` (`winres/winres.json` usa o ícone da logo Mororó.Tech).
O `go.mod` aponta os pacotes `golang.org/x/*` para os espelhos oficiais em `github.com/golang/*`.

O `.exe` não é assinado digitalmente: o Windows SmartScreen pode pedir "Mais informações → Executar assim mesmo".
Para evitar isso, assine com um certificado de assinatura de código (`signtool sign /fd sha256 ...`).

## Instaladores

`./build.sh` também gera (quando as ferramentas existem — o `deploy/install.sh` instala todas no contêiner de build):

| Arquivo | Ferramenta | Uso |
|---|---|---|
| `mororo-agent-setup.exe` | makensis | Setup tradicional. Silencioso: `/S /TOKEN=mt_… /ROLE=server [/NODESKTOP]` |
| `mororo-agent.msi` | wixl | GPO: `msiexec /i mororo-agent.msi /qn TOKEN=mt_… ROLE=workstation [DESKTOP=0]` |
| `mororo-agent_{amd64,arm64}.deb` / `mororo-agent.{x86_64,aarch64}.rpm` | dpkg-deb / rpmbuild | `sudo MORORO_TOKEN=mt_… MORORO_ROLE=server apt install ./mororo-agent_amd64.deb` |
| `mororo-coletores-setup.exe` | makensis + npm | Coletores avulsos (Proxmox, VMware, iLO, iDRAC, Windows Server, SQL Server) como serviços. `/S /TOKEN=mt_… /COLETORES=proxmox,ilo` |

**Instalador por cliente:** o painel (Monitor de Servidores → Agentes & Alertas → *Gerar instalador do cliente*) cria um token do
cliente e anexa ao fim do executável o bloco `\n#MORORO-CFG#<base64 json>#END#\n` (ver `embedded.go`). Executado sem argumentos,
o agente instala direto com esse token (ou abre o assistente, no modo `wizard`); `install --embedded --quiet` serve para scripts.
Os arquivos de `public/downloads/` não vão para o git: são gerados no build.
