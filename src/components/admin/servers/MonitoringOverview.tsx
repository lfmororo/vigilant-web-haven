import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { toast } from "@/hooks/use-toast";
import {
  Activity, AlertTriangle, CheckCircle, Clock, HardDrive, HeartPulse, Search, ShieldAlert, Timer, WifiOff,
} from "lucide-react";
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip as RTooltip, XAxis, YAxis } from "recharts";
import {
  SOURCE_META, SOURCE_ORDER, SeverityBadge, StatusDot, UsageBar, fmtAgo, fmtDuration, isStale,
  type SourceType,
} from "./monitorUi";

const db = supabase as any;

interface Props {
  clients: { id: string; full_name: string }[] | undefined;
  onOpenTab?: (tab: string) => void;
}

interface Src {
  type: SourceType; id: string; name: string; client_id: string | null; status: string | null;
  cpu: number | null; ram: number | null; disk: number | null; last_polled_at: string | null; stale: boolean;
}

const SOURCE_QUERIES: Record<SourceType, { cols: string; map: (r: any) => Pick<Src, "cpu" | "ram" | "disk"> }> = {
  windows: { cols: "id,name,client_id,status,cpu_usage,ram_usage_pct,disk_usage_pct,last_polled_at", map: (r) => ({ cpu: r.cpu_usage, ram: r.ram_usage_pct, disk: r.disk_usage_pct }) },
  linux: { cols: "id,name,client_id,status,cpu_usage_pct,ram_usage_pct,disk_usage_pct,last_polled_at", map: (r) => ({ cpu: r.cpu_usage_pct, ram: r.ram_usage_pct, disk: r.disk_usage_pct }) },
  sqlserver: { cols: "id,name,client_id,status,sql_cpu_pct,last_polled_at", map: (r) => ({ cpu: r.sql_cpu_pct, ram: null, disk: null }) },
  vmware: { cols: "id,name,client_id,status,cpu_usage_pct,ram_usage_pct,last_polled_at", map: (r) => ({ cpu: r.cpu_usage_pct, ram: r.ram_usage_pct, disk: null }) },
  proxmox: { cols: "id,name,client_id,status,cpu_usage_pct,ram_usage_pct,disk_usage_pct,last_polled_at", map: (r) => ({ cpu: r.cpu_usage_pct, ram: r.ram_usage_pct, disk: r.disk_usage_pct }) },
  ilo: { cols: "id,name,client_id,status,last_polled_at", map: () => ({ cpu: null, ram: null, disk: null }) },
};

const SEV_RANK: Record<string, number> = { critical: 0, warning: 1, info: 2 };
const num = (v: any) => (v == null || isNaN(Number(v)) ? null : Number(v));

export default function MonitoringOverview({ clients, onOpenTab }: Props) {
  const qc = useQueryClient();
  const [sevFilter, setSevFilter] = useState("crit-warn");
  const [clientFilter, setClientFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [ackAlert, setAckAlert] = useState<any>(null);
  const [ackNote, setAckNote] = useState("");
  const [savingAck, setSavingAck] = useState(false);
  const [chartSource, setChartSource] = useState<string>("");
  const [chartHours, setChartHours] = useState(24);

  const clientName = (id: string | null) => clients?.find((c) => c.id === id)?.full_name ?? "Sem cliente";

  const { data: sources = [] } = useQuery({
    queryKey: ["monitor-overview-sources"],
    queryFn: async (): Promise<Src[]> => {
      const results = await Promise.all(SOURCE_ORDER.map(async (type) => {
        const q = SOURCE_QUERIES[type];
        const { data, error } = await db.from(SOURCE_META[type].table).select(q.cols).eq("is_active", true).order("name");
        if (error) { console.error(type, error); return []; }
        return (data || []).map((r: any) => {
          const m = q.map(r);
          return {
            type, id: r.id, name: r.name, client_id: r.client_id, status: r.status, last_polled_at: r.last_polled_at,
            cpu: num(m.cpu), ram: num(m.ram), disk: num(m.disk), stale: isStale(r.last_polled_at),
          } as Src;
        });
      }));
      return results.flat();
    },
    refetchInterval: 30000,
  });

  const { data: alerts = [] } = useQuery({
    queryKey: ["monitor-alerts-open"],
    queryFn: async () => {
      const { data, error } = await db.from("monitor_alerts").select("*").neq("status", "resolved")
        .order("last_seen_at", { ascending: false }).limit(1000);
      if (error) throw error;
      return data || [];
    },
    refetchInterval: 60000,
  });

  const { data: mttr } = useQuery({
    queryKey: ["monitor-mttr-7d"],
    queryFn: async () => {
      const since = new Date(Date.now() - 7 * 86400_000).toISOString();
      const { data } = await db.from("monitor_alerts").select("first_detected_at,resolved_at")
        .eq("status", "resolved").gt("notify_count", 0).gte("resolved_at", since).limit(1000);
      const list = (data || []).filter((a: any) => a.resolved_at && a.first_detected_at);
      if (!list.length) return null;
      const total = list.reduce((s: number, a: any) => s + (new Date(a.resolved_at).getTime() - new Date(a.first_detected_at).getTime()), 0);
      return { avgMs: total / list.length, count: list.length };
    },
    refetchInterval: 300000,
  });

  const { data: forecast = [] } = useQuery({
    queryKey: ["monitor-disk-forecast"],
    queryFn: async () => {
      const { data, error } = await db.rpc("monitor_disk_forecast", { p_days: 14 });
      if (error) { console.error(error); return []; }
      return (data || []).filter((f: any) => f.days_to_full != null && Number(f.days_to_full) <= 60)
        .sort((a: any, b: any) => Number(a.days_to_full) - Number(b.days_to_full));
    },
    refetchInterval: 600000,
  });

  // Tempo real nos alertas
  useEffect(() => {
    const channel = supabase
      .channel(`monitor-alerts-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "monitor_alerts" }, () => {
        qc.invalidateQueries({ queryKey: ["monitor-alerts-open"] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [qc]);

  useEffect(() => {
    if (!chartSource && sources.length) {
      const first = sources.find((s) => s.cpu != null) ?? sources[0];
      setChartSource(`${first.type}:${first.id}`);
    }
  }, [sources, chartSource]);

  const [chartType, chartId] = chartSource.split(":");
  const { data: series = [], isLoading: loadingSeries } = useQuery({
    queryKey: ["monitor-series", chartSource, chartHours],
    enabled: !!chartId,
    queryFn: async () => {
      const bucket = chartHours <= 24 ? 15 : chartHours <= 168 ? 60 : 240;
      const { data, error } = await db.rpc("monitor_metric_series", {
        p_source_type: chartType, p_source_id: chartId, p_hours: chartHours, p_bucket_minutes: bucket,
      });
      if (error) throw error;
      return (data || []).map((r: any) => ({
        t: new Date(r.bucket).toLocaleString("pt-BR", chartHours <= 24
          ? { hour: "2-digit", minute: "2-digit" } : { day: "2-digit", month: "2-digit", hour: "2-digit" }),
        cpu: num(r.cpu_avg), cpu_max: num(r.cpu_max), ram: num(r.ram_avg), disk: num(r.disk_max),
      }));
    },
    refetchInterval: 120000,
  });

  // ---- KPIs
  const alertsBySource = useMemo(() => {
    const m = new Map<string, any[]>();
    for (const a of alerts) {
      const k = `${a.source_type}:${a.source_id}`;
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(a);
    }
    return m;
  }, [alerts]);

  const critical = alerts.filter((a: any) => a.severity === "critical");
  const warning = alerts.filter((a: any) => a.severity === "warning");
  const healthy = sources.filter((s) => !s.stale && s.status !== "offline"
    && !(alertsBySource.get(`${s.type}:${s.id}`) || []).some((a) => a.severity === "critical"));
  const healthPct = sources.length ? Math.round((healthy.length / sources.length) * 100) : null;
  const online = sources.filter((s) => s.status === "online" && !s.stale).length;
  const staleCount = sources.filter((s) => s.stale).length;

  // ---- Central de alertas
  const filteredAlerts = useMemo(() => {
    const q = search.trim().toLowerCase();
    return alerts
      .filter((a: any) => {
        if (sevFilter === "crit-warn" && a.severity === "info") return false;
        if (sevFilter !== "crit-warn" && sevFilter !== "all" && a.severity !== sevFilter) return false;
        if (clientFilter !== "all" && a.client_id !== clientFilter) return false;
        if (q && !`${a.title} ${a.message ?? ""} ${a.source_name ?? ""}`.toLowerCase().includes(q)) return false;
        return true;
      })
      .sort((a: any, b: any) => {
        const sa = a.status === "active" ? 0 : 1, sb = b.status === "active" ? 0 : 1;
        if (sa !== sb) return sa - sb;
        const r = (SEV_RANK[a.severity] ?? 3) - (SEV_RANK[b.severity] ?? 3);
        if (r) return r;
        return new Date(b.last_seen_at).getTime() - new Date(a.last_seen_at).getTime();
      });
  }, [alerts, sevFilter, clientFilter, search]);

  const submitAck = async () => {
    if (!ackAlert) return;
    setSavingAck(true);
    const { data: u } = await supabase.auth.getUser();
    const { error } = await db.from("monitor_alerts").update({
      status: "acknowledged", acknowledged_by: u.user?.id ?? null,
      acknowledged_at: new Date().toISOString(), ack_note: ackNote.trim() || null,
    }).eq("id", ackAlert.id);
    setSavingAck(false);
    if (error) { toast({ title: "Erro ao reconhecer", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Alerta reconhecido" });
    setAckAlert(null); setAckNote("");
    qc.invalidateQueries({ queryKey: ["monitor-alerts-open"] });
  };

  // ---- Mapa por cliente
  const clientMap = useMemo(() => {
    const ids = new Set<string>(sources.map((s) => s.client_id ?? "none"));
    return Array.from(ids).map((cid) => {
      const list = sources.filter((s) => (s.client_id ?? "none") === cid);
      const cAlerts = alerts.filter((a: any) => (a.client_id ?? "none") === cid && a.severity !== "info");
      const problems = list.filter((s) => s.stale || s.status === "offline").length
        + cAlerts.filter((a: any) => a.severity === "critical").length * 2 + cAlerts.length;
      return { cid, name: cid === "none" ? "Sem cliente" : clientName(cid), list, alerts: cAlerts, problems };
    }).sort((a, b) => b.problems - a.problems || a.name.localeCompare(b.name));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sources, alerts, clients]);

  const top = (key: "cpu" | "ram" | "disk") =>
    sources.filter((s) => s[key] != null && !s.stale).sort((a, b) => (b[key] as number) - (a[key] as number)).slice(0, 5);

  const sourceById = (type: string, id: string) => sources.find((s) => s.type === type && s.id === id);

  const kpis = [
    { label: "Saúde geral", value: healthPct == null ? "—" : `${healthPct}%`, icon: HeartPulse,
      tone: healthPct == null ? "text-muted-foreground" : healthPct >= 95 ? "text-emerald-400" : healthPct >= 80 ? "text-amber-400" : "text-red-400",
      sub: `${healthy.length}/${sources.length} fontes saudáveis` },
    { label: "Fontes online", value: `${online}/${sources.length}`, icon: Activity, tone: "text-primary", sub: "com dados recentes" },
    { label: "Críticos", value: critical.length, icon: ShieldAlert, tone: critical.length ? "text-red-400" : "text-emerald-400",
      sub: `${critical.filter((a: any) => a.status === "acknowledged").length} reconhecido(s)` },
    { label: "Atenção", value: warning.length, icon: AlertTriangle, tone: warning.length ? "text-amber-400" : "text-emerald-400",
      sub: `${alerts.filter((a: any) => a.category === "backup").length} de backup` },
    { label: "Coletores parados", value: staleCount, icon: WifiOff, tone: staleCount ? "text-red-400" : "text-emerald-400",
      sub: "sem dados há +15 min" },
    { label: "MTTR (7 dias)", value: mttr ? fmtDuration(mttr.avgMs) : "—", icon: Timer, tone: "text-primary",
      sub: mttr ? `${mttr.count} alerta(s) resolvido(s)` : "sem alertas resolvidos" },
  ];

  return (
    <TooltipProvider delayDuration={150}>
      <div className="space-y-6">
        {/* KPIs */}
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
          {kpis.map((k) => (
            <Card key={k.label}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between text-sm text-muted-foreground">
                  {k.label}<k.icon className={`h-4 w-4 ${k.tone}`} />
                </div>
                <p className={`mt-1 text-2xl font-bold ${k.tone}`}>{k.value}</p>
                <p className="text-xs text-muted-foreground">{k.sub}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Central de alertas */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <AlertTriangle className="h-4 w-4 text-amber-400" /> Central de alertas ({filteredAlerts.length})
              </CardTitle>
              <div className="flex flex-wrap gap-2">
                <Select value={sevFilter} onValueChange={setSevFilter}>
                  <SelectTrigger className="h-8 w-[170px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="crit-warn">Críticos + atenção</SelectItem>
                    <SelectItem value="critical">Só críticos</SelectItem>
                    <SelectItem value="warning">Só atenção</SelectItem>
                    <SelectItem value="info">Só informativos</SelectItem>
                    <SelectItem value="all">Todos</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={clientFilter} onValueChange={setClientFilter}>
                  <SelectTrigger className="h-8 w-[180px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos os clientes</SelectItem>
                    {clients?.map((c) => <SelectItem key={c.id} value={c.id}>{c.full_name}</SelectItem>)}
                  </SelectContent>
                </Select>
                <div className="relative">
                  <Search className="absolute left-2 top-2 h-4 w-4 text-muted-foreground" />
                  <Input className="h-8 w-[180px] pl-8" placeholder="Buscar..." value={search} onChange={(e) => setSearch(e.target.value)} />
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {filteredAlerts.length === 0 ? (
              <div className="flex items-center gap-2 px-4 py-6 text-sm text-emerald-400">
                <CheckCircle className="h-4 w-4" /> Nenhum alerta em aberto com esses filtros.
              </div>
            ) : (
              <div className="max-h-[420px] divide-y divide-border overflow-y-auto">
                {filteredAlerts.map((a: any) => {
                  const meta = SOURCE_META[a.source_type as SourceType];
                  const Icon = meta?.icon ?? Activity;
                  const acked = a.status === "acknowledged";
                  return (
                    <div key={a.id} className={`flex flex-wrap items-start gap-3 px-4 py-3 ${acked ? "opacity-60" : ""}`}>
                      <SeverityBadge severity={a.severity} className="mt-0.5 shrink-0" />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium">{a.title}</span>
                          {a.notify_count === 0 && a.severity !== "info" && (
                            <Badge variant="outline" className="text-[10px]">confirmando {a.breach_count}×</Badge>
                          )}
                          {acked && <Badge variant="outline" className="text-[10px]">✔️ reconhecido</Badge>}
                        </div>
                        {a.message && <p className="text-xs text-muted-foreground">{a.message}</p>}
                        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                          <button type="button" className="flex items-center gap-1 hover:text-foreground"
                            onClick={() => meta?.tab && onOpenTab?.(meta.tab)}>
                            <Icon className="h-3 w-3" /> {a.source_name ?? meta?.label}
                          </button>
                          <span>{clientName(a.client_id)}</span>
                          <span className="flex items-center gap-1"><Clock className="h-3 w-3" /> desde {fmtAgo(a.first_detected_at).replace("há ", "")}</span>
                          {acked && a.ack_note && <span className="italic">“{a.ack_note}”</span>}
                        </div>
                      </div>
                      {!acked && (
                        <Button size="sm" variant="outline" onClick={() => { setAckAlert(a); setAckNote(""); }}>Reconhecer</Button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Mapa por cliente */}
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base">Mapa por cliente</CardTitle></CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Cliente</TableHead>
                    {SOURCE_ORDER.map((t) => <TableHead key={t}>{SOURCE_META[t].label}</TableHead>)}
                    <TableHead>Alertas</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {clientMap.map((row) => (
                    <TableRow key={row.cid}>
                      <TableCell className="font-medium">{row.name}</TableCell>
                      {SOURCE_ORDER.map((t) => {
                        const list = row.list.filter((s) => s.type === t);
                        return (
                          <TableCell key={t}>
                            {list.length === 0 ? <span className="text-muted-foreground">—</span> : (
                              <div className="flex flex-wrap gap-1.5">
                                {list.map((s) => (
                                  <Tooltip key={s.id}>
                                    <TooltipTrigger asChild>
                                      <button type="button" className="p-0.5" onClick={() => SOURCE_META[t].tab && onOpenTab?.(SOURCE_META[t].tab!)}>
                                        <StatusDot status={s.status} stale={s.stale} />
                                      </button>
                                    </TooltipTrigger>
                                    <TooltipContent>
                                      <p className="font-medium">{s.name}</p>
                                      <p className="text-xs">
                                        CPU {s.cpu != null ? `${s.cpu.toFixed(0)}%` : "—"} · RAM {s.ram != null ? `${s.ram.toFixed(0)}%` : "—"} · Disco {s.disk != null ? `${s.disk.toFixed(0)}%` : "—"}
                                      </p>
                                      <p className="text-xs text-muted-foreground">
                                        {s.stale ? "Sem dados recentes" : s.status} · {fmtAgo(s.last_polled_at)}
                                      </p>
                                    </TooltipContent>
                                  </Tooltip>
                                ))}
                              </div>
                            )}
                          </TableCell>
                        );
                      })}
                      <TableCell>
                        {row.alerts.length === 0 ? <span className="text-emerald-400">0</span> : (
                          <span className={row.alerts.some((a: any) => a.severity === "critical") ? "font-semibold text-red-400" : "text-amber-400"}>
                            {row.alerts.length}
                          </span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                  {clientMap.length === 0 && (
                    <TableRow><TableCell colSpan={SOURCE_ORDER.length + 2} className="py-6 text-center text-muted-foreground">Nenhuma fonte monitorada ativa.</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        {/* Top 5 + previsão */}
        <div className="grid gap-4 lg:grid-cols-4">
          {([["cpu", "Top 5 CPU"], ["ram", "Top 5 RAM"], ["disk", "Top 5 Disco"]] as const).map(([key, title]) => (
            <Card key={key}>
              <CardHeader className="pb-2"><CardTitle className="text-sm">{title}</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {top(key).length === 0 && <p className="text-xs text-muted-foreground">Sem dados.</p>}
                {top(key).map((s) => (
                  <div key={`${s.type}:${s.id}`} className="flex items-center justify-between gap-2">
                    <span className="truncate text-xs" title={s.name}>{s.name}</span>
                    <UsageBar value={s[key]} />
                  </div>
                ))}
              </CardContent>
            </Card>
          ))}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm"><HardDrive className="h-4 w-4" /> Previsão de disco cheio</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {forecast.length === 0 && <p className="text-xs text-muted-foreground">Nenhum disco deve encher nos próximos 60 dias (ou ainda não há histórico suficiente).</p>}
              {forecast.slice(0, 6).map((f: any) => {
                const s = sourceById(f.source_type, f.source_id);
                const d = Number(f.days_to_full);
                const tone = d <= 7 ? "text-red-400" : d <= 30 ? "text-amber-400" : "text-muted-foreground";
                return (
                  <div key={`${f.source_type}:${f.source_id}`} className="flex items-center justify-between gap-2 text-xs">
                    <span className="truncate">{s?.name ?? SOURCE_META[f.source_type as SourceType]?.label}</span>
                    <span className={`shrink-0 font-medium ${tone}`}>
                      {Number(f.current_pct).toFixed(0)}% · ~{Math.ceil(d)} dia(s)
                    </span>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </div>

        {/* Histórico */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <CardTitle className="text-base">Histórico de uso</CardTitle>
              <div className="flex flex-wrap gap-2">
                <Select value={chartSource} onValueChange={setChartSource}>
                  <SelectTrigger className="h-8 w-[240px]"><SelectValue placeholder="Escolha um servidor" /></SelectTrigger>
                  <SelectContent>
                    {sources.map((s) => (
                      <SelectItem key={`${s.type}:${s.id}`} value={`${s.type}:${s.id}`}>
                        {SOURCE_META[s.type].label} — {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <div className="flex rounded-md border">
                  {[[24, "24h"], [168, "7d"], [720, "30d"]].map(([h, l]) => (
                    <Button key={h} size="sm" variant={chartHours === h ? "secondary" : "ghost"} className="h-8 rounded-none"
                      onClick={() => setChartHours(h as number)}>{l}</Button>
                  ))}
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {loadingSeries ? (
              <p className="py-12 text-center text-sm text-muted-foreground">Carregando...</p>
            ) : series.length === 0 ? (
              <p className="py-12 text-center text-sm text-muted-foreground">
                Ainda não há histórico para este servidor. Os gráficos aparecem depois das primeiras coletas.
              </p>
            ) : (
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={series}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="t" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} minTickGap={24} />
                    <YAxis domain={[0, 100]} unit="%" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} width={42} />
                    <RTooltip contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", fontSize: 12 }}
                      formatter={(v: any) => (v == null ? "—" : `${Number(v).toFixed(1)}%`)} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Line type="monotone" dataKey="cpu" name="CPU" stroke="hsl(var(--primary))" dot={false} strokeWidth={2} connectNulls />
                    <Line type="monotone" dataKey="cpu_max" name="CPU pico" stroke="hsl(var(--primary))" strokeDasharray="4 4" dot={false} strokeOpacity={0.6} connectNulls />
                    <Line type="monotone" dataKey="ram" name="RAM" stroke="#a855f7" dot={false} strokeWidth={2} connectNulls />
                    <Line type="monotone" dataKey="disk" name="Disco" stroke="#f59e0b" dot={false} strokeWidth={2} connectNulls />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>

        <Dialog open={!!ackAlert} onOpenChange={(o) => !o && setAckAlert(null)}>
          <DialogContent>
            <DialogHeader><DialogTitle>Reconhecer alerta</DialogTitle></DialogHeader>
            {ackAlert && (
              <div className="space-y-3">
                <div className="rounded-md border p-3 text-sm">
                  <div className="flex items-center gap-2"><SeverityBadge severity={ackAlert.severity} /><span className="font-medium">{ackAlert.title}</span></div>
                  <p className="mt-1 text-xs text-muted-foreground">{ackAlert.source_name} · {clientName(ackAlert.client_id)}</p>
                </div>
                <div>
                  <Label>Observação (opcional)</Label>
                  <Textarea value={ackNote} onChange={(e) => setAckNote(e.target.value)} placeholder="Ex.: técnico a caminho, disco será trocado amanhã" />
                </div>
                <p className="text-xs text-muted-foreground">Alertas reconhecidos param de ser reenviados no WhatsApp, mas continuam no painel até normalizar.</p>
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setAckAlert(null)}>Cancelar</Button>
              <Button onClick={submitAck} disabled={savingAck}>{savingAck ? "Salvando..." : "Reconhecer"}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </TooltipProvider>
  );
}
