import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import { ChevronDown, ChevronRight, Copy, Edit, Plus, Terminal, Trash2 } from "lucide-react";
import { StatusDot, UsageBar, fmtAgo, fmtUptime, isStale } from "./monitorUi";

const db = supabase as any;
const arr = (v: any): any[] => (Array.isArray(v) ? v : []);
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;

interface Props { clients: { id: string; full_name: string }[] | undefined }

const empty = { id: "", name: "", host: "", client_id: "", is_active: true };

export default function LinuxServersTab({ clients }: Props) {
  const qc = useQueryClient();
  const [expanded, setExpanded] = useState<string | null>(null);
  const [form, setForm] = useState<typeof empty | null>(null);

  const { data: servers = [], isLoading } = useQuery({
    queryKey: ["linux-servers"],
    queryFn: async () => {
      const { data, error } = await db.from("linux_servers").select("*, clients(full_name)").order("name");
      if (error) throw error;
      return data || [];
    },
    refetchInterval: 30000,
  });

  const save = async () => {
    if (!form) return;
    if (!form.name.trim() || !form.host.trim() || !form.client_id) {
      toast({ title: "Preencha nome, host e cliente", variant: "destructive" }); return;
    }
    const row = { name: form.name.trim(), host: form.host.trim(), client_id: form.client_id, is_active: form.is_active };
    const { error } = form.id
      ? await db.from("linux_servers").update(row).eq("id", form.id)
      : await db.from("linux_servers").insert(row);
    if (error) { toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" }); return; }
    toast({ title: form.id ? "Servidor atualizado" : "Servidor cadastrado" });
    setForm(null);
    qc.invalidateQueries({ queryKey: ["linux-servers"] });
  };

  const remove = async (s: any) => {
    if (!confirm(`Excluir o servidor ${s.name}?`)) return;
    const { error } = await db.from("linux_servers").delete().eq("id", s.id);
    if (error) { toast({ title: "Erro ao excluir", description: error.message, variant: "destructive" }); return; }
    qc.invalidateQueries({ queryKey: ["linux-servers"] });
  };

  const copy = (t: string) => { navigator.clipboard.writeText(t); toast({ title: "Copiado" }); };
  const installCmd = `sudo bash linux-agent.sh install --token <TOKEN> --url "${SUPABASE_URL}" --services "nginx postgresql"`;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">Servidores Linux com o agente <code>mororo-linux-agent</code>. Sem --server-id, o agente se cadastra pelo hostname.</p>
        <Button size="sm" onClick={() => setForm({ ...empty })}><Plus className="mr-1 h-4 w-4" /> Novo servidor</Button>
      </div>

      {!isLoading && servers.length === 0 && (
        <Card>
          <CardContent className="space-y-3 p-6 text-sm">
            <p className="flex items-center gap-2 font-medium"><Terminal className="h-4 w-4" /> Nenhum servidor Linux ainda</p>
            <p className="text-muted-foreground">Gere um token na aba "Agentes & Alertas", baixe o pacote do agente Linux e rode no servidor:</p>
            <div className="flex items-start gap-2">
              <pre className="flex-1 overflow-x-auto rounded bg-muted p-3 text-xs">{installCmd}</pre>
              <Button size="icon" variant="outline" onClick={() => copy(installCmd)}><Copy className="h-4 w-4" /></Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 xl:grid-cols-2">
        {servers.map((s: any) => {
          const stale = isStale(s.last_polled_at);
          const disks = arr(s.disks);
          const services = arr(s.services_status);
          const failed = arr(s.failed_units);
          const raid = arr(s.raid_status);
          const zfs = arr(s.zfs_pools);
          const procs = arr(s.top_processes);
          const open = expanded === s.id;
          const swapPct = s.swap_total_gb > 0 ? (Number(s.swap_used_gb) / Number(s.swap_total_gb)) * 100 : null;
          const topDisks = [...disks].sort((a, b) => (b.pct ?? 0) - (a.pct ?? 0)).slice(0, 3);
          return (
            <Card key={s.id} className={!s.is_active ? "opacity-60" : ""}>
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <CardTitle className="flex items-center gap-2 text-base">
                      <StatusDot status={s.status} stale={stale} /> {s.name}
                      {s.reboot_required && <Badge variant="outline" className="border-amber-500/40 text-[10px] text-amber-400">reboot pendente</Badge>}
                      {!s.is_active && <Badge variant="outline" className="text-[10px]">inativo</Badge>}
                    </CardTitle>
                    <p className="truncate text-xs text-muted-foreground">
                      {s.clients?.full_name ?? "—"} · {s.host} · {s.distro ?? "distro?"} · {s.kernel ?? ""}
                    </p>
                    <p className="text-xs text-muted-foreground">Coleta {fmtAgo(s.last_polled_at)} · ligado há {fmtUptime(s.uptime_seconds)} {s.agent_version ? `· agente ${s.agent_version}` : ""}</p>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <Button size="icon" variant="ghost" onClick={() => setForm({ id: s.id, name: s.name, host: s.host, client_id: s.client_id, is_active: s.is_active })}><Edit className="h-4 w-4" /></Button>
                    <Button size="icon" variant="ghost" className="text-destructive" onClick={() => remove(s)}><Trash2 className="h-4 w-4" /></Button>
                  </div>
                </div>
                {s.last_error && <p className="text-xs text-red-400">{s.last_error}</p>}
              </CardHeader>
              <CardContent className="space-y-3 text-xs">
                <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                  <div className="flex items-center justify-between"><span className="text-muted-foreground">CPU</span><UsageBar value={s.cpu_usage_pct} /></div>
                  <div className="flex items-center justify-between"><span className="text-muted-foreground">iowait</span><UsageBar value={s.iowait_pct} warn={20} crit={40} /></div>
                  <div className="flex items-center justify-between"><span className="text-muted-foreground">RAM</span><UsageBar value={s.ram_usage_pct} /></div>
                  <div className="flex items-center justify-between"><span className="text-muted-foreground">Swap</span><UsageBar value={swapPct} warn={50} crit={80} /></div>
                </div>
                <p className="text-muted-foreground">
                  Load {s.load_1 ?? "—"} / {s.load_5 ?? "—"} / {s.load_15 ?? "—"} {s.cpu_cores ? `· ${s.cpu_cores} núcleos` : ""}
                  {s.ram_total_gb ? ` · ${Number(s.ram_used_gb).toFixed(1)}/${Number(s.ram_total_gb).toFixed(1)} GB` : ""}
                </p>
                {topDisks.length > 0 && (
                  <div className="space-y-1">
                    {topDisks.map((d, i) => (
                      <div key={i} className="flex items-center justify-between gap-2">
                        <span className="truncate font-mono">{d.mount}</span><UsageBar value={d.pct} />
                      </div>
                    ))}
                  </div>
                )}
                <div className="flex flex-wrap gap-1">
                  {services.map((sv, i) => (
                    <Badge key={i} variant="outline" className={sv.status === "active" ? "border-emerald-500/30 text-emerald-400" : "border-red-500/30 bg-red-500/10 text-red-400"}>
                      {sv.name}{sv.status !== "active" ? ` · ${sv.status}` : ""}
                    </Badge>
                  ))}
                  {failed.map((u, i) => <Badge key={`f${i}`} variant="outline" className="border-amber-500/30 text-amber-400">falhou: {typeof u === "string" ? u : u.name}</Badge>)}
                  {raid.map((r, i) => <Badge key={`r${i}`} variant="outline" className={r.degraded ? "border-red-500/30 bg-red-500/10 text-red-400" : "border-emerald-500/30 text-emerald-400"}>RAID {r.device} {r.degraded ? "degradado" : "ok"}</Badge>)}
                  {zfs.map((z, i) => <Badge key={`z${i}`} variant="outline" className={z.health !== "ONLINE" ? "border-red-500/30 bg-red-500/10 text-red-400" : "border-emerald-500/30 text-emerald-400"}>ZFS {z.name} {z.health} {z.capacity_pct != null ? `${z.capacity_pct}%` : ""}</Badge>)}
                  {s.pending_updates > 0 && <Badge variant="outline" className="text-blue-400">{s.pending_updates} atualizações{s.security_updates ? ` (${s.security_updates} segurança)` : ""}</Badge>}
                </div>
                <button type="button" className="flex items-center gap-1 text-muted-foreground hover:text-foreground" onClick={() => setExpanded(open ? null : s.id)}>
                  {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />} Detalhes
                </button>
                {open && (
                  <div className="space-y-3 border-t border-border pt-3">
                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground">ID (--server-id):</span>
                      <code className="rounded bg-muted px-1">{s.id}</code>
                      <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => copy(s.id)}><Copy className="h-3 w-3" /></Button>
                    </div>
                    <div>
                      <p className="mb-1 font-medium text-muted-foreground">Todos os discos</p>
                      <div className="overflow-x-auto">
                        <table className="w-full">
                          <thead><tr className="text-left text-muted-foreground"><th>Montagem</th><th>Tipo</th><th>Uso</th><th>Inodes</th><th>Usado/Total</th></tr></thead>
                          <tbody>
                            {disks.map((d, i) => (
                              <tr key={i}><td className="font-mono">{d.mount}</td><td>{d.fstype ?? ""}</td><td><UsageBar value={d.pct} /></td>
                                <td>{d.inode_pct != null ? `${d.inode_pct}%` : "—"}</td><td>{d.used_gb ?? "?"}/{d.total_gb ?? "?"} GB</td></tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                    <div>
                      <p className="mb-1 font-medium text-muted-foreground">Top processos</p>
                      {procs.length === 0 ? <p className="text-muted-foreground">Sem dados.</p> : procs.map((p, i) => (
                        <div key={i} className="flex justify-between gap-2"><span className="truncate">{p.name} <span className="text-muted-foreground">({p.pid})</span></span><span className="tabular-nums">CPU {p.cpu_pct ?? 0}% · MEM {p.mem_pct ?? 0}%</span></div>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Dialog open={!!form} onOpenChange={(o) => !o && setForm(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{form?.id ? "Editar" : "Novo"} servidor Linux</DialogTitle></DialogHeader>
          {form && (
            <div className="space-y-3">
              <div><Label>Cliente</Label>
                <Select value={form.client_id} onValueChange={(v) => setForm({ ...form, client_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                  <SelectContent>{clients?.map((c) => <SelectItem key={c.id} value={c.id}>{c.full_name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>Nome</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="srv-web01" /></div>
              <div><Label>Host / IP</Label><Input value={form.host} onChange={(e) => setForm({ ...form, host: e.target.value })} placeholder="10.0.0.20" /></div>
              <div className="flex items-center gap-2"><Switch checked={form.is_active} onCheckedChange={(v) => setForm({ ...form, is_active: v })} /><Label>Ativo</Label></div>
              {form.id && <p className="text-xs text-muted-foreground">ID para --server-id: <code>{form.id}</code></p>}
            </div>
          )}
          <DialogFooter><Button variant="outline" onClick={() => setForm(null)}>Cancelar</Button><Button onClick={save}>Salvar</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
