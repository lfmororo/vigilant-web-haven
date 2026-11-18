import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "@/hooks/use-toast";
import { Copy, Download, KeyRound, Monitor, Package, Plus, Save, ShieldOff } from "lucide-react";
import { fmtAgo } from "./monitorUi";
import ClientInstallerDialog from "./ClientInstallerDialog";

const db = supabase as any;
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SCOPES = ["agent", "windows", "linux", "sqlserver", "vmware", "proxmox", "ilo"] as const;
const SCOPE_LABEL: Record<string, string> = { agent: "Agente unificado", windows: "Windows", linux: "Linux", sqlserver: "SQL Server", vmware: "VMware", proxmox: "Proxmox", ilo: "iLO/iDRAC" };
const DOWNLOADS = typeof window !== "undefined" ? `${window.location.origin}/downloads` : "/downloads";

const DOWNLOAD_ITEMS = [
  { file: "mororo-agent-setup.exe", label: "Windows Setup.exe" },
  { file: "mororo-agent.msi", label: "Windows MSI (GPO)" },
  { file: "mororo-agent.exe", label: "Windows (executável)" },
  { file: "mororo-agent_amd64.deb", label: ".deb x64" },
  { file: "mororo-agent_arm64.deb", label: ".deb ARM64" },
  { file: "mororo-agent.x86_64.rpm", label: ".rpm x64" },
  { file: "mororo-agent.aarch64.rpm", label: ".rpm ARM64" },
  { file: "mororo-agent-linux-amd64", label: "Linux x64 (binário)" },
  { file: "mororo-agent-linux-arm64", label: "Linux ARM64 (binário)" },
  { file: "mororo-coletores-setup.exe", label: "Coletores avulsos (Proxmox, VMware, iLO, iDRAC, SQL)" },
];

interface Props { clients: { id: string; full_name: string }[] | undefined }

// ---------- token helpers
function base64url(bytes: Uint8Array) {
  let s = "";
  bytes.forEach((b) => (s += String.fromCharCode(b)));
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
export async function sha256Hex(v: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(v));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
export function generateMonitorToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return "mt_" + base64url(bytes);
}

// ---------- config
const DEFAULT_CFG = {
  thresholds: {
    cpu: { warn: 85, crit: 95, sustain: 3 }, ram: { warn: 90, crit: 95, sustain: 3 }, disk: { warn: 85, crit: 92, sustain: 1 },
    swap: { warn: 50, crit: 80, sustain: 3 }, iowait: { warn: 20, crit: 40, sustain: 3 }, datastore: { warn: 85, crit: 92, sustain: 1 },
    sql_ple_min: 300, sql_block_seconds: 60, sql_log_pct: { warn: 80, crit: 90 }, sql_backup_hours: { full: 26, log: 2 }, temperature_margin_c: 5,
  },
  offline_after_failures: 3, stale_minutes: 15, renotify_critical_minutes: 120,
  quiet_hours: { enabled: false, start: "22:00", end: "07:00", allow_critical: true },
  daily_digest: true,
};
type Cfg = typeof DEFAULT_CFG;
const PCT_KEYS = [["cpu", "CPU"], ["ram", "RAM"], ["disk", "Disco"], ["swap", "Swap"], ["iowait", "iowait"], ["datastore", "Datastore"]] as const;

function deepMerge(base: any, over: any): any {
  if (!over || typeof over !== "object") return base;
  const out: any = Array.isArray(base) ? [...base] : { ...base };
  for (const k of Object.keys(over)) {
    out[k] = base && typeof base[k] === "object" && !Array.isArray(base[k]) ? deepMerge(base[k], over[k]) : over[k];
  }
  return out;
}

export default function MonitorAgentsTab({ clients }: Props) {
  const qc = useQueryClient();
  const clientName = (id: string | null) => (id ? clients?.find((c) => c.id === id)?.full_name ?? "?" : "Todos os clientes");

  // ===== tokens
  const [newOpen, setNewOpen] = useState(false);
  const [tName, setTName] = useState("");
  const [tClient, setTClient] = useState("all");
  const [tScopes, setTScopes] = useState<string[]>([]);
  const [created, setCreated] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [instOpen, setInstOpen] = useState(false);

  const { data: tokens = [] } = useQuery({
    queryKey: ["monitor-agent-tokens"],
    queryFn: async () => {
      const { data, error } = await db.from("monitor_agent_tokens")
        .select("id, client_id, name, token_prefix, scopes, revoked_at, last_used_at, last_ip, created_at").order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    refetchInterval: 60000,
  });

  const createToken = async () => {
    if (!tName.trim()) { toast({ title: "Dê um nome ao token", variant: "destructive" }); return; }
    if (tScopes.includes("agent") && tClient === "all") { toast({ title: "Escolha o cliente", description: "O agente unificado precisa de um token vinculado a um cliente.", variant: "destructive" }); return; }
    setBusy(true);
    try {
      const token = generateMonitorToken();
      const { data: u } = await supabase.auth.getUser();
      const { error } = await db.from("monitor_agent_tokens").insert({
        name: tName.trim(), client_id: tClient === "all" ? null : tClient, scopes: tScopes,
        token_prefix: token.slice(0, 10), token_hash: await sha256Hex(token), created_by: u.user?.id ?? null,
      });
      if (error) throw error;
      setCreated(token);
      qc.invalidateQueries({ queryKey: ["monitor-agent-tokens"] });
    } catch (e: any) {
      toast({ title: "Erro ao gerar token", description: e.message, variant: "destructive" });
    } finally { setBusy(false); }
  };

  const closeNew = () => { setNewOpen(false); setCreated(null); setTName(""); setTClient("all"); setTScopes([]); };

  const revoke = async (t: any) => {
    if (!confirm(`Revogar o token "${t.name}"? Os agentes que usam ele param de enviar dados.`)) return;
    const { error } = await db.from("monitor_agent_tokens").update({ revoked_at: new Date().toISOString() }).eq("id", t.id);
    if (error) { toast({ title: "Erro ao revogar", description: error.message, variant: "destructive" }); return; }
    qc.invalidateQueries({ queryKey: ["monitor-agent-tokens"] });
  };

  const copy = (t: string) => { navigator.clipboard.writeText(t); toast({ title: "Copiado" }); };

  const commands = (tok: string) => [
    { label: "Mororo.Tech Agent — Windows (assistente)", cmd: `Baixe ${DOWNLOADS}/mororo-agent.exe, dê dois cliques e cole o token:\n${tok}` },
    { label: "Mororo.Tech Agent — Windows Setup.exe (silencioso)", cmd: `mororo-agent-setup.exe /S /TOKEN=${tok} /ROLE=workstation` },
    { label: "Mororo.Tech Agent — Windows MSI (GPO)", cmd: `msiexec /i mororo-agent.msi /qn TOKEN=${tok} ROLE=workstation` },
    { label: "Mororo.Tech Agent — Debian/Ubuntu", cmd: `sudo MORORO_TOKEN=${tok} MORORO_ROLE=server apt install ./mororo-agent_amd64.deb` },
    { label: "Mororo.Tech Agent — RHEL/Rocky/Alma", cmd: `sudo MORORO_TOKEN=${tok} MORORO_ROLE=server dnf install ./mororo-agent.x86_64.rpm` },
    { label: "Coletores avulsos (Windows, silencioso)", cmd: `mororo-coletores-setup.exe /S /TOKEN=${tok} /COLETORES=proxmox,vmware,ilo,idrac,windows,sqlserver` },
    { label: "Mororo.Tech Agent — Linux", cmd: `curl -fsSL ${DOWNLOADS}/mororo-agent-linux-amd64 -o mororo-agent && chmod +x mororo-agent && sudo ./mororo-agent install --token ${tok} --role server --quiet` },
    { label: "Coletores avulsos em Linux — Proxmox / iLO / iDRAC (Node)", cmd: `node proxmox-collector.js --url "${SUPABASE_URL}" --token ${tok}\nnode ilo-collector.js --url "${SUPABASE_URL}" --token ${tok}\nnode idrac-collector.js --url "${SUPABASE_URL}" --token ${tok}` },
    { label: "Coletores avulsos em Linux — VMware (Node)", cmd: `node vmware-collector.js --url "${SUPABASE_URL}" --token ${tok}` },
  ];

  // ===== grupos dos clientes
  const { data: clientCfg = [] } = useQuery({
    queryKey: ["clients-monitor-notify"],
    queryFn: async () => {
      const { data, error } = await db.from("clients").select("id, full_name, whatsapp_group_id, monitor_notify_group, monitor_min_severity").order("full_name");
      if (error) throw error;
      return data || [];
    },
  });
  const updateClient = async (id: string, patch: Record<string, any>) => {
    const { error } = await db.from("clients").update(patch).eq("id", id);
    if (error) { toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" }); return; }
    qc.invalidateQueries({ queryKey: ["clients-monitor-notify"] });
  };

  // ===== papel de parede (agente unificado)
  const [desk, setDesk] = useState({ company: "Mororo.Tech", phone: "", message: "Suporte de TI", position: "bottom-right", enabled: true });
  const { data: deskRow } = useQuery({
    queryKey: ["agent-desktop-info"],
    queryFn: async () => {
      const { data } = await db.from("system_settings").select("id, value").eq("key", "agent_desktop_info").maybeSingle();
      return data;
    },
  });
  useEffect(() => {
    try { if (deskRow?.value) setDesk((d) => ({ ...d, ...JSON.parse(deskRow.value) })); } catch { /* padrão */ }
  }, [deskRow]);
  const saveDesk = async () => {
    const value = JSON.stringify(desk);
    const { error } = deskRow?.id
      ? await db.from("system_settings").update({ value }).eq("id", deskRow.id)
      : await db.from("system_settings").insert({ key: "agent_desktop_info", value, description: "Informações de suporte no papel de parede (mororo-agent)" });
    if (error) { toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Salvo", description: "Os computadores atualizam o papel de parede em até 20 minutos." });
    qc.invalidateQueries({ queryKey: ["agent-desktop-info"] });
  };

  // ===== monitor_config
  const [cfg, setCfg] = useState<Cfg | null>(null);
  const [savingCfg, setSavingCfg] = useState(false);
  const { data: cfgRow } = useQuery({
    queryKey: ["monitor-config"],
    queryFn: async () => {
      const { data } = await db.from("system_settings").select("id, value").eq("key", "monitor_config").maybeSingle();
      return data;
    },
  });
  useEffect(() => {
    let parsed: any = {};
    try { parsed = cfgRow?.value ? JSON.parse(cfgRow.value) : {}; } catch { parsed = {}; }
    setCfg(deepMerge(DEFAULT_CFG, parsed));
  }, [cfgRow]);

  const setPath = (path: string[], value: any) => {
    setCfg((prev) => {
      if (!prev) return prev;
      const next: any = structuredClone(prev);
      let o = next;
      for (let i = 0; i < path.length - 1; i++) o = o[path[i]];
      o[path[path.length - 1]] = value;
      return next;
    });
  };
  const numIn = (path: string[], value: number, w = "w-20") => (
    <Input type="number" className={`h-8 ${w}`} value={value ?? ""} onChange={(e) => setPath(path, e.target.value === "" ? null : Number(e.target.value))} />
  );

  const saveCfg = async () => {
    if (!cfg) return;
    for (const [k, l] of PCT_KEYS) {
      const t = (cfg.thresholds as any)[k];
      if (!(t.warn > 0 && t.crit <= 100 && t.warn < t.crit && t.sustain >= 1)) {
        toast({ title: `Limite inválido em ${l}`, description: "Atenção deve ser menor que crítico, e coletas ≥ 1.", variant: "destructive" }); return;
      }
    }
    setSavingCfg(true);
    const value = JSON.stringify(cfg);
    const { data: u } = await supabase.auth.getUser();
    const { error } = cfgRow?.id
      ? await db.from("system_settings").update({ value, updated_by: u.user?.id ?? null }).eq("id", cfgRow.id)
      : await db.from("system_settings").insert({ key: "monitor_config", value, description: "Limites e política de alertas do monitoramento" });
    setSavingCfg(false);
    if (error) { toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Configuração salva", description: "As funções de monitoramento aplicam em até 1 minuto." });
    qc.invalidateQueries({ queryKey: ["monitor-config"] });
  };

  return (
    <div className="space-y-6">
      {/* Agente unificado */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base"><Monitor className="h-4 w-4" /> Mororo.Tech Agent (servidores e estações)</CardTitle>
          <p className="text-xs text-muted-foreground">
            Um único instalador para Windows e Linux: métricas, inventário de hardware e software, Proxmox/VMware/iLO/iDRAC/SQL Server,
            ping/porta/sites e informações de suporte no papel de parede. Gere um token com o escopo <b>Agente unificado</b> vinculado ao cliente.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" onClick={() => setInstOpen(true)}><Package className="mr-1 h-4 w-4" /> Gerar instalador do cliente</Button>
            <span className="text-xs text-muted-foreground">executável com o token do cliente embutido — é só executar na máquina</span>
          </div>
          <div className="space-y-2 rounded-md border p-3">
            <p className="text-sm font-medium">Instaladores genéricos (pedem o token)</p>
            <div className="flex flex-wrap gap-2">
              {DOWNLOAD_ITEMS.map((d) => (
                <Button key={d.file} asChild size="sm" variant="outline"><a href={`${DOWNLOADS}/${d.file}`} download><Download className="mr-1 h-4 w-4" /> {d.label}</a></Button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              Setup.exe silencioso: <code>mororo-agent-setup.exe /S /TOKEN=mt_… /ROLE=workstation</code> · MSI (GPO):{" "}
              <code>msiexec /i mororo-agent.msi /qn TOKEN=mt_… ROLE=server</code> · Debian/Ubuntu:{" "}
              <code>sudo MORORO_TOKEN=mt_… MORORO_ROLE=server apt install ./mororo-agent_amd64.deb</code> · RHEL/Rocky:{" "}
              <code>sudo MORORO_TOKEN=mt_… dnf install ./mororo-agent.x86_64.rpm</code> · Coletores avulsos:{" "}
              <code>mororo-coletores-setup.exe /S /TOKEN=mt_… /COLETORES=proxmox,ilo,sqlserver</code>
            </p>
          </div>
          <div className="rounded-md border p-3">
            <p className="mb-2 text-sm font-medium">Papel de parede dos computadores</p>
            <div className="grid gap-3 md:grid-cols-4">
              <div><Label>Empresa</Label><Input value={desk.company} onChange={(e) => setDesk({ ...desk, company: e.target.value })} /></div>
              <div><Label>Telefone / WhatsApp do suporte</Label><Input value={desk.phone} onChange={(e) => setDesk({ ...desk, phone: e.target.value })} placeholder="(88) 9...." /></div>
              <div><Label>Mensagem</Label><Input value={desk.message} onChange={(e) => setDesk({ ...desk, message: e.target.value })} /></div>
              <div><Label>Posição</Label>
                <Select value={desk.position} onValueChange={(v) => setDesk({ ...desk, position: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="bottom-right">Canto inferior direito</SelectItem><SelectItem value="bottom-left">Canto inferior esquerdo</SelectItem>
                    <SelectItem value="top-right">Canto superior direito</SelectItem><SelectItem value="top-left">Canto superior esquerdo</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="mt-3 flex items-center justify-between">
              <label className="flex items-center gap-2 text-sm"><Switch checked={desk.enabled} onCheckedChange={(v) => setDesk({ ...desk, enabled: v })} /> Ativado em todos os computadores</label>
              <Button size="sm" onClick={saveDesk}><Save className="mr-1 h-4 w-4" /> Salvar</Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tokens */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-base"><KeyRound className="h-4 w-4" /> Tokens dos agentes</CardTitle>
            <Button size="sm" onClick={() => setNewOpen(true)}><Plus className="mr-1 h-4 w-4" /> Gerar token</Button>
          </div>
          <p className="text-xs text-muted-foreground">O token é mostrado uma única vez; aqui fica guardado só um resumo (hash) dele.</p>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader><TableRow><TableHead>Nome</TableHead><TableHead>Prefixo</TableHead><TableHead>Cliente</TableHead><TableHead>Escopos</TableHead><TableHead>Último uso</TableHead><TableHead>Status</TableHead><TableHead /></TableRow></TableHeader>
              <TableBody>
                {tokens.map((t: any) => (
                  <TableRow key={t.id} className={t.revoked_at ? "opacity-50" : ""}>
                    <TableCell className="font-medium">{t.name}</TableCell>
                    <TableCell className="font-mono text-xs">{t.token_prefix}…</TableCell>
                    <TableCell>{clientName(t.client_id)}</TableCell>
                    <TableCell>{t.scopes?.length ? <div className="flex flex-wrap gap-1">{t.scopes.map((s: string) => <Badge key={s} variant="outline" className="text-[10px]">{SCOPE_LABEL[s] ?? s}</Badge>)}</div> : <span className="text-xs text-muted-foreground">todos</span>}</TableCell>
                    <TableCell className="text-xs">{t.last_used_at ? `${fmtAgo(t.last_used_at)}${t.last_ip ? ` · ${t.last_ip}` : ""}` : "nunca"}</TableCell>
                    <TableCell>{t.revoked_at ? <Badge variant="outline" className="text-red-400">revogado</Badge> : <Badge variant="outline" className="text-emerald-400">ativo</Badge>}</TableCell>
                    <TableCell>{!t.revoked_at && <Button size="sm" variant="ghost" className="text-destructive" onClick={() => revoke(t)}><ShieldOff className="mr-1 h-4 w-4" /> Revogar</Button>}</TableCell>
                  </TableRow>
                ))}
                {tokens.length === 0 && <TableRow><TableCell colSpan={7} className="py-6 text-center text-muted-foreground">Nenhum token ainda. Sem token, os coletores não conseguem listar os servidores.</TableCell></TableRow>}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Grupos */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Alertas no grupo de WhatsApp do cliente</CardTitle>
          <p className="text-xs text-muted-foreground">Os administradores sempre recebem atenção e crítico. Aqui você escolhe se o grupo do cliente também recebe.</p>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader><TableRow><TableHead>Cliente</TableHead><TableHead>Grupo</TableHead><TableHead>Enviar ao grupo</TableHead><TableHead>Severidade mínima</TableHead></TableRow></TableHeader>
              <TableBody>
                {clientCfg.map((c: any) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium">{c.full_name}</TableCell>
                    <TableCell className="text-xs">{c.whatsapp_group_id ? <span className="font-mono">{c.whatsapp_group_id}</span> : <span className="text-muted-foreground">sem grupo cadastrado</span>}</TableCell>
                    <TableCell><Switch checked={!!c.monitor_notify_group} disabled={!c.whatsapp_group_id} onCheckedChange={(v) => updateClient(c.id, { monitor_notify_group: v })} /></TableCell>
                    <TableCell>
                      <Select value={c.monitor_min_severity ?? "critical"} disabled={!c.monitor_notify_group} onValueChange={(v) => updateClient(c.id, { monitor_min_severity: v })}>
                        <SelectTrigger className="h-8 w-[160px]"><SelectValue /></SelectTrigger>
                        <SelectContent><SelectItem value="critical">Só críticos</SelectItem><SelectItem value="warning">Atenção e críticos</SelectItem></SelectContent>
                      </Select>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Limites */}
      {cfg && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Limites e política de alertas</CardTitle>
              <Button size="sm" onClick={saveCfg} disabled={savingCfg}><Save className="mr-1 h-4 w-4" /> {savingCfg ? "Salvando..." : "Salvar"}</Button>
            </div>
            <p className="text-xs text-muted-foreground">Valores globais. "Coletas" = quantas leituras seguidas acima do limite antes de avisar.</p>
          </CardHeader>
          <CardContent className="space-y-6 text-sm">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader><TableRow><TableHead>Métrica</TableHead><TableHead>Atenção (%)</TableHead><TableHead>Crítico (%)</TableHead><TableHead>Coletas</TableHead></TableRow></TableHeader>
                <TableBody>
                  {PCT_KEYS.map(([k, l]) => {
                    const t = (cfg.thresholds as any)[k];
                    return (
                      <TableRow key={k}>
                        <TableCell className="font-medium">{l}</TableCell>
                        <TableCell>{numIn(["thresholds", k, "warn"], t.warn)}</TableCell>
                        <TableCell>{numIn(["thresholds", k, "crit"], t.crit)}</TableCell>
                        <TableCell>{numIn(["thresholds", k, "sustain"], t.sustain)}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div><Label>PLE mínimo (s)</Label>{numIn(["thresholds", "sql_ple_min"], cfg.thresholds.sql_ple_min, "w-full")}</div>
              <div><Label>Bloqueio SQL (s)</Label>{numIn(["thresholds", "sql_block_seconds"], cfg.thresholds.sql_block_seconds, "w-full")}</div>
              <div><Label>Log SQL atenção / crítico (%)</Label><div className="flex gap-2">{numIn(["thresholds", "sql_log_pct", "warn"], cfg.thresholds.sql_log_pct.warn)}{numIn(["thresholds", "sql_log_pct", "crit"], cfg.thresholds.sql_log_pct.crit)}</div></div>
              <div><Label>Backup FULL / LOG (horas)</Label><div className="flex gap-2">{numIn(["thresholds", "sql_backup_hours", "full"], cfg.thresholds.sql_backup_hours.full)}{numIn(["thresholds", "sql_backup_hours", "log"], cfg.thresholds.sql_backup_hours.log)}</div></div>
              <div><Label>Offline após N falhas</Label>{numIn(["offline_after_failures"], cfg.offline_after_failures, "w-full")}</div>
              <div><Label>Coletor parado após (min)</Label>{numIn(["stale_minutes"], cfg.stale_minutes, "w-full")}</div>
              <div><Label>Relembrar crítico a cada (min)</Label>{numIn(["renotify_critical_minutes"], cfg.renotify_critical_minutes, "w-full")}</div>
              <div><Label>Margem térmica (°C)</Label>{numIn(["thresholds", "temperature_margin_c"], cfg.thresholds.temperature_margin_c, "w-full")}</div>
            </div>

            <div className="flex flex-wrap items-end gap-4 rounded-md border border-border p-3">
              <div className="flex items-center gap-2"><Switch checked={cfg.quiet_hours.enabled} onCheckedChange={(v) => setPath(["quiet_hours", "enabled"], v)} /><Label>Horário silencioso</Label></div>
              <div><Label>Início</Label><Input type="time" className="h-8 w-28" value={cfg.quiet_hours.start} onChange={(e) => setPath(["quiet_hours", "start"], e.target.value)} disabled={!cfg.quiet_hours.enabled} /></div>
              <div><Label>Fim</Label><Input type="time" className="h-8 w-28" value={cfg.quiet_hours.end} onChange={(e) => setPath(["quiet_hours", "end"], e.target.value)} disabled={!cfg.quiet_hours.enabled} /></div>
              <div className="flex items-center gap-2"><Switch checked={cfg.quiet_hours.allow_critical} onCheckedChange={(v) => setPath(["quiet_hours", "allow_critical"], v)} disabled={!cfg.quiet_hours.enabled} /><Label>Críticos tocam mesmo assim</Label></div>
            </div>

            <div className="flex items-center gap-2"><Switch checked={cfg.daily_digest} onCheckedChange={(v) => setPath(["daily_digest"], v)} /><Label>Resumo matinal para os administradores (07:30)</Label></div>
          </CardContent>
        </Card>
      )}

      <ClientInstallerDialog open={instOpen} onOpenChange={setInstOpen} clients={clients} />

      {/* Diálogo novo token */}
      <Dialog open={newOpen} onOpenChange={(o) => !o && closeNew()}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>{created ? "Token gerado" : "Gerar token de agente"}</DialogTitle></DialogHeader>
          {!created ? (
            <div className="space-y-3">
              <div><Label>Nome</Label><Input value={tName} onChange={(e) => setTName(e.target.value)} placeholder="Ex.: Coletor St Assessoria" /></div>
              <div><Label>Cliente</Label>
                <Select value={tClient} onValueChange={setTClient}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="all">Todos os clientes</SelectItem>{clients?.map((c) => <SelectItem key={c.id} value={c.id}>{c.full_name}</SelectItem>)}</SelectContent>
                </Select>
                <p className="mt-1 text-xs text-muted-foreground">Com um cliente, o agente só vê e envia dados desse cliente (e o Linux se cadastra sozinho nele).</p>
              </div>
              <div><Label>Escopos (nenhum marcado = todos)</Label>
                <div className="mt-1 flex flex-wrap gap-3">
                  {SCOPES.map((s) => (
                    <label key={s} className="flex items-center gap-1.5 text-sm">
                      <Checkbox checked={tScopes.includes(s)} onCheckedChange={(v) => setTScopes((p) => (v ? [...p, s] : p.filter((x) => x !== s)))} />
                      {SCOPE_LABEL[s]}
                    </label>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-3 text-sm">
              <p className="rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-amber-400">Copie agora: este token não será mostrado de novo.</p>
              <div className="flex items-center gap-2">
                <code className="flex-1 break-all rounded bg-muted p-2 text-xs">{created}</code>
                <Button size="icon" variant="outline" onClick={() => copy(created)}><Copy className="h-4 w-4" /></Button>
              </div>
              <div className="max-h-80 space-y-2 overflow-y-auto">
                {commands(created).map((c) => (
                  <div key={c.label}>
                    <p className="text-xs font-medium text-muted-foreground">{c.label}</p>
                    <div className="flex items-start gap-2">
                      <pre className="flex-1 overflow-x-auto whitespace-pre-wrap break-all rounded bg-muted p-2 text-[11px]">{c.cmd}</pre>
                      <Button size="icon" variant="ghost" onClick={() => copy(c.cmd)}><Copy className="h-4 w-4" /></Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          <DialogFooter>
            {!created ? (
              <><Button variant="outline" onClick={closeNew}>Cancelar</Button><Button onClick={createToken} disabled={busy}>{busy ? "Gerando..." : "Gerar"}</Button></>
            ) : <Button onClick={closeNew}>Concluir</Button>}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
