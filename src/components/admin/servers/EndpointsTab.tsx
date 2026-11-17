import { useMemo, useState } from "react";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "@/hooks/use-toast";
import { Download, Laptop, Monitor, PackageSearch, Search, Server, ShieldAlert, ShieldCheck, Trash2 } from "lucide-react";
import { StatusDot, UsageBar, fmtAgo, fmtUptime } from "./monitorUi";

const db = supabase as any;
const arr = (v: any): any[] => (Array.isArray(v) ? v : []);

interface Props { clients: { id: string; full_name: string }[] | undefined }

/** Estações desligam à noite: só ficam "sem dados" depois de 3 ciclos; servidores, depois de 15 min. */
function endpointStale(e: any) {
  if (!e.last_seen_at) return true;
  const limit = e.role === "server" ? 15 : 50;
  return Date.now() - new Date(e.last_seen_at).getTime() > limit * 60_000;
}

export default function EndpointsTab({ clients }: Props) {
  const qc = useQueryClient();
  const [client, setClient] = useState("all");
  const [role, setRole] = useState("all");
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<any | null>(null);
  const [swQuery, setSwQuery] = useState("");
  const [swSearch, setSwSearch] = useState("");

  const { data: endpoints = [], isLoading } = useQuery({
    queryKey: ["agent-endpoints"],
    queryFn: async () => {
      const { data, error } = await db.from("agent_endpoints").select("*, clients(full_name)").order("name");
      if (error) throw error;
      return data || [];
    },
    refetchInterval: 30000,
  });

  const filtered = useMemo(() => endpoints.filter((e: any) =>
    (client === "all" || e.client_id === client) && (role === "all" || e.role === role) &&
    (!q || `${e.name} ${e.hostname} ${e.logged_user} ${arr(e.ip_addresses).join(" ")} ${e.serial_number} ${e.model}`.toLowerCase().includes(q.toLowerCase()))
  ), [endpoints, client, role, q]);

  const counts = useMemo(() => ({
    total: filtered.length,
    online: filtered.filter((e: any) => !endpointStale(e)).length,
    servers: filtered.filter((e: any) => e.role === "server").length,
    reboot: filtered.filter((e: any) => e.pending_reboot).length,
    noAv: filtered.filter((e: any) => arr(e.antivirus).length > 0 && !arr(e.antivirus).some((a: any) => a.enabled)).length,
  }), [filtered]);

  // Busca de software em todas as máquinas ("quem tem AnyDesk?").
  const { data: swResults = [], isFetching: swLoading } = useQuery({
    queryKey: ["agent-software-search", swSearch],
    enabled: swSearch.length >= 2,
    queryFn: async () => {
      const { data, error } = await db.from("agent_software")
        .select("name, version, publisher, endpoint_id, agent_endpoints(name, client_id, clients(full_name))")
        .ilike("name", `%${swSearch}%`).order("name").limit(500);
      if (error) throw error;
      return data || [];
    },
  });

  const exportCsv = () => {
    const head = ["Nome", "Hostname", "Cliente", "Função", "Sistema", "Usuário", "IP", "Fabricante", "Modelo", "Série", "CPU", "RAM (GB)", "Acesso remoto", "Última comunicação"];
    const rows = filtered.map((e: any) => [e.name, e.hostname, e.clients?.full_name, e.role === "server" ? "Servidor" : "Estação", e.os_name, e.logged_user,
      arr(e.ip_addresses).join(" "), e.manufacturer, e.model, e.serial_number, e.cpu_model, e.ram_total_gb, e.remote_access_id, e.last_seen_at]);
    const csv = [head, ...rows].map((r) => r.map((v: any) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(";")).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }));
    a.download = "inventario-endpoints.csv";
    a.click();
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Máquinas com o <b>Mororo.Tech Agent</b> (servidores e estações). Instale baixando o agente na aba "Agentes & Alertas".
        </p>
        <Button size="sm" variant="outline" onClick={exportCsv} disabled={!filtered.length}><Download className="mr-1 h-4 w-4" /> Exportar CSV</Button>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        {[["Máquinas", counts.total], ["Comunicando", counts.online], ["Servidores", counts.servers], ["Reinício pendente", counts.reboot], ["Antivírus desligado", counts.noAv]].map(([l, v]) => (
          <Card key={l as string}><CardContent className="p-4"><div className="text-xs text-muted-foreground">{l}</div><div className="text-2xl font-semibold">{v}</div></CardContent></Card>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        <Select value={client} onValueChange={setClient}>
          <SelectTrigger className="h-9 w-[220px]"><SelectValue placeholder="Cliente" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os clientes</SelectItem>
            {clients?.map((c) => <SelectItem key={c.id} value={c.id}>{c.full_name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={role} onValueChange={setRole}>
          <SelectTrigger className="h-9 w-[170px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Servidores e estações</SelectItem>
            <SelectItem value="server">Só servidores</SelectItem>
            <SelectItem value="workstation">Só estações</SelectItem>
          </SelectContent>
        </Select>
        <div className="relative">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input className="h-9 w-[260px] pl-8" placeholder="Nome, usuário, IP, série…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead /><TableHead>Máquina</TableHead><TableHead>Cliente</TableHead><TableHead>Sistema</TableHead><TableHead>Usuário / IP</TableHead>
                  <TableHead>Uso</TableHead><TableHead>Acesso remoto</TableHead><TableHead>Última comunicação</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((e: any) => {
                  const av = arr(e.antivirus);
                  const avOff = av.length > 0 && !av.some((a: any) => a.enabled);
                  return (
                    <TableRow key={e.id} className="cursor-pointer" onClick={() => setOpen(e)}>
                      <TableCell><StatusDot status={e.status} stale={endpointStale(e)} /></TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2 font-medium">
                          {e.role === "server" ? <Server className="h-4 w-4 text-muted-foreground" /> : <Laptop className="h-4 w-4 text-muted-foreground" />}
                          {e.name}
                          {e.pending_reboot && <Badge variant="outline" className="text-[10px] text-amber-400">reiniciar</Badge>}
                          {avOff && <Badge variant="outline" className="text-[10px] text-red-400">sem antivírus</Badge>}
                        </div>
                        <div className="text-xs text-muted-foreground">{[e.manufacturer, e.model].filter(Boolean).join(" ") || e.hostname}</div>
                      </TableCell>
                      <TableCell className="text-sm">{e.clients?.full_name}</TableCell>
                      <TableCell className="text-xs">{e.os_name}<div className="text-muted-foreground">v{e.agent_version}</div></TableCell>
                      <TableCell className="text-xs">{e.logged_user || "—"}<div className="text-muted-foreground">{arr(e.ip_addresses).join(", ")}</div></TableCell>
                      <TableCell className="space-y-1">
                        <UsageBar label="CPU" value={e.cpu_usage_pct} />
                        <UsageBar label="RAM" value={e.ram_usage_pct} />
                        <UsageBar label="DSK" value={e.disk_usage_pct} />
                      </TableCell>
                      <TableCell className="font-mono text-xs">{e.remote_access_id || "—"}</TableCell>
                      <TableCell className="text-xs">{fmtAgo(e.last_seen_at)}</TableCell>
                    </TableRow>
                  );
                })}
                {!isLoading && filtered.length === 0 && (
                  <TableRow><TableCell colSpan={8} className="py-8 text-center text-muted-foreground">
                    Nenhuma máquina ainda. Gere um token com o escopo <b>Agente unificado</b> e rode o instalador <code>mororo-agent.exe</code> no computador do cliente.
                  </TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base"><PackageSearch className="h-4 w-4" /> Procurar programa instalado</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <form className="flex gap-2" onSubmit={(ev) => { ev.preventDefault(); setSwSearch(swQuery.trim()); }}>
            <Input className="max-w-sm" placeholder="ex.: AnyDesk, Office, Chrome…" value={swQuery} onChange={(e) => setSwQuery(e.target.value)} />
            <Button type="submit" size="sm">Procurar</Button>
          </form>
          {swSearch && (
            <div className="max-h-72 overflow-auto rounded border">
              <Table>
                <TableHeader><TableRow><TableHead>Programa</TableHead><TableHead>Versão</TableHead><TableHead>Máquina</TableHead><TableHead>Cliente</TableHead></TableRow></TableHeader>
                <TableBody>
                  {swResults.map((s: any, i: number) => (
                    <TableRow key={i}>
                      <TableCell className="text-sm">{s.name}</TableCell>
                      <TableCell className="text-xs">{s.version}</TableCell>
                      <TableCell className="text-sm">{s.agent_endpoints?.name}</TableCell>
                      <TableCell className="text-xs">{s.agent_endpoints?.clients?.full_name}</TableCell>
                    </TableRow>
                  ))}
                  {!swLoading && swResults.length === 0 && <TableRow><TableCell colSpan={4} className="py-4 text-center text-muted-foreground">Nada encontrado.</TableCell></TableRow>}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {open && <EndpointDialog endpoint={open} onClose={() => setOpen(null)} onChanged={() => qc.invalidateQueries({ queryKey: ["agent-endpoints"] })} />}
    </div>
  );
}

function EndpointDialog({ endpoint: e, onClose, onChanged }: { endpoint: any; onClose: () => void; onChanged: () => void }) {
  const [swFilter, setSwFilter] = useState("");
  const settings = e.settings || {};
  const [form, setForm] = useState({
    name: e.name as string,
    role: e.role as string,
    services: arr(settings.services).join(", "),
    desktop: settings.desktop?.enabled !== false,
    interval: String(settings.metrics_interval_seconds || ""),
  });
  const [saving, setSaving] = useState(false);

  const { data: software = [] } = useQuery({
    queryKey: ["agent-software", e.id],
    queryFn: async () => {
      const { data, error } = await db.from("agent_software").select("name, version, publisher, install_date").eq("endpoint_id", e.id).order("name");
      if (error) throw error;
      return data || [];
    },
  });

  const save = async () => {
    setSaving(true);
    const newSettings = {
      ...settings,
      services: form.services.split(",").map((s) => s.trim()).filter(Boolean),
      desktop: { ...(settings.desktop || {}), enabled: form.desktop },
      metrics_interval_seconds: Number(form.interval) || undefined,
    };
    const { error } = await db.from("agent_endpoints").update({ name: form.name.trim() || e.name, role: form.role, settings: newSettings }).eq("id", e.id);
    setSaving(false);
    if (error) { toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Salvo", description: "O agente aplica em até 10 minutos." });
    onChanged();
    onClose();
  };

  const remove = async () => {
    if (!confirm(`Excluir ${e.name} do painel? Se o agente continuar instalado, a máquina volta a aparecer no próximo envio.`)) return;
    const { error } = await db.from("agent_endpoints").delete().eq("id", e.id);
    if (error) { toast({ title: "Erro ao excluir", description: error.message, variant: "destructive" }); return; }
    onChanged();
    onClose();
  };

  const info: [string, any][] = [
    ["Hostname", e.hostname], ["Domínio", e.domain], ["Usuário", e.logged_user], ["IP", arr(e.ip_addresses).join(", ")],
    ["MAC", arr(e.mac_addresses).join(", ")], ["Sistema", `${e.os_name ?? ""} ${e.os_version ?? ""}`], ["Fabricante", e.manufacturer],
    ["Modelo", e.model], ["Nº de série", e.serial_number], ["BIOS", e.bios_version], ["Processador", e.cpu_model ? `${e.cpu_model} (${e.cpu_cores ?? "?"} núcleos)` : null],
    ["Memória", e.ram_total_gb ? `${e.ram_total_gb} GB` : null], ["Ligado há", fmtUptime(e.uptime_seconds)], ["Acesso remoto", e.remote_access_id],
    ["Agente", e.agent_version], ["Inventário", e.inventory_updated_at ? fmtAgo(e.inventory_updated_at) : "—"],
  ];

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {e.role === "server" ? <Server className="h-5 w-5" /> : <Monitor className="h-5 w-5" />} {e.name}
            <span className="text-sm font-normal text-muted-foreground">— {e.clients?.full_name}</span>
          </DialogTitle>
        </DialogHeader>
        <Tabs defaultValue="info">
          <TabsList>
            <TabsTrigger value="info">Resumo</TabsTrigger>
            <TabsTrigger value="disks">Discos</TabsTrigger>
            <TabsTrigger value="software">Programas ({software.length})</TabsTrigger>
            <TabsTrigger value="settings">Configuração</TabsTrigger>
          </TabsList>

          <TabsContent value="info" className="space-y-4">
            <div className="grid grid-cols-1 gap-x-6 gap-y-1 text-sm md:grid-cols-2">
              {info.filter(([, v]) => v && String(v).trim()).map(([l, v]) => (
                <div key={l} className="flex gap-2"><span className="w-28 shrink-0 text-muted-foreground">{l}</span><span className="break-all">{v}</span></div>
              ))}
            </div>
            <div>
              <h4 className="mb-1 text-sm font-medium">Antivírus</h4>
              {arr(e.antivirus).length === 0 ? <p className="text-xs text-muted-foreground">Não informado.</p> : arr(e.antivirus).map((a: any, i: number) => (
                <div key={i} className="flex items-center gap-2 text-sm">
                  {a.enabled ? <ShieldCheck className="h-4 w-4 text-emerald-400" /> : <ShieldAlert className="h-4 w-4 text-red-400" />}
                  {a.name} <span className="text-xs text-muted-foreground">{a.enabled ? "ativo" : "desativado"} · {a.up_to_date ? "atualizado" : "desatualizado"}</span>
                </div>
              ))}
            </div>
            {arr(e.top_processes).length > 0 && (
              <div>
                <h4 className="mb-1 text-sm font-medium">Processos que mais consomem</h4>
                <div className="grid grid-cols-1 gap-1 text-xs md:grid-cols-2">
                  {arr(e.top_processes).map((p: any, i: number) => (
                    <div key={i} className="flex justify-between rounded bg-muted/40 px-2 py-1">
                      <span className="truncate">{p.name}</span><span className="text-muted-foreground">{p.by === "cpu" ? `CPU ${p.cpu_pct}%` : `${Math.round(p.mem_mb)} MB`}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </TabsContent>

          <TabsContent value="disks" className="space-y-4">
            <Table>
              <TableHeader><TableRow><TableHead>Volume</TableHead><TableHead>Uso</TableHead><TableHead>Livre</TableHead><TableHead>Total</TableHead></TableRow></TableHeader>
              <TableBody>
                {arr(e.disks).map((d: any, i: number) => (
                  <TableRow key={i}>
                    <TableCell className="font-mono text-sm">{d.mount}{d.label ? <span className="ml-2 text-xs text-muted-foreground">{d.label}</span> : null}</TableCell>
                    <TableCell><UsageBar value={d.usage_pct} /></TableCell>
                    <TableCell className="text-sm">{d.free_gb} GB</TableCell>
                    <TableCell className="text-sm">{d.total_gb} GB</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {arr(e.physical_disks).length > 0 && (
              <div>
                <h4 className="mb-1 text-sm font-medium">Discos físicos</h4>
                {arr(e.physical_disks).map((d: any, i: number) => (
                  <div key={i} className="flex items-center gap-2 text-sm">
                    <Badge variant="outline" className={d.predict_failure || d.health === "Unhealthy" ? "text-red-400" : d.health === "Warning" ? "text-amber-400" : "text-emerald-400"}>
                      {d.predict_failure ? "falha prevista" : d.health || "ok"}
                    </Badge>
                    {d.model || d.name} <span className="text-xs text-muted-foreground">{d.media} {d.size_gb ? `${d.size_gb} GB` : ""} {d.serial}</span>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="software" className="space-y-2">
            <Input placeholder="Filtrar…" value={swFilter} onChange={(ev) => setSwFilter(ev.target.value)} className="max-w-xs" />
            <div className="max-h-[50vh] overflow-auto">
              <Table>
                <TableHeader><TableRow><TableHead>Programa</TableHead><TableHead>Versão</TableHead><TableHead>Fabricante</TableHead><TableHead>Instalado em</TableHead></TableRow></TableHeader>
                <TableBody>
                  {software.filter((s: any) => !swFilter || s.name.toLowerCase().includes(swFilter.toLowerCase())).map((s: any, i: number) => (
                    <TableRow key={i}>
                      <TableCell className="text-sm">{s.name}</TableCell>
                      <TableCell className="text-xs">{s.version}</TableCell>
                      <TableCell className="text-xs">{s.publisher}</TableCell>
                      <TableCell className="text-xs">{s.install_date && /^\d{8}$/.test(s.install_date) ? `${s.install_date.slice(6)}/${s.install_date.slice(4, 6)}/${s.install_date.slice(0, 4)}` : s.install_date}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </TabsContent>

          <TabsContent value="settings" className="space-y-3">
            <div className="grid gap-3 md:grid-cols-2">
              <div><Label>Nome no painel</Label><Input value={form.name} onChange={(ev) => setForm({ ...form, name: ev.target.value })} /></div>
              <div>
                <Label>Função</Label>
                <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="server">Servidor</SelectItem><SelectItem value="workstation">Estação de trabalho</SelectItem></SelectContent>
                </Select>
              </div>
            </div>
            <div><Label>Serviços monitorados (separados por vírgula)</Label><Input value={form.services} onChange={(ev) => setForm({ ...form, services: ev.target.value })} placeholder="MSSQLSERVER, Spooler" /></div>
            <div className="grid gap-3 md:grid-cols-2">
              <div><Label>Intervalo de coleta (segundos)</Label><Input type="number" value={form.interval} onChange={(ev) => setForm({ ...form, interval: ev.target.value })} placeholder={e.role === "server" ? "300" : "900"} /></div>
              <div className="flex items-center gap-2 pt-6"><Switch checked={form.desktop} onCheckedChange={(v) => setForm({ ...form, desktop: v })} /><Label>Informações no papel de parede</Label></div>
            </div>
            <DialogFooter className="flex justify-between gap-2 sm:justify-between">
              <Button variant="ghost" className="text-destructive" onClick={remove}><Trash2 className="mr-1 h-4 w-4" /> Excluir do painel</Button>
              <Button onClick={save} disabled={saving}>Salvar</Button>
            </DialogFooter>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
