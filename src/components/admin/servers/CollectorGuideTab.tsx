import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AgentDownloadButton } from "@/components/admin/AgentDownloadButton";
import { Server, Monitor, Download, ServerCog, Boxes } from "lucide-react";

/** Guia de instalação dos coletores avulsos (Windows remoto, VMware, iLO, Proxmox). */
export default function CollectorGuideTab() {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  const bundleOptions = { url: supabaseUrl, key: anonKey, interval: 300 };
  return (
    <>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><Download className="w-5 h-5" /> Guia de Instalação dos Coletores</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div>
                  <h3 className="text-lg font-semibold mb-2 flex items-center gap-2"><Server className="w-5 h-5 text-blue-400" /> Coletor Windows (PowerShell Centralizado)</h3>
                  <p className="text-sm text-muted-foreground mb-3">
                    Um único script PowerShell roda em <strong>uma máquina Windows</strong> da rede e monitora <strong>todos os servidores</strong> remotamente via WMI. Ele busca a lista de servidores automaticamente do painel.
                  </p>
                  <div className="bg-muted rounded-lg p-4 space-y-2">
                    <p className="text-sm font-medium">1. Baixe o script na máquina coletora:</p>
                    <code className="text-xs block bg-background p-2 rounded">
                      Invoke-WebRequest -Uri "{window.location.origin}/windows-server-collector.ps1" -OutFile "C:\Scripts\windows-collector.ps1"
                    </code>
                    <p className="text-sm font-medium mt-3">2. Configure apenas a ANON_KEY no script:</p>
                    <code className="text-xs block bg-background p-2 rounded whitespace-pre">{`$SUPABASE_URL = "${supabaseUrl}"
$SUPABASE_ANON_KEY = "${anonKey}"
$SERVICES_TO_MONITOR = @("MSSQLSERVER","W3SVC","DNS","DHCP")`}</code>
                    <p className="text-sm font-medium mt-3">3. Pré-requisitos na rede:</p>
                    <div className="text-xs bg-background p-2 rounded space-y-1">
                      <p>• A conta que roda o script precisa de permissão WMI nos servidores remotos</p>
                      <p>• Firewall: liberar porta WMI (135 + portas dinâmicas) entre a máquina coletora e os servidores</p>
                      <p>• Habilitar serviço "Windows Remote Management" nos servidores alvo</p>
                    </div>
                    <p className="text-sm font-medium mt-3">4. Agende via Task Scheduler (a cada 5 min):</p>
                    <code className="text-xs block bg-background p-2 rounded whitespace-pre">{`$action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-ExecutionPolicy Bypass -File C:\\Scripts\\windows-collector.ps1"
$trigger = New-ScheduledTaskTrigger -RepetitionInterval (New-TimeSpan -Minutes 5) -Once -At (Get-Date)
Register-ScheduledTask -TaskName "WindowsServerCollector" -Action $action -Trigger $trigger -RunLevel Highest -User "SYSTEM"`}</code>
                  </div>
                </div>

                <div>
                  <h3 className="text-lg font-semibold mb-2 flex items-center gap-2"><Monitor className="w-5 h-5 text-purple-400" /> Coletor VMware (Node.js via SSH)</h3>
                  <p className="text-sm text-muted-foreground mb-3">
                    O coletor roda em uma VPS externa e consulta os hosts ESXi via <strong>SSH</strong> (vim-cmd / esxcli), garantindo compatibilidade com ESXi 6.5+. Requer serviço SSH ativo no host.
                  </p>
                  <div className="bg-muted rounded-lg p-4 space-y-2">
                    <p className="text-sm font-medium">1. Na VPS, instale a dependência:</p>
                    <code className="text-xs block bg-background p-2 rounded">npm install ssh2</code>
                    <p className="text-sm font-medium mt-3">2. Baixe o script:</p>
                    <code className="text-xs block bg-background p-2 rounded">
                      curl -o vmware-collector.js {window.location.origin}/vmware-collector.js
                    </code>
                    <p className="text-sm font-medium mt-3">3. Configure a ANON_KEY no script e rode como serviço (systemd):</p>
                    <code className="text-xs block bg-background p-2 rounded whitespace-pre">{`[Unit]
Description=VMware Collector (SSH)
After=network.target

[Service]
ExecStart=/usr/bin/node /opt/collectors/vmware-collector.js
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target`}</code>
                    <p className="text-sm font-medium mt-3">4. Pré-requisitos:</p>
                    <div className="text-xs bg-background p-2 rounded space-y-1">
                      <p>• Serviço SSH habilitado no host ESXi (porta 22)</p>
                      <p>• Credenciais com acesso SSH (usuário root)</p>
                      <p>• Liberação de firewall entre a VPS e os hosts na porta 22</p>
                    </div>
                  </div>
                </div>

                <div>
                  <h3 className="text-lg font-semibold mb-2 flex items-center gap-2"><ServerCog className="w-5 h-5 text-orange-400" /> Coletor HP iLO4 (Node.js via Redfish/HTTPS)</h3>
                  <p className="text-sm text-muted-foreground mb-3">
                    Um único script Node.js (sem dependências externas) roda em uma VPS ou máquina com acesso à
                    <strong> rede de gerenciamento dos iLOs</strong> e coleta temperaturas, ventiladores, fontes, voltagens,
                    discos/RAID (SmartStorage) e o log de eventos de hardware (IML) de todos os servidores cadastrados na aba HP iLO4.
                  </p>
                  <div className="bg-muted rounded-lg p-4 space-y-2">
                    <p className="text-sm font-medium">1. Configure o iLO4 de cada servidor:</p>
                    <div className="text-xs bg-background p-2 rounded space-y-1">
                      <p>• Crie um usuário dedicado somente-leitura (permissão apenas de <strong>Login</strong>)</p>
                      <p>• Mantenha a API Redfish/REST habilitada em <em>Security → Access Settings</em> (padrão no iLO4 2.3+)</p>
                      <p>• Use HTTPS na porta 443 e libere o firewall entre a máquina coletora e o iLO</p>
                      <p>• Recomendado: firmware do iLO4 na versão 2.55 ou superior</p>
                    </div>
                    <p className="text-sm font-medium mt-3">2. Baixe o script na máquina coletora:</p>
                    <code className="text-xs block bg-background p-2 rounded">
                      curl -o ilo-collector.js {window.location.origin}/ilo-collector.js
                    </code>
                    <p className="text-sm font-medium mt-3">3. Execute (coleta contínua a cada 5 minutos):</p>
                    <code className="text-xs block bg-background p-2 rounded whitespace-pre">{`node ilo-collector.js \\
  --url "${supabaseUrl}" \\
  --key "${anonKey}" \\
  --intervalo 300`}</code>
                    <p className="text-sm font-medium mt-3">4. Ou agende via cron (execução única por ciclo):</p>
                    <code className="text-xs block bg-background p-2 rounded whitespace-pre">{`*/5 * * * * /usr/bin/node /opt/collectors/ilo-collector.js --url "${supabaseUrl}" --key "SUA_ANON_KEY" --uma-vez`}</code>
                    <p className="text-sm font-medium mt-3">5. Alertas:</p>
                    <div className="text-xs bg-background p-2 rounded space-y-1">
                      <p>• Servidor inacessível, saúde crítica e novos eventos críticos do IML disparam WhatsApp para os administradores</p>
                      <p>• As condições de atenção/crítico também aparecem no painel de alertas desta página</p>
                      <p>• Certificados autoassinados do iLO são aceitos por padrão; use <code>--seguro</code> para exigir certificado válido</p>
                    </div>
                  </div>
                </div>

                <div>
                  <h3 className="font-semibold mb-2 flex items-center gap-2"><ServerCog className="w-4 h-4" /> Dell iDRAC9 (Redfish)</h3>
                  <p className="text-sm text-muted-foreground mb-2">
                    Coletor Node.js dedicado aos servidores Dell. Coleta status geral, CPU e memória, temperaturas,
                    voltagens, ventoinhas, fontes, controladoras RAID, volumes, discos físicos e os eventos do SEL
                    de todos os servidores cadastrados com o fabricante <strong>Dell (iDRAC9)</strong>.
                  </p>
                  <div className="bg-muted rounded-lg p-4 space-y-2">
                    <p className="text-sm font-medium">1. Configure o iDRAC9 de cada servidor:</p>
                    <div className="text-xs bg-background p-2 rounded space-y-1">
                      <p>• Crie um usuário local com função <strong>Read Only</strong> em <em>iDRAC Settings → Users</em></p>
                      <p>• Mantenha a API Redfish habilitada em <em>iDRAC Settings → Services</em> (padrão no iDRAC9)</p>
                      <p>• Garanta conectividade HTTPS (porta 443) entre a máquina coletora e o iDRAC</p>
                      <p>• Opcional: em <em>Configuration → System Settings → Alert Configuration</em> configure e-mail/SNMP traps direto no iDRAC</p>
                    </div>
                    <p className="text-sm font-medium mt-3">2. Baixe o script na máquina coletora:</p>
                    <code className="text-xs block bg-background p-2 rounded">
                      curl -o idrac-collector.js {window.location.origin}/idrac-collector.js
                    </code>
                    <p className="text-sm font-medium mt-3">3. Execute (coleta contínua a cada 5 minutos):</p>
                    <code className="text-xs block bg-background p-2 rounded whitespace-pre">{`node idrac-collector.js \\
  --url "${supabaseUrl}" \\
  --key "${anonKey}" \\
  --intervalo 300`}</code>
                    <p className="text-sm font-medium mt-3">4. Ou agende via cron (execução única por ciclo):</p>
                    <code className="text-xs block bg-background p-2 rounded whitespace-pre">{`*/5 * * * * /usr/bin/node /opt/collectors/idrac-collector.js --url "${supabaseUrl}" --key "SUA_ANON_KEY" --uma-vez`}</code>
                    <p className="text-sm font-medium mt-3">5. Alertas:</p>
                    <div className="text-xs bg-background p-2 rounded space-y-1">
                      <p>• Cada sensor em falha (temperatura, ventoinha, fonte, disco) gera um alerta individual via WhatsApp</p>
                      <p>• Servidor inacessível, saúde crítica e novos eventos críticos do SEL também notificam os administradores</p>
                      <p>• Certificados autoassinados do iDRAC são aceitos por padrão; use <code>--seguro</code> para exigir certificado válido</p>
                    </div>
                  </div>
                </div>

                <div>
                  <h3 className="font-semibold mb-2 flex items-center gap-2"><Boxes className="w-4 h-4" /> Proxmox VE (API REST)</h3>
                  <p className="text-sm text-muted-foreground mb-2">
                    Coletor Node.js que consulta a API do Proxmox VE e envia métricas do nó, storages e VMs/containers.
                  </p>
                  <div className="bg-muted rounded-lg p-4 space-y-2">
                    <p className="text-sm font-medium">1. Crie um API Token no Proxmox (recomendado):</p>
                    <div className="text-xs bg-background p-2 rounded space-y-1">
                      <p>• Datacenter → Permissions → API Tokens → Add (ex.: <code>root@pam!monitor</code>)</p>
                      <p>• Desmarque “Privilege Separation” ou conceda a role <strong>PVEAuditor</strong> em <code>/</code></p>
                      <p>• Copie o Secret exibido uma única vez e cadastre-o na aba Proxmox</p>
                    </div>
                    <p className="text-sm font-medium mt-3">2. Baixe o script na máquina coletora:</p>
                    <code className="text-xs block bg-background p-2 rounded">
                      curl -o proxmox-collector.js {window.location.origin}/proxmox-collector.js
                    </code>
                    <p className="text-sm font-medium mt-3">3. Execute (coleta contínua a cada 5 minutos):</p>
                    <code className="text-xs block bg-background p-2 rounded whitespace-pre">{`node proxmox-collector.js \\
  --url "${supabaseUrl}" \\
  --key "${anonKey}" \\
  --intervalo 300`}</code>
                    <p className="text-sm font-medium mt-3">4. Ou agende via cron (execução única por ciclo):</p>
                    <code className="text-xs block bg-background p-2 rounded whitespace-pre">{`*/5 * * * * /usr/bin/node /opt/collectors/proxmox-collector.js --url "${supabaseUrl}" --key "SUA_ANON_KEY" --uma-vez`}</code>
                    <p className="text-xs text-muted-foreground mt-2">
                      Certificados autoassinados do Proxmox são aceitos por padrão; use <code>--seguro</code> para exigir certificado válido.
                    </p>
                  </div>
                </div>

                <div>
                  <h3 className="font-semibold mb-2 flex items-center gap-2"><Download className="w-4 h-4" /> Instalar como serviço do Windows</h3>
                  <p className="text-sm text-muted-foreground mb-2">
                    O script <code>instalar-agente-servico.ps1</code> acompanha todos os coletores. Coloque-o na
                    <strong> mesma pasta em que o agente foi extraído</strong>: ele detecta o coletor, registra o serviço
                    apontando para essa pasta, cria logs em <code>.\logs\</code> e reinicia automaticamente em caso de falha.
                  </p>
                  <div className="bg-muted rounded-lg p-4 space-y-2">
                    <p className="text-sm font-medium">1. Abra o PowerShell como Administrador na pasta do agente e execute:</p>
                    <code className="text-xs block bg-background p-2 rounded whitespace-pre">{`.\\instalar-agente-servico.ps1 \`
  -Url "${supabaseUrl}" \`
  -Key "${anonKey}" \`
  -Intervalo 300`}</code>
                    <p className="text-sm font-medium mt-3">2. Instalando um coletor específico (quando há vários na pasta):</p>
                    <code className="text-xs block bg-background p-2 rounded whitespace-pre">{`.\\instalar-agente-servico.ps1 -Script proxmox-collector.js -Nome "ColetorProxmox" -Url "${supabaseUrl}" -Key "SUA_ANON_KEY"`}</code>
                    <p className="text-sm font-medium mt-3">3. Gerenciar o serviço:</p>
                    <div className="text-xs bg-background p-2 rounded space-y-1">
                      <p>• Status: <code>Get-Service Agente_proxmoxcollector</code></p>
                      <p>• Parar/Iniciar: <code>Stop-Service …</code> / <code>Start-Service …</code></p>
                      <p>• Desinstalar: <code>.\instalar-agente-servico.ps1 -Desinstalar</code></p>
                      <p>• Requer Node.js instalado para coletores <code>.js</code>; usa NSSM (baixado automaticamente) e, sem internet, cria uma Tarefa Agendada no boot como SYSTEM</p>
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap gap-3">
                  <AgentDownloadButton agent="windows" label="Baixar Agente Windows (.zip)" options={bundleOptions} />
                  <AgentDownloadButton agent="vmware" label="Baixar Agente VMware (.zip)" options={bundleOptions} />
                  <AgentDownloadButton agent="ilo" label="Baixar Agente HP iLO4 (.zip)" options={bundleOptions} />
                  <AgentDownloadButton agent="idrac" label="Baixar Agente Dell iDRAC9 (.zip)" options={bundleOptions} />
                  <AgentDownloadButton agent="proxmox" label="Baixar Agente Proxmox (.zip)" options={bundleOptions} />
                  <Button asChild>
                    <a href="/instalar-agente-servico.ps1" download>
                      <Download className="w-4 h-4 mr-1" /> Somente o Instalador (.ps1)
                    </a>
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Cada .zip contém o coletor, o instalador de serviço, o atalho <code>instalar.cmd</code> já
                  preenchido com URL e chave, e um LEIA-ME com os comandos.
                </p>



              </CardContent>
            </Card>
          
    </>
  );
}
