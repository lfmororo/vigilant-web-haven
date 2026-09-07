import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatTimeAgo } from "@/lib/formatTimeAgo";
import { ArrowDown, ArrowUp, Boxes, ChevronDown, ChevronRight, Cpu, Edit, HardDrive, MemoryStick, Network, Trash2 } from "lucide-react";
import ProxmoxTrafficChart from "./ProxmoxTrafficChart";
import type { ProxmoxGuest, ProxmoxInterface, ProxmoxNode } from "./proxmoxTypes";
import { formatBps, formatBytes, formatGB, formatPct, proxmoxStatusBadge, proxmoxStatusDot, usageBarClass } from "./proxmoxTypes";

export interface ProxmoxNodeCardProps {
  node: ProxmoxNode;
  guests: ProxmoxGuest[];
  interfaces?: ProxmoxInterface[];
  expanded: boolean;
  onToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

/** Cartão expansível de um nó Proxmox VE com métricas, storages, rede e VMs/containers. */
const ProxmoxNodeCard = ({ node, guests, interfaces = [], expanded, onToggle, onEdit, onDelete }: ProxmoxNodeCardProps) => {
  const storages = Array.isArray(node.storages) ? (node.storages as Record<string, unknown>[]) : [];
  const running = guests.filter((g) => g.status === "running").length;
  // Soma das taxas atuais de todas as placas monitoradas do host.
  const totalRx = interfaces.reduce((acc, i) => acc + (Number(i.rx_rate_bps) || 0), 0);
  const totalTx = interfaces.reduce((acc, i) => acc + (Number(i.tx_rate_bps) || 0), 0);

  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <button className="flex items-center gap-2 text-left" onClick={onToggle}>
            {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
            <span className={`w-2.5 h-2.5 rounded-full ${proxmoxStatusDot(node.status)}`} />
            <div>
              <p className="font-medium">{node.name}</p>
              <p className="text-xs text-muted-foreground font-mono">
                {node.host}:{node.port} · {node.node_name || "—"} · {node.clients?.full_name || "—"}
              </p>
            </div>
          </button>
          <div className="flex items-center gap-2">
            {proxmoxStatusBadge(node.status)}
            <Badge variant="secondary">{running}/{guests.length} ligadas</Badge>
            <Button size="icon" variant="ghost" onClick={onEdit}><Edit className="w-4 h-4" /></Button>
            <Button size="icon" variant="ghost" onClick={onDelete}><Trash2 className="w-4 h-4 text-destructive" /></Button>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
          <div className="flex items-center gap-2"><Cpu className="w-4 h-4 text-blue-400" /> CPU {formatPct(node.cpu_usage_pct)}</div>
          <div className="flex items-center gap-2"><MemoryStick className="w-4 h-4 text-purple-400" /> RAM {formatPct(node.ram_usage_pct)}</div>
          <div className="flex items-center gap-2"><HardDrive className="w-4 h-4 text-amber-400" /> Disco {formatPct(node.disk_usage_pct)}</div>
          <div className="flex items-center gap-2">
            <Network className="w-4 h-4 text-cyan-400" />
            <span className="flex items-center gap-1"><ArrowDown className="w-3 h-3" />{formatBps(totalRx)}</span>
            <span className="flex items-center gap-1"><ArrowUp className="w-3 h-3" />{formatBps(totalTx)}</span>
          </div>
        </div>

        <p className="text-xs text-muted-foreground">
          Coleta: {node.last_polled_at ? formatTimeAgo(node.last_polled_at) : "Nunca"}
        </p>

        {node.last_error && <p className="text-xs text-destructive">{node.last_error}</p>}

        {expanded && (
          <div className="space-y-4 pt-2 border-t border-border">
            <ProxmoxTrafficChart nodeId={node.id} nodeName={node.name} totalRx={totalRx} totalTx={totalTx} />

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs text-muted-foreground">
              <p>Versão: <span className="text-foreground">{node.pve_version || "—"}</span></p>
              <p>CPU: <span className="text-foreground">{node.cpu_model || "—"} ({node.cpu_cores ?? "—"} núcleos)</span></p>
              <p>RAM: <span className="text-foreground">{formatGB(node.ram_used_gb)} / {formatGB(node.ram_total_gb)}</span></p>
              <p>Load: <span className="text-foreground">{node.load_avg ?? "—"}</span></p>
            </div>

            {storages.length > 0 && (
              <div>
                <h4 className="text-sm font-medium mb-2 flex items-center gap-1"><HardDrive className="w-4 h-4" /> Armazenamentos</h4>
                <div className="grid gap-2 md:grid-cols-2">
                  {storages.map((s, i) => (
                    <div key={i} className="rounded-lg border border-border p-2 text-xs space-y-1">
                      <div className="flex justify-between">
                        <span className="font-medium">{String(s.name)}</span>
                        <span className="text-muted-foreground">{String(s.type || "")}</span>
                      </div>
                      <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                        <div className={`h-full ${usageBarClass(Number(s.usage_pct))}`} style={{ width: `${Number(s.usage_pct) || 0}%` }} />
                      </div>
                      <p className="text-muted-foreground">
                        {formatGB(Number(s.used_gb))} / {formatGB(Number(s.total_gb))} ({formatPct(Number(s.usage_pct))})
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div>
              <h4 className="text-sm font-medium mb-2 flex items-center gap-1"><Network className="w-4 h-4" /> Tráfego de rede (placas do host)</h4>
              {interfaces.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  Aguardando a primeira leitura de rede do agente Proxmox atualizado.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Interface</TableHead>
                        <TableHead>Estado</TableHead>
                        <TableHead>Enlace</TableHead>
                        <TableHead>Download atual</TableHead>
                        <TableHead>Upload atual</TableHead>
                        <TableHead>Recebido (24h)</TableHead>
                        <TableHead>Enviado (24h)</TableHead>
                        <TableHead>Erros</TableHead>
                        <TableHead>Atualizado</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {interfaces.map((iface) => (
                        <TableRow key={iface.id}>
                          <TableCell className="font-medium font-mono text-xs">{iface.interface_name}</TableCell>
                          <TableCell>
                            {iface.status === "up"
                              ? <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30">Ativa</Badge>
                              : <Badge className="bg-muted text-muted-foreground">{iface.status === "down" ? "Inativa" : iface.status}</Badge>}
                          </TableCell>
                          <TableCell>{iface.speed_mbps ? `${iface.speed_mbps} Mbps` : "—"}</TableCell>
                          <TableCell className="text-cyan-400">{formatBps(iface.rx_rate_bps)}</TableCell>
                          <TableCell className="text-blue-400">{formatBps(iface.tx_rate_bps)}</TableCell>
                          <TableCell>{formatBytes(iface.rx_bytes)}</TableCell>
                          <TableCell>{formatBytes(iface.tx_bytes)}</TableCell>
                          <TableCell>{(iface.rx_errors ?? 0) + (iface.tx_errors ?? 0)}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">{formatTimeAgo(iface.updated_at)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>

            <div className="overflow-x-auto">
              <h4 className="text-sm font-medium mb-2 flex items-center gap-1"><Boxes className="w-4 h-4" /> VMs & Containers</h4>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Estado</TableHead>
                    <TableHead>VMID</TableHead>
                    <TableHead>Nome</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>CPU</TableHead>
                    <TableHead>RAM</TableHead>
                    <TableHead>Disco</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {guests.map((g) => (
                    <TableRow key={g.id}>
                      <TableCell>
                        {g.status === "running"
                          ? <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30">Ligada</Badge>
                          : <Badge className="bg-muted text-muted-foreground">Parada</Badge>}
                      </TableCell>
                      <TableCell className="font-mono text-xs">{g.vmid}</TableCell>
                      <TableCell className="font-medium">{g.name}</TableCell>
                      <TableCell><Badge variant="secondary">{g.guest_type === "lxc" ? "Container" : "VM"}</Badge></TableCell>
                      <TableCell>{g.cpu_count ?? "—"} vCPU · {formatPct(g.cpu_usage_pct)}</TableCell>
                      <TableCell>{formatGB(g.ram_used_gb)} / {formatGB(g.ram_total_gb)}</TableCell>
                      <TableCell>{formatGB(g.disk_total_gb)}</TableCell>
                    </TableRow>
                  ))}
                  {guests.length === 0 && (
                    <TableRow><TableCell colSpan={7} className="text-center py-4 text-muted-foreground">Nenhuma VM ou container coletado</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default ProxmoxNodeCard;
