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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "@/hooks/use-toast";
import { ChevronDown, ChevronRight, Database, Edit, Plus, Trash2 } from "lucide-react";
import { StatusDot, UsageBar, backupAgeClass, fmtAgo, fmtUptime, isStale } from "./monitorUi";

const db = supabase as any;
const arr = (v: any): any[] => (Array.isArray(v) ? v : []);

const COLS = "id, client_id, windows_server_id, name, instance, auth_mode, username, is_active, status, version, edition, uptime_seconds, sql_cpu_pct, ple_seconds, buffer_cache_hit_pct, batch_requests_sec, user_connections, blocked_sessions, longest_block_seconds, long_running_queries, databases, failed_jobs, top_waits, io_latency, agent_running, max_server_memory_mb, memory_used_mb, agent_version, last_success_at, last_polled_at, last_error, clients(full_name)";

interface Props { clients: { id: string; full_name: string }[] | undefined }
const empty = { id: "", name: "", instance: "", client_id: "", auth_mode: "windows", username: "", password: "", is_active: true };

const latencyClass = (ms: number | null | undefined) =>
  ms == null ? "text-muted-foreground" : ms < 10 ? "text-emerald-400" : ms <= 20 ? "text-amber-400" : "text-red-400";

function Metric({ label, value, tone }: { label: string; value: React.ReactNode; tone?: string }) {
  return (
    <div className="rounded-md border border-border p-2">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className={`text-sm font-semibold ${tone ?? ""}`}>{value}</p>
    </div>
  );
}

export default function SqlServerTab({ clients }: Props) {
  const qc = useQueryClient();
  const [expanded, setExpanded] = useState<string | null>(null);
  const [form, setForm] = useState<typeof empty | null>(null);

  const { data: instances = [], isLoading } = useQuery({
    queryKey: ["sql-instances"],
    queryFn: async () => {
      const { data, error } = await db.from("sql_instances").select(COLS).order("name");
      if (error) throw error;
      return data || [];
    },
    refetchInterval: 30000,
  });

  const save = async () => {
    if (!form) return;
    if (!form.name.trim() || !form.instance.trim() || !form.client_id) {
      toast({ title: "Preencha nome, instância e cliente", variant: "destructive" }); return;
    }
    const row: Record<string, any> = {
      name: form.name.trim(), instance: form.instance.trim(), client_id: form.client_id,
      auth_mode: form.auth_mode, is_active: form.is_active,
      username: form.auth_mode === "sql" ? form.username.trim() || null : null,
    };
    if (form.auth_mode === "windows") row.password = null;
    else if (form.password) row.password = form.password; // vazio na edição = manter
    else if (!form.id) { toast({ title: "Informe a senha do login SQL", variant: "destructive" }); return; }
    const { error } = form.id
      ? await db.from("sql_instances").update(row).eq("id", form.id)
      : await db.from("sql_instances").insert(row);
    if (error) { toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" }); return; }
    toast({ title: form.id ? "Instância atualizada" : "Instância cadastrada" });
    setForm(null);
    qc.invalidateQueries({ queryKey: ["sql-instances"] });
  };

  const remove = async (s: any) => {
    if (!confirm(`Excluir a instância ${s.name}?`)) return;
    const { error } = await db.from("sql_instances").delete().eq("id", s.id);
    if (error) { toast({ title: "Erro ao excluir", description: error.message, variant: "destructive" }); return; }
    qc.invalidateQueries({ queryKey: ["sql-instances"] });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">Instâncias coletadas pelo <code>sqlserver-collector.ps1</code>.</p>
        <Button size="sm" onClick={() => setForm({ ...empty })}><Plus className="mr-1 h-4 w-4" /> Nova instância</Button>
      </div>

      {!isLoading && instances.length === 0 && (
        <Card><CardContent className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
          <Database className="h-4 w-4" /> Nenhuma instância SQL cadastrada. Clique em "Nova instância" e instale o coletor SQL Server numa máquina Windows da rede do cliente.
        </CardContent></Card>
      )}

      {instances.map((s: any) => {
        const stale = isStale(s.last_polled_at);
        const dbs = arr(s.databases);
        const open = expanded === s.id;
        const maxMemUnset = s.max_server_memory_mb != null && Number(s.max_server_memory_mb) >= 2_000_000;
        const memPct = !maxMemUnset && s.max_server_memory_mb > 0 && s.memory_used_mb != null
          ? (Number(s.memory_used_mb) / Number(s.max_server_memory_mb)) * 100 : null;
        const isExpress = String(s.edition ?? "").includes("Express");
        return (
          <Card key={s.id} className={!s.is_active ? "opacity-60" : ""}>
            <CardHeader className="pb-2">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <StatusDot status={s.status} stale={stale} /> {s.name}
                    <span className="font-mono text-xs font-normal text-muted-foreground">{s.instance}</span>
                    {!isExpress && s.agent_running === false && <Badge variant="outline" className="border-amber-500/40 text-[10px] text-amber-400">SQL Agent parado</Badge>}
                  </CardTitle>
                  <p className="text-xs text-muted-foreground">
                    {s.clients?.full_name ?? "—"} · {s.edition ?? "edição?"} {s.version ?? ""} · ligado há {fmtUptime(s.uptime_seconds)} · coleta {fmtAgo(s.last_polled_at)} · auth {s.auth_mode}
                  </p>
                </div>
                <div className="flex shrink-0 gap-1">
                  <Button size="icon" variant="ghost" onClick={() => setForm({ id: s.id, name: s.name, instance: s.instance, client_id: s.client_id, auth_mode: s.auth_mode, username: s.username ?? "", password: "", is_active: s.is_active })}><Edit className="h-4 w-4" /></Button>
                  <Button size="icon" variant="ghost" className="text-destructive" onClick={() => remove(s)}><Trash2 className="h-4 w-4" /></Button>
                </div>
              </div>
              {s.last_error && <p className="text-xs text-red-400">{s.last_error}</p>}
            </CardHeader>
            <CardContent className="space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
                <Metric label="CPU do SQL" value={<UsageBar value={s.sql_cpu_pct} />} />
                <Metric label="PLE" value={s.ple_seconds != null ? `${s.ple_seconds}s` : "—"} tone={s.ple_seconds != null && s.ple_seconds < 300 ? "text-red-400" : ""} />
                <Metric label="Cache hit" value={s.buffer_cache_hit_pct != null ? `${Number(s.buffer_cache_hit_pct).toFixed(1)}%` : "—"} tone={s.buffer_cache_hit_pct != null && s.buffer_cache_hit_pct < 95 ? "text-amber-400" : ""} />
                <Metric label="Batch/s" value={s.batch_requests_sec ?? "—"} />
                <Metric label="Conexões" value={s.user_connections ?? "—"} />
                <Metric label="Maior bloqueio" value={s.blocked_sessions ? `${s.longest_block_seconds}s (${s.blocked_sessions})` : "nenhum"} tone={s.blocked_sessions ? "text-red-400" : "text-emerald-400"} />
                <Metric label="Memória" value={
                  s.memory_used_mb == null ? "—" : maxMemUnset
                    ? <span className="text-amber-400" title="max server memory não configurado: o SQL pode tomar toda a RAM do servidor">{Math.round(s.memory_used_mb)} MB · max não configurado</span>
                    : <span>{Math.round(s.memory_used_mb)} / {s.max_server_memory_mb} MB {memPct != null ? `(${memPct.toFixed(0)}%)` : ""}</span>
                } />
              </div>

              {dbs.length > 0 && (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow><TableHead>Banco</TableHead><TableHead>Estado</TableHead><TableHead>Recovery</TableHead><TableHead>Tamanho</TableHead><TableHead>Log</TableHead><TableHead>Último FULL</TableHead><TableHead>Último LOG</TableHead></TableRow>
                    </TableHeader>
                    <TableBody>
                      {dbs.map((d, i) => {
                        const system = ["tempdb", "model"].includes(d.name);
                        return (
                          <TableRow key={i}>
                            <TableCell className="font-medium">{d.name}</TableCell>
                            <TableCell className={d.state !== "ONLINE" ? "text-red-400" : "text-emerald-400"}>{d.state}</TableCell>
                            <TableCell>{d.recovery}</TableCell>
                            <TableCell>{d.data_mb != null ? `${Math.round(d.data_mb + (d.log_mb ?? 0))} MB` : "—"}</TableCell>
                            <TableCell>
                              <UsageBar value={d.log_used_pct} warn={80} crit={90} />
                              {d.log_reuse_wait && d.log_reuse_wait !== "NOTHING" && <span className="text-[10px] text-muted-foreground">{d.log_reuse_wait}</span>}
                            </TableCell>
                            <TableCell className={system ? "text-muted-foreground" : backupAgeClass(d.last_full_backup, 26)}>
                              {d.last_full_backup ? fmtAgo(d.last_full_backup) : system ? "—" : "nunca"}
                            </TableCell>
                            <TableCell className={d.recovery === "FULL" ? backupAgeClass(d.last_log_backup, 2) : "text-muted-foreground"}>
                              {d.recovery === "FULL" ? (d.last_log_backup ? fmtAgo(d.last_log_backup) : "nunca") : "n/a"}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}

              <button type="button" className="flex items-center gap-1 text-muted-foreground hover:text-foreground" onClick={() => setExpanded(open ? null : s.id)}>
                {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />} Consultas, disco, esperas e jobs
              </button>
              {open && (
                <div className="grid gap-4 border-t border-border pt-3 lg:grid-cols-2">
                  <div>
                    <p className="mb-1 font-medium text-muted-foreground">Consultas longas (&gt;60s)</p>
                    {arr(s.long_running_queries).length === 0 ? <p className="text-muted-foreground">Nenhuma.</p> : arr(s.long_running_queries).map((q, i) => (
                      <div key={i} className="mb-2 rounded border border-border p-2">
                        <p><b>SPID {q.session_id}</b> · {q.seconds}s · {q.db} · {q.login}@{q.host} · {q.program}</p>
                        {q.blocking_session_id ? <p className="text-red-400">Bloqueada pela sessão {q.blocking_session_id}</p> : null}
                        {q.wait_type && <p className="text-muted-foreground">Espera: {q.wait_type}</p>}
                        <pre className="mt-1 max-h-24 overflow-auto whitespace-pre-wrap rounded bg-muted p-1 text-[11px]">{q.text}</pre>
                      </div>
                    ))}
                  </div>
                  <div>
                    <p className="mb-1 font-medium text-muted-foreground">Latência de disco <span className="font-normal">(&lt;10 ms ótimo · 10–20 aceitável · &gt;20 lento)</span></p>
                    {arr(s.io_latency).length === 0 ? <p className="text-muted-foreground">Sem dados (aparece a partir da 2ª coleta).</p> : (
                      <table className="w-full"><thead><tr className="text-left text-muted-foreground"><th>Banco</th><th>Tipo</th><th>Leitura</th><th>Escrita</th></tr></thead>
                        <tbody>{arr(s.io_latency).map((x, i) => (
                          <tr key={i}><td>{x.db}</td><td>{x.type}</td>
                            <td className={latencyClass(x.read_ms)}>{x.read_ms != null ? `${x.read_ms} ms` : "—"}</td>
                            <td className={latencyClass(x.write_ms)}>{x.write_ms != null ? `${x.write_ms} ms` : "—"}</td></tr>
                        ))}</tbody></table>
                    )}
                  </div>
                  <div>
                    <p className="mb-1 font-medium text-muted-foreground">Top esperas</p>
                    {arr(s.top_waits).length === 0 ? <p className="text-muted-foreground">Sem dados.</p> : arr(s.top_waits).map((w, i) => (
                      <div key={i} className="flex justify-between gap-2"><span className="font-mono">{w.wait_type}</span><span>{Math.round((w.wait_time_ms ?? 0) / 1000)}s</span></div>
                    ))}
                  </div>
                  <div>
                    <p className="mb-1 font-medium text-muted-foreground">Jobs com falha (24h)</p>
                    {isExpress ? <p className="text-muted-foreground">Express não tem SQL Agent.</p> : arr(s.failed_jobs).length === 0 ? <p className="text-emerald-400">Nenhum.</p> : arr(s.failed_jobs).map((j, i) => (
                      <div key={i} className="mb-1"><p className="font-medium text-amber-400">{j.name}</p><p className="text-muted-foreground">{j.message}</p></div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}

      <Dialog open={!!form} onOpenChange={(o) => !o && setForm(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{form?.id ? "Editar" : "Nova"} instância SQL Server</DialogTitle></DialogHeader>
          {form && (
            <div className="space-y-3">
              <div><Label>Cliente</Label>
                <Select value={form.client_id} onValueChange={(v) => setForm({ ...form, client_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                  <SelectContent>{clients?.map((c) => <SelectItem key={c.id} value={c.id}>{c.full_name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>Nome</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="ERP produção" /></div>
              <div><Label>Instância</Label><Input value={form.instance} onChange={(e) => setForm({ ...form, instance: e.target.value })} placeholder="SRV\SQLEXPRESS ou 10.0.0.5,1433" /></div>
              <div><Label>Autenticação</Label>
                <Select value={form.auth_mode} onValueChange={(v) => setForm({ ...form, auth_mode: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="windows">Windows (conta do serviço do coletor)</SelectItem><SelectItem value="sql">Login SQL</SelectItem></SelectContent>
                </Select>
              </div>
              {form.auth_mode === "sql" && (
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>Usuário</Label><Input value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} /></div>
                  <div><Label>Senha</Label><Input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder={form.id ? "em branco = manter" : ""} /></div>
                </div>
              )}
              <div className="flex items-center gap-2"><Switch checked={form.is_active} onCheckedChange={(v) => setForm({ ...form, is_active: v })} /><Label>Ativo</Label></div>
            </div>
          )}
          <DialogFooter><Button variant="outline" onClick={() => setForm(null)}>Cancelar</Button><Button onClick={save}>Salvar</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
