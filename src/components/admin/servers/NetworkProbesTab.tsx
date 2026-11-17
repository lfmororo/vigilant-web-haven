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
import { toast } from "@/hooks/use-toast";
import { Edit, Lock, Plus, Radar, Trash2, Wifi } from "lucide-react";
import { StatusDot, fmtAgo } from "./monitorUi";

const db = supabase as any;
const arr = (v: any): any[] => (Array.isArray(v) ? v : []);

interface Props { clients: { id: string; full_name: string }[] | undefined }

const DEVICE_TYPES: Record<string, string> = {
  website: "Site", router: "Roteador", switch: "Switch", access_point: "Access point", firewall: "Firewall", printer: "Impressora",
  camera: "Câmera", dvr: "DVR/NVR", phone: "Telefone IP", nas: "NAS/Storage", windows: "Windows", linux: "Linux", proxmox: "Proxmox",
  vmware: "VMware", ilo: "HP iLO", idrac: "Dell iDRAC", bmc: "BMC", sqlserver: "SQL Server", ups: "Nobreak", other: "Outro",
};
const KIND_LABEL: Record<string, string> = { ping: "Ping", tcp: "Porta TCP", http: "HTTP/SSL" };

const empty = {
  id: "", client_id: "", endpoint_id: "", name: "", kind: "ping", device_type: "other", target: "", port: "",
  expected_status: "", keyword: "", interval_seconds: "60", failures_before_alert: "3", ssl_warn_days: "15", severity: "critical", is_active: true,
};

function sslDays(iso: string | null) {
  if (!iso) return null;
  return Math.floor((new Date(iso).getTime() - Date.now()) / 86_400_000);
}

export default function NetworkProbesTab({ clients }: Props) {
  const qc = useQueryClient();
  const [client, setClient] = useState("all");
  const [form, setForm] = useState<typeof empty | null>(null);

  const { data: probes = [] } = useQuery({
    queryKey: ["network-probes"],
    queryFn: async () => {
      const { data, error } = await db.from("network_probes").select("*, clients(full_name), agent_endpoints(name)").order("name");
      if (error) throw error;
      return data || [];
    },
    refetchInterval: 30000,
  });
  const { data: endpoints = [] } = useQuery({
    queryKey: ["agent-endpoints-min"],
    queryFn: async () => {
      const { data, error } = await db.from("agent_endpoints").select("id, name, client_id, role, last_seen_at").eq("is_active", true).order("name");
      if (error) throw error;
      return data || [];
    },
  });
  const { data: discovered = [] } = useQuery({
    queryKey: ["network-discoveries", client],
    queryFn: async () => {
      let q = db.from("network_discoveries").select("*, clients(full_name)").order("last_seen_at", { ascending: false }).limit(500);
      if (client !== "all") q = q.eq("client_id", client);
      const { data, error } = await q;
      if (error) throw error;
      return data || [];
    },
  });

  const list = useMemo(() => probes.filter((p: any) => client === "all" || p.client_id === client), [probes, client]);
  const monitoredTargets = useMemo(() => new Set(probes.map((p: any) => `${p.client_id}|${p.target}`)), [probes]);

  const save = async () => {
    if (!form) return;
    if (!form.client_id || !form.name.trim() || !form.target.trim()) { toast({ title: "Preencha cliente, nome e alvo", variant: "destructive" }); return; }
    if (!form.endpoint_id) { toast({ title: "Escolha qual agente faz a checagem", description: "Deve ser uma máquina na mesma rede do equipamento.", variant: "destructive" }); return; }
    if (form.kind === "tcp" && !Number(form.port)) { toast({ title: "Informe a porta", variant: "destructive" }); return; }
    const row = {
      client_id: form.client_id, endpoint_id: form.endpoint_id, name: form.name.trim(), kind: form.kind, device_type: form.device_type,
      target: form.target.trim(), port: form.kind === "tcp" ? Number(form.port) : null,
      expected_status: form.expected_status ? Number(form.expected_status) : null, keyword: form.keyword.trim() || null,
      interval_seconds: Math.max(30, Number(form.interval_seconds) || 60), failures_before_alert: Math.max(1, Number(form.failures_before_alert) || 3),
      ssl_warn_days: Math.max(1, Number(form.ssl_warn_days) || 15), severity: form.severity, is_active: form.is_active,
    };
    const { error } = form.id ? await db.from("network_probes").update(row).eq("id", form.id) : await db.from("network_probes").insert(row);
    if (error) { toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Checagem salva", description: "O agente começa a checar em até 10 minutos." });
    setForm(null);
    qc.invalidateQueries({ queryKey: ["network-probes"] });
  };

  const remove = async (p: any) => {
    if (!confirm(`Excluir a checagem ${p.name}?`)) return;
    const { error } = await db.from("network_probes").delete().eq("id", p.id);
    if (error) { toast({ title: "Erro ao excluir", description: error.message, variant: "destructive" }); return; }
    qc.invalidateQueries({ queryKey: ["network-probes"] });
  };

  const fromDiscovery = (d: any) => setForm({
    ...empty, client_id: d.client_id, endpoint_id: d.endpoint_id || "", name: d.hostname || `${DEVICE_TYPES[d.device_type] ?? "Equipamento"} ${d.ip}`,
    device_type: DEVICE_TYPES[d.device_type] ? d.device_type : "other", target: d.ip,
  });

  const endpointsOf = (cid: string) => endpoints.filter((e: any) => e.client_id === cid);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">Ping, porta e sites (com validade do SSL) checados pelo <b>Mororo.Tech Agent</b> instalado na rede do cliente.</p>
        <div className="flex gap-2">
          <Select value={client} onValueChange={setClient}>
            <SelectTrigger className="h-9 w-[220px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os clientes</SelectItem>
              {clients?.map((c) => <SelectItem key={c.id} value={c.id}>{c.full_name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button size="sm" onClick={() => setForm({ ...empty, client_id: client === "all" ? "" : client })}><Plus className="mr-1 h-4 w-4" /> Nova checagem</Button>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow><TableHead /><TableHead>Nome</TableHead><TableHead>Alvo</TableHead><TableHead>Cliente / agente</TableHead><TableHead>Resposta</TableHead><TableHead>SSL</TableHead><TableHead>Última checagem</TableHead><TableHead /></TableRow>
              </TableHeader>
              <TableBody>
                {list.map((p: any) => {
                  const stale = !p.last_polled_at || Date.now() - new Date(p.last_polled_at).getTime() > Math.max(p.interval_seconds * 3, 900) * 1000;
                  const days = sslDays(p.ssl_expires_at);
                  return (
                    <TableRow key={p.id} className={p.is_active ? "" : "opacity-50"}>
                      <TableCell><StatusDot status={p.status} stale={stale} /></TableCell>
                      <TableCell>
                        <div className="font-medium">{p.name}</div>
                        <div className="flex gap-1"><Badge variant="outline" className="text-[10px]">{KIND_LABEL[p.kind]}</Badge><Badge variant="outline" className="text-[10px]">{DEVICE_TYPES[p.device_type] ?? p.device_type}</Badge></div>
                      </TableCell>
                      <TableCell className="font-mono text-xs">{p.target}{p.port ? `:${p.port}` : ""}</TableCell>
                      <TableCell className="text-xs">{p.clients?.full_name}<div className="text-muted-foreground">{p.agent_endpoints?.name ?? "sem agente"}</div></TableCell>
                      <TableCell className="text-xs">
                        {p.status === "offline" ? <span className="text-red-400">{p.last_error || "fora do ar"}</span>
                          : p.latency_ms != null ? `${Math.round(p.latency_ms)} ms${p.packet_loss_pct ? ` · ${p.packet_loss_pct}% perda` : ""}${p.http_status ? ` · HTTP ${p.http_status}` : ""}` : "—"}
                        {p.status !== "offline" && p.last_error && <div className="text-amber-400">{p.last_error}</div>}
                      </TableCell>
                      <TableCell className="text-xs">
                        {days == null ? "—" : <span className={`flex items-center gap-1 ${days <= 3 ? "text-red-400" : days <= p.ssl_warn_days ? "text-amber-400" : "text-emerald-400"}`}><Lock className="h-3 w-3" /> {days < 0 ? "vencido" : `${days} dias`}</span>}
                      </TableCell>
                      <TableCell className="text-xs">{fmtAgo(p.last_polled_at)}</TableCell>
                      <TableCell className="whitespace-nowrap">
                        <Button size="icon" variant="ghost" onClick={() => setForm({ ...empty, ...p, port: p.port ? String(p.port) : "", expected_status: p.expected_status ? String(p.expected_status) : "", keyword: p.keyword || "", endpoint_id: p.endpoint_id || "", interval_seconds: String(p.interval_seconds), failures_before_alert: String(p.failures_before_alert), ssl_warn_days: String(p.ssl_warn_days) })}><Edit className="h-4 w-4" /></Button>
                        <Button size="icon" variant="ghost" className="text-destructive" onClick={() => remove(p)}><Trash2 className="h-4 w-4" /></Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
                {list.length === 0 && <TableRow><TableCell colSpan={8} className="py-8 text-center text-muted-foreground"><Wifi className="mx-auto mb-2 h-5 w-5" />Nenhuma checagem. Cadastre aqui ou marque os equipamentos no assistente do agente.</TableCell></TableRow>}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base"><Radar className="h-4 w-4" /> Equipamentos encontrados na varredura</CardTitle>
          <p className="text-xs text-muted-foreground">Resultado da varredura feita pelo assistente de instalação. Clique em "Monitorar" para criar uma checagem de ping.</p>
        </CardHeader>
        <CardContent className="p-0">
          <div className="max-h-[420px] overflow-auto">
            <Table>
              <TableHeader><TableRow><TableHead>IP</TableHead><TableHead>Nome / fabricante</TableHead><TableHead>Tipo provável</TableHead><TableHead>Portas</TableHead><TableHead>Cliente</TableHead><TableHead>Visto</TableHead><TableHead /></TableRow></TableHeader>
              <TableBody>
                {discovered.map((d: any) => (
                  <TableRow key={d.id}>
                    <TableCell className="font-mono text-xs">{d.ip}<div className="text-muted-foreground">{d.mac}</div></TableCell>
                    <TableCell className="text-xs">{d.hostname || "—"}<div className="text-muted-foreground">{d.vendor}</div></TableCell>
                    <TableCell className="text-xs">{DEVICE_TYPES[d.device_type] ?? d.device_type}</TableCell>
                    <TableCell className="text-xs">{arr(d.open_ports).join(", ")}</TableCell>
                    <TableCell className="text-xs">{d.clients?.full_name}</TableCell>
                    <TableCell className="text-xs">{fmtAgo(d.last_seen_at)}</TableCell>
                    <TableCell>
                      {monitoredTargets.has(`${d.client_id}|${d.ip}`) ? <Badge variant="outline" className="text-emerald-400">monitorado</Badge>
                        : <Button size="sm" variant="outline" onClick={() => fromDiscovery(d)}>Monitorar</Button>}
                    </TableCell>
                  </TableRow>
                ))}
                {discovered.length === 0 && <TableRow><TableCell colSpan={7} className="py-6 text-center text-muted-foreground">Nenhuma varredura salva ainda.</TableCell></TableRow>}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={!!form} onOpenChange={(o) => !o && setForm(null)}>
        <DialogContent className="max-w-xl">
          <DialogHeader><DialogTitle>{form?.id ? "Editar checagem" : "Nova checagem"}</DialogTitle></DialogHeader>
          {form && (
            <div className="space-y-3">
              <div className="grid gap-3 md:grid-cols-2">
                <div>
                  <Label>Cliente</Label>
                  <Select value={form.client_id} onValueChange={(v) => setForm({ ...form, client_id: v, endpoint_id: "" })}>
                    <SelectTrigger><SelectValue placeholder="Escolha" /></SelectTrigger>
                    <SelectContent>{clients?.map((c) => <SelectItem key={c.id} value={c.id}>{c.full_name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Agente que faz a checagem</Label>
                  <Select value={form.endpoint_id} onValueChange={(v) => setForm({ ...form, endpoint_id: v })} disabled={!form.client_id}>
                    <SelectTrigger><SelectValue placeholder={form.client_id && endpointsOf(form.client_id).length === 0 ? "Nenhum agente neste cliente" : "Escolha"} /></SelectTrigger>
                    <SelectContent>{endpointsOf(form.client_id).map((e: any) => <SelectItem key={e.id} value={e.id}>{e.name} {e.role === "server" ? "(servidor)" : ""}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid gap-3 md:grid-cols-3">
                <div className="md:col-span-2"><Label>Nome</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Impressora recepção" /></div>
                <div>
                  <Label>Tipo de equipamento</Label>
                  <Select value={form.device_type} onValueChange={(v) => setForm({ ...form, device_type: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{Object.entries(DEVICE_TYPES).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid gap-3 md:grid-cols-3">
                <div>
                  <Label>Checagem</Label>
                  <Select value={form.kind} onValueChange={(v) => setForm({ ...form, kind: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="ping">Ping</SelectItem><SelectItem value="tcp">Porta TCP</SelectItem><SelectItem value="http">Site / HTTP + SSL</SelectItem></SelectContent>
                  </Select>
                </div>
                <div className={form.kind === "tcp" ? "" : "md:col-span-2"}>
                  <Label>{form.kind === "http" ? "URL" : "IP ou nome"}</Label>
                  <Input value={form.target} onChange={(e) => setForm({ ...form, target: e.target.value })} placeholder={form.kind === "http" ? "https://ecmororo.com.br" : "192.168.0.10"} />
                </div>
                {form.kind === "tcp" && <div><Label>Porta</Label><Input type="number" value={form.port} onChange={(e) => setForm({ ...form, port: e.target.value })} placeholder="3389" /></div>}
              </div>
              {form.kind === "http" && (
                <div className="grid gap-3 md:grid-cols-3">
                  <div><Label>Status esperado</Label><Input type="number" value={form.expected_status} onChange={(e) => setForm({ ...form, expected_status: e.target.value })} placeholder="qualquer < 400" /></div>
                  <div className="md:col-span-2"><Label>Texto que deve aparecer (opcional)</Label><Input value={form.keyword} onChange={(e) => setForm({ ...form, keyword: e.target.value })} /></div>
                </div>
              )}
              <div className="grid gap-3 md:grid-cols-4">
                <div><Label>Intervalo (s)</Label><Input type="number" value={form.interval_seconds} onChange={(e) => setForm({ ...form, interval_seconds: e.target.value })} /></div>
                <div><Label>Falhas p/ alertar</Label><Input type="number" value={form.failures_before_alert} onChange={(e) => setForm({ ...form, failures_before_alert: e.target.value })} /></div>
                <div><Label>Aviso SSL (dias)</Label><Input type="number" value={form.ssl_warn_days} onChange={(e) => setForm({ ...form, ssl_warn_days: e.target.value })} /></div>
                <div>
                  <Label>Gravidade</Label>
                  <Select value={form.severity} onValueChange={(v) => setForm({ ...form, severity: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="critical">Crítico</SelectItem><SelectItem value="warning">Atenção</SelectItem></SelectContent>
                  </Select>
                </div>
              </div>
              <div className="flex items-center gap-2"><Switch checked={form.is_active} onCheckedChange={(v) => setForm({ ...form, is_active: v })} /><Label>Ativa</Label></div>
            </div>
          )}
          <DialogFooter><Button variant="outline" onClick={() => setForm(null)}>Cancelar</Button><Button onClick={save}>Salvar</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
