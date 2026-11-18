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

const EMPTY = { name: "", host: "", client_id: "" };

/** Servidores Windows monitorados pelo coletor remoto (WMI/WinRM) ou pelo agente. */
export default function WindowsServersTab({ clients }: Props) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState(EMPTY);

  const { data: windowsServers } = useQuery({
    queryKey: ["windows-servers"],
    queryFn: async () => {
      const { data } = await supabase.from("windows_servers").select("*, clients(full_name)").order("name");
      return data || [];
    },
    refetchInterval: 30000,
  });

  const save = useMutation({
    mutationFn: async (data: any) => {
      const q = editing
        ? supabase.from("windows_servers").update(data).eq("id", editing.id)
        : supabase.from("windows_servers").insert(data);
      const { error } = await q;
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["windows-servers"] });
      setOpen(false);
      toast({ title: editing ? "Servidor atualizado" : "Servidor adicionado" });
      setEditing(null);
    },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  const deleteItem = useMutation({
    mutationFn: async ({ id }: { table: string; id: string }) => {
      const { error } = await supabase.from("windows_servers").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["windows-servers"] });
      toast({ title: "Removido com sucesso" });
    },
  });

  const openEdit = (item: any, _type?: string) => {
    setEditing(item);
    setForm({ name: item.name, host: item.host, client_id: item.client_id });
    setOpen(true);
  };
  const openAdd = () => { setEditing(null); setForm(EMPTY); setOpen(true); };
  const submit = () => save.mutate({ name: form.name, host: form.host, client_id: form.client_id });

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button size="sm" onClick={openAdd}><Plus className="mr-1 h-4 w-4" /> Novo servidor</Button>
      </div>

            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Status</TableHead>
                      <TableHead>Nome</TableHead>
                      <TableHead>Cliente</TableHead>
                      <TableHead>IP</TableHead>
                      <TableHead>CPU</TableHead>
                      <TableHead>RAM</TableHead>
                      <TableHead>Disco</TableHead>
                      <TableHead>Uptime</TableHead>
                      <TableHead>Últ. Coleta</TableHead>
                      <TableHead>Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {windowsServers?.map(srv => (
                      <TableRow key={srv.id}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <div className={`w-2.5 h-2.5 rounded-full ${statusColor(srv.status)}`} />
                            {statusBadge(srv.status)}
                          </div>
                        </TableCell>
                        <TableCell className="font-medium">{srv.name}</TableCell>
                        <TableCell>{(srv as any).clients?.full_name || "—"}</TableCell>
                        <TableCell className="font-mono text-xs">{srv.host}</TableCell>
                        <TableCell>
                          {srv.cpu_usage != null ? (
                            <div className="flex items-center gap-1.5">
                              <div className="w-16 h-2 bg-muted rounded-full overflow-hidden">
                                <div className={`h-full rounded-full ${srv.cpu_usage > 90 ? "bg-red-500" : srv.cpu_usage > 70 ? "bg-amber-500" : "bg-emerald-500"}`} style={{ width: `${srv.cpu_usage}%` }} />
                              </div>
                              <span className="text-xs">{formatPct(srv.cpu_usage)}</span>
                            </div>
                          ) : "—"}
                        </TableCell>
                        <TableCell>
                          {srv.ram_usage_pct != null ? (
                            <div className="flex items-center gap-1.5">
                              <div className="w-16 h-2 bg-muted rounded-full overflow-hidden">
                                <div className={`h-full rounded-full ${srv.ram_usage_pct > 90 ? "bg-red-500" : srv.ram_usage_pct > 70 ? "bg-amber-500" : "bg-emerald-500"}`} style={{ width: `${srv.ram_usage_pct}%` }} />
                              </div>
                              <span className="text-xs">{formatPct(srv.ram_usage_pct)}</span>
                            </div>
                          ) : "—"}
                        </TableCell>
                        <TableCell>
                          {Array.isArray((srv as any).disks) && (srv as any).disks.length > 0 ? (
                            <div className="space-y-1">
                              {((srv as any).disks as any[]).map((d: any, i: number) => (
                                <UsageBar key={i} label={String(d.drive ?? d.letter ?? d.name ?? "").replace(/\\$/, "")} value={d.usage_pct} />
                              ))}
                            </div>
                          ) : <UsageBar value={srv.disk_usage_pct} />}
                          {(srv as any).pending_reboot && <Badge variant="outline" className="mt-1 border-amber-500/40 text-amber-400 text-[10px]">reboot pendente</Badge>}
                        </TableCell>
                        <TableCell className="text-xs">{formatUptime(srv.uptime_seconds as number | null)}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {srv.last_polled_at ? formatTimeAgo(srv.last_polled_at) : "Nunca"}
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            <Button size="icon" variant="ghost" onClick={() => openEdit(srv, "windows")}><Edit className="w-4 h-4" /></Button>
                            <Button size="icon" variant="ghost" className="text-destructive" onClick={() => deleteItem.mutate({ table: "windows_servers", id: srv.id })}><Trash2 className="w-4 h-4" /></Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                    {(!windowsServers || windowsServers.length === 0) && (
                      <TableRow>
                        <TableCell colSpan={10} className="text-center py-8 text-muted-foreground">
                          Nenhum servidor Windows cadastrado
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            {/* Detalhe por servidor: serviços, top processos e eventos */}
            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              {windowsServers?.filter((s: any) => (s.services_status as any[])?.length || (s.top_processes as any[])?.length || (s.event_errors as any[])?.length).map((srv: any) => {
                const services = (Array.isArray(srv.services_status) ? srv.services_status : []) as any[];
                const procs = (Array.isArray(srv.top_processes) ? srv.top_processes : []) as any[];
                const events = (Array.isArray(srv.event_errors) ? srv.event_errors : []) as any[];
                const byCpu = procs.filter((p) => p.by !== "memory").slice(0, 5);
                const byMem = procs.filter((p) => p.by === "memory").slice(0, 5);
                return (
                  <Card key={srv.id}>
                    <CardHeader className="py-3 px-4">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <Server className="w-4 h-4" /> {srv.name}
                        {srv.pending_reboot && <Badge variant="outline" className="border-amber-500/40 text-amber-400 text-[10px]">reboot pendente</Badge>}
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="px-4 pb-4 space-y-3 text-xs">
                      {services.length > 0 && (
                        <div>
                          <p className="mb-1 font-medium text-muted-foreground">Serviços</p>
                          <div className="flex flex-wrap gap-1">
                            {services.map((svc, i) => (
                              <Badge key={i} variant="outline" title={svc.display_name || svc.name}
                                className={svc.status === "Running" ? "border-emerald-500/30 text-emerald-400" : "border-red-500/30 bg-red-500/10 text-red-400"}>
                                {svc.name}{svc.status !== "Running" ? ` · ${svc.status || "parado"}` : ""}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      )}
                      {procs.length > 0 && (
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <p className="mb-1 font-medium text-muted-foreground">Top CPU</p>
                            {byCpu.map((p, i) => <div key={i} className="flex justify-between gap-2"><span className="truncate">{p.name}</span><span className="tabular-nums">{p.cpu_pct ?? 0}%</span></div>)}
                          </div>
                          <div>
                            <p className="mb-1 font-medium text-muted-foreground">Top memória</p>
                            {byMem.map((p, i) => <div key={i} className="flex justify-between gap-2"><span className="truncate">{p.name}</span><span className="tabular-nums">{p.mem_mb != null ? `${Math.round(p.mem_mb)} MB` : "—"}</span></div>)}
                          </div>
                        </div>
                      )}
                      <div>
                        <p className="mb-1 font-medium text-muted-foreground">Eventos recentes (System)</p>
                        {events.length === 0 ? <p className="text-muted-foreground">Nenhum erro desde a última coleta.</p> : (
                          <div className="max-h-40 space-y-1 overflow-y-auto">
                            {events.slice(0, 10).map((e, i) => (
                              <div key={i} className="rounded border border-border px-2 py-1">
                                <div className="flex justify-between gap-2">
                                  <span className={e.level === "Critical" ? "font-medium text-red-400" : "text-amber-400"}>{e.level} · {e.source} ({e.event_id})</span>
                                  <span className="text-muted-foreground">{e.time ? fmtAgo(e.time) : ""}</span>
                                </div>
                                {e.message && <p className="line-clamp-2 text-muted-foreground">{e.message}</p>}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          
          

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editing ? "Editar" : "Adicionar"} Servidor Windows</DialogTitle></DialogHeader>
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
            <Button className="w-full" onClick={submit} disabled={save.isPending}>{editing ? "Salvar" : "Adicionar"}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
