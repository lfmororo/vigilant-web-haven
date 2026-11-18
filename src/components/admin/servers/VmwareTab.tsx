import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { formatTimeAgo } from "@/lib/formatTimeAgo";
import { UsageBar, fmtAgo } from "./monitorUi";
import { statusColor, statusBadge, formatUptime, formatGB, formatPct } from "./serverFormat";
import {
  Server, Monitor, Plus, Trash2, Edit, HardDrive, Cpu, MemoryStick, Activity, Clock, ChevronDown, ChevronRight,
  Power, AlertTriangle, CheckCircle, XCircle, Download, ServerCog, Boxes, Terminal, Database
} from "lucide-react";

interface Props { clients: { id: string; full_name: string }[] | undefined }

const EMPTY = { name: "", host: "", client_id: "", username: "root", password: "", port: 443 };

/** Hosts VMware ESXi (coletados por SSH) e suas VMs. */
export default function VmwareTab({ clients }: Props) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState(EMPTY);
  const [expandedVmHost, setExpandedVmHost] = useState<string | null>(null);

  const { data: vmwareHosts } = useQuery({
    queryKey: ["vmware-hosts"],
    queryFn: async () => {
      const { data } = await supabase
        .from("vmware_hosts")
        .select("id, client_id, name, host, username, port, status, is_active, cpu_cores, cpu_usage_pct, ram_total_gb, ram_used_gb, ram_usage_pct, esxi_version, uptime_seconds, datastores, last_polled_at, last_error, created_at, updated_at, clients(full_name)")
        .order("name");
      return data || [];
    },
    refetchInterval: 30000,
  });

  const { data: vmwareVms } = useQuery({
    queryKey: ["vmware-vms"],
    queryFn: async () => {
      const { data } = await supabase.from("vmware_vms").select("*").order("name");
      return data || [];
    },
    refetchInterval: 30000,
  });

  const save = useMutation({
    mutationFn: async (data: any) => {
      const q = editing
        ? supabase.from("vmware_hosts").update(data).eq("id", editing.id)
        : supabase.from("vmware_hosts").insert(data);
      const { error } = await q;
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["vmware-hosts"] });
      setOpen(false);
      toast({ title: editing ? "Host atualizado" : "Host adicionado" });
      setEditing(null);
    },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  const deleteItem = useMutation({
    mutationFn: async ({ id }: { table: string; id: string }) => {
      const { error } = await supabase.from("vmware_hosts").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["vmware-hosts"] });
      toast({ title: "Removido com sucesso" });
    },
  });

  const openEdit = (item: any, _type?: string) => {
    setEditing(item);
    setForm({ name: item.name, host: item.host, client_id: item.client_id, username: item.username || "root", password: "", port: item.port || 443 });
    setOpen(true);
  };
  const openAdd = () => { setEditing(null); setForm(EMPTY); setOpen(true); };
  const submit = () => {
    const payload: Record<string, any> = { name: form.name, host: form.host, client_id: form.client_id, username: form.username, port: form.port };
    // Senha vazia na edição = manter a atual.
    if (form.password) payload.password = form.password;
    save.mutate(payload);
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button size="sm" onClick={openAdd}><Plus className="mr-1 h-4 w-4" /> Novo host</Button>
      </div>

            <div className="space-y-4">
              {vmwareHosts?.map(host => {
                const vms = vmwareVms?.filter(v => v.host_id === host.id) || [];
                const isExpanded = expandedVmHost === host.id;
                const datastores = (host.datastores || []) as any[];
                return (
                  <Card key={host.id}>
                    <CardHeader className="py-3 px-4 cursor-pointer" onClick={() => setExpandedVmHost(isExpanded ? null : host.id)}>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                          <div className={`w-2.5 h-2.5 rounded-full ${statusColor(host.status)}`} />
                          <div>
                            <CardTitle className="text-base">{host.name}</CardTitle>
                            <p className="text-xs text-muted-foreground">{(host as any).clients?.full_name} · {host.host} · {host.esxi_version || "ESXi"}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-4 text-sm">
                          {host.cpu_usage_pct != null && (
                            <div className="flex items-center gap-1"><Cpu className="w-3 h-3" />{formatPct(host.cpu_usage_pct)}</div>
                          )}
                          {host.ram_usage_pct != null && (
                            <div className="flex items-center gap-1"><MemoryStick className="w-3 h-3" />{formatPct(host.ram_usage_pct)}</div>
                          )}
                          <Badge variant="secondary">{vms.filter(v => v.power_state === "poweredOn").length}/{vms.length} VMs</Badge>
                          {statusBadge(host.status)}
                          <div className="flex gap-1">
                            <Button size="icon" variant="ghost" onClick={e => { e.stopPropagation(); openEdit(host, "vmware"); }}><Edit className="w-4 h-4" /></Button>
                            <Button size="icon" variant="ghost" className="text-destructive" onClick={e => { e.stopPropagation(); deleteItem.mutate({ table: "vmware_hosts", id: host.id }); }}><Trash2 className="w-4 h-4" /></Button>
                          </div>
                        </div>
                      </div>
                    </CardHeader>
                    {isExpanded && (
                      <CardContent className="pt-0 space-y-4">
                        {/* Host Details */}
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                          <div className="bg-muted/50 rounded-lg p-3">
                            <p className="text-xs text-muted-foreground">CPU Cores</p>
                            <p className="text-lg font-bold">{host.cpu_cores || "—"}</p>
                          </div>
                          <div className="bg-muted/50 rounded-lg p-3">
                            <p className="text-xs text-muted-foreground">RAM Total</p>
                            <p className="text-lg font-bold">{formatGB(host.ram_total_gb)}</p>
                          </div>
                          <div className="bg-muted/50 rounded-lg p-3">
                            <p className="text-xs text-muted-foreground">RAM Usada</p>
                            <p className="text-lg font-bold">{formatGB(host.ram_used_gb)}</p>
                          </div>
                          <div className="bg-muted/50 rounded-lg p-3">
                            <p className="text-xs text-muted-foreground">Uptime</p>
                            <p className="text-lg font-bold">{formatUptime(host.uptime_seconds as number | null)}</p>
                          </div>
                        </div>

                        {/* Datastores */}
                        {datastores.length > 0 && (
                          <div>
                            <h4 className="text-sm font-medium mb-2 flex items-center gap-1"><HardDrive className="w-4 h-4" /> Datastores</h4>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                              {datastores.map((ds: any, i: number) => {
                                const usedPct = ds.capacity_gb > 0 ? ((ds.capacity_gb - ds.free_gb) / ds.capacity_gb * 100) : 0;
                                return (
                                  <div key={i} className="bg-muted/50 rounded-lg p-3">
                                    <div className="flex justify-between text-sm mb-1">
                                      <span className="font-medium">{ds.name}</span>
                                      <span className="text-muted-foreground">{formatGB(ds.capacity_gb - ds.free_gb)} / {formatGB(ds.capacity_gb)}</span>
                                    </div>
                                    <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                                      <div className={`h-full rounded-full ${usedPct > 90 ? "bg-red-500" : usedPct > 70 ? "bg-amber-500" : "bg-emerald-500"}`} style={{ width: `${usedPct}%` }} />
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}

                        {/* VMs */}
                        <div>
                          <h4 className="text-sm font-medium mb-2 flex items-center gap-1"><Monitor className="w-4 h-4" /> Máquinas Virtuais</h4>
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>Estado</TableHead>
                                <TableHead>Nome</TableHead>
                                <TableHead>SO</TableHead>
                                <TableHead>CPU</TableHead>
                                <TableHead>RAM</TableHead>
                                <TableHead>IP</TableHead>
                                <TableHead>Disco</TableHead>
                                <TableHead>VMware Tools</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {vms.map(vm => (
                                <TableRow key={vm.id}>
                                  <TableCell>
                                    {vm.power_state === "poweredOn" ? (
                                      <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30">Ligada</Badge>
                                    ) : (
                                      <Badge className="bg-muted text-muted-foreground">Desligada</Badge>
                                    )}
                                  </TableCell>
                                  <TableCell className="font-medium">{vm.name}</TableCell>
                                  <TableCell className="text-xs">{vm.guest_os || "—"}</TableCell>
                                  <TableCell>{vm.cpu_count || "—"} vCPU</TableCell>
                                  <TableCell>{vm.ram_mb ? `${(vm.ram_mb / 1024).toFixed(1)} GB` : "—"}</TableCell>
                                  <TableCell className="font-mono text-xs">{vm.ip_address || "—"}</TableCell>
                                  <TableCell>{formatGB(vm.disk_used_gb)} / {formatGB(vm.disk_provisioned_gb)}</TableCell>
                                  <TableCell>
                                    {vm.tools_status === "toolsOk" ? (
                                      <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30">OK</Badge>
                                    ) : vm.tools_status ? (
                                      <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30">{vm.tools_status}</Badge>
                                    ) : "—"}
                                  </TableCell>
                                </TableRow>
                              ))}
                              {vms.length === 0 && (
                                <TableRow>
                                  <TableCell colSpan={8} className="text-center py-4 text-muted-foreground">
                                    Nenhuma VM encontrada
                                  </TableCell>
                                </TableRow>
                              )}
                            </TableBody>
                          </Table>
                        </div>
                      </CardContent>
                    )}
                  </Card>
                );
              })}
              {(!vmwareHosts || vmwareHosts.length === 0) && (
                <Card><CardContent className="py-8 text-center text-muted-foreground">Nenhum host VMware cadastrado</CardContent></Card>
              )}
            </div>
          

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editing ? "Editar" : "Adicionar"} Host VMware</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Cliente</Label>
              <Select value={form.client_id} onValueChange={v => setForm(p => ({ ...p, client_id: v }))}>
                <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                <SelectContent>{clients?.map(c => <SelectItem key={c.id} value={c.id}>{c.full_name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>Nome</Label><Input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="Ex: SRV-DC01" /></div>
            <div><Label>IP / Host</Label><Input value={form.host} onChange={e => setForm(p => ({ ...p, host: e.target.value }))} placeholder="192.168.1.100" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Usuário</Label><Input value={form.username} onChange={e => setForm(p => ({ ...p, username: e.target.value }))} /></div>
              <div><Label>Porta</Label><Input type="number" value={form.port} onChange={e => setForm(p => ({ ...p, port: Number(e.target.value) }))} /></div>
            </div>
            <div><Label>Senha</Label><Input type="password" value={form.password} placeholder={editing ? "Em branco mantém a atual" : ""} onChange={e => setForm(p => ({ ...p, password: e.target.value }))} /></div>
            <Button className="w-full" onClick={submit} disabled={save.isPending}>{editing ? "Salvar" : "Adicionar"}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
