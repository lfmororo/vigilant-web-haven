import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";
import {
  type AlertCondition,
  type AlertSource,
  type MonitorConfig,
  type Severity,
  authenticateAgent,
  effectiveThresholds,
  failureState,
  loadMonitorConfig,
  notifyEvent,
  pctCondition,
  reconcileAlerts,
  recordSample,
} from "../_shared/monitorAlerts.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-monitor-token",
};
const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json" };
const jsonResp = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: jsonHeaders });

// ---------------------------------------------------------------- utilidades

/** Converte para número finito ou null. */
const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const r1 = (v: number) => Math.round(v * 10) / 10;
const maxOf = (vals: (number | null)[]) => {
  const ok = vals.filter((v): v is number => v !== null);
  return ok.length ? Math.max(...ok) : null;
};
const hoursSince = (iso: unknown): number | null => {
  if (!iso) return null;
  const t = new Date(String(iso)).getTime();
  return Number.isFinite(t) ? (Date.now() - t) / 3_600_000 : null;
};
const push = (list: AlertCondition[], c: AlertCondition | null) => { if (c) list.push(c); };
const cond = (
  key: string, category: string, severity: Severity, title: string,
  message?: string, extra: Partial<AlertCondition> = {},
): AlertCondition => ({ key, category, severity, title, message, ...extra });

/** Chaves de alertas abertos da fonte (para manter alertas de "continua desligado"). */
async function openAlertKeys(supabase: SupabaseClient, sourceType: string, sourceId: string): Promise<Set<string>> {
  const { data } = await supabase.from("monitor_alerts").select("alert_key")
    .eq("source_type", sourceType).eq("source_id", sourceId).in("status", ["active", "acknowledged"]);
  return new Set((data || []).map((r: { alert_key: string }) => r.alert_key));
}

/**
 * Fluxo comum de falha de coleta.
 * - Não confirmado: reconcilia com lista vazia e partial (nada é resolvido).
 * - Confirmado: alerta "offline" crítico, também partial (disco/CPU não são "normalizados").
 */
async function handleCollectFailure(
  supabase: SupabaseClient,
  src: AlertSource,
  fs: ReturnType<typeof failureState>,
  error: unknown,
) {
  const conditions = fs.confirmedOffline
    ? [cond("offline", "availability", "critical", "Sem resposta",
      `Falhou ${fs.consecutive_failures} coletas seguidas${error ? `: ${String(error).substring(0, 200)}` : ""}`)]
    : [];
  return reconcileAlerts(supabase, src, conditions, { partial: true });
}

/** Normaliza lista de serviços (array [{name,status}] ou objeto {nome: status}). */
function serviceList(raw: unknown): { name: string; status: string }[] {
  if (Array.isArray(raw)) {
    return raw.map((s: any) => ({ name: String(s?.name ?? s?.Name ?? ""), status: String(s?.status ?? s?.Status ?? "") }))
      .filter((s) => s.name);
  }
  if (raw && typeof raw === "object") {
    return Object.entries(raw as Record<string, unknown>).map(([name, v]) => ({
      name,
      status: String(typeof v === "object" && v ? (v as any).status ?? (v as any).Status ?? "" : v ?? ""),
    }));
  }
  return [];
}

// ---------------------------------------------------------------- sensores iLO

interface SensorPayload {
  sensor_type?: string;
  name?: string;
  reading?: number | null;
  unit?: string | null;
  status?: string | null;
  health?: string | null;
  upper_critical?: number | null;
  location?: string | null;
}

const SAUDE_OK = new Set(["ok", "enabled", "absent", "n/a", ""]);

/** Classifica um sensor. Devolve null quando está saudável. */
function classificarSensor(s: SensorPayload, tempMargin: number): { severity: "warning" | "critical"; motivo: string } | null {
  const health = String(s.health || "").trim().toLowerCase();
  const status = String(s.status || "").trim().toLowerCase();
  const reading = typeof s.reading === "number" ? s.reading : null;
  const upper = typeof s.upper_critical === "number" && s.upper_critical > 0 ? s.upper_critical : null;

  if (health === "critical") return { severity: "critical", motivo: "saúde crítica" };
  if (reading !== null && upper !== null && reading >= upper) {
    return { severity: "critical", motivo: `leitura acima do limite (${upper}${s.unit || ""})` };
  }
  if (
    String(s.sensor_type) === "temperature" && reading !== null && upper !== null &&
    reading >= upper - tempMargin
  ) {
    return { severity: "warning", motivo: `a menos de ${tempMargin}°C do limite crítico (${upper}°C)` };
  }
  if (health === "warning") return { severity: "warning", motivo: "saúde em atenção" };
  if (health && !SAUDE_OK.has(health)) return { severity: "warning", motivo: `saúde "${s.health}"` };
  if (status && !SAUDE_OK.has(status)) return { severity: "warning", motivo: `estado "${s.status}"` };
  return null;
}

const TIPO_LABEL: Record<string, string> = {
  temperature: "Temperatura", fan: "Ventilador", power: "Fonte", voltage: "Tensão",
  storage: "Armazenamento", memory: "Memória", processor: "Processador", network: "Rede", other: "Sensor",
};

/**
 * Mantém a tabela server_sensor_alerts (usada pelo painel) — sem notificar.
 * As notificações agora saem por monitor_alerts.
 */
async function syncSensorAlertTable(
  supabase: SupabaseClient,
  serverId: string,
  sensors: SensorPayload[],
  tempMargin: number,
): Promise<void> {
  const atuais = new Map<string, { s: SensorPayload; c: { severity: "warning" | "critical"; motivo: string } }>();
  for (const s of sensors) {
    const c = classificarSensor(s, tempMargin);
    if (!c) continue;
    atuais.set(`${String(s.sensor_type || "other")}:${String(s.name || "—")}`.substring(0, 200), { s, c });
  }

  const { data: existentes, error } = await supabase
    .from("server_sensor_alerts").select("id, sensor_key, status").eq("server_id", serverId);
  if (error) { console.error("server_sensor_alerts select:", error.message); return; }
  const porChave = new Map<string, any>((existentes || []).map((r: any) => [r.sensor_key, r]));
  const agora = new Date().toISOString();

  for (const [key, { s, c }] of atuais) {
    const anterior = porChave.get(key);
    const novo = !anterior || anterior.status === "resolved";
    const leitura = typeof s.reading === "number" ? `${s.reading}${s.unit ? ` ${s.unit}` : ""}` : "—";
    const { error: upErr } = await supabase.from("server_sensor_alerts").upsert({
      server_id: serverId,
      sensor_key: key,
      sensor_name: String(s.name || "—").substring(0, 200),
      sensor_type: String(s.sensor_type || "other"),
      severity: c.severity,
      status: "active",
      reading: typeof s.reading === "number" ? s.reading : null,
      unit: s.unit ?? null,
      message: `${c.motivo} (leitura: ${leitura})`.substring(0, 500),
      last_seen_at: agora,
      resolved_at: null,
      ...(novo ? { first_detected_at: agora } : {}),
    }, { onConflict: "server_id,sensor_key" });
    if (upErr) console.error("server_sensor_alerts upsert:", upErr.message);
  }

  for (const anterior of existentes || []) {
    if (atuais.has(anterior.sensor_key) || anterior.status === "resolved") continue;
    await supabase.from("server_sensor_alerts")
      .update({ status: "resolved", resolved_at: agora }).eq("id", anterior.id);
  }
}

// ---------------------------------------------------------------- handlers

type Ctx = { supabase: SupabaseClient; cfg: MonitorConfig; body: any; tokenClientId: string | null };

const forbidden = () => jsonResp({ error: "Fonte pertence a outro cliente" }, 403);
const ownedByOther = (ctx: Ctx, clientId: string | null) => !!ctx.tokenClientId && clientId !== ctx.tokenClientId;

// ---- Windows
async function handleWindows(ctx: Ctx) {
  const { supabase, cfg, body } = ctx;
  const { server_id } = body;
  if (!server_id) return jsonResp({ error: "server_id required" }, 400);

  const { data: prev } = await supabase.from("windows_servers")
    .select("id, name, client_id, status, consecutive_failures, thresholds").eq("id", server_id).maybeSingle();
  if (!prev) return jsonResp({ error: "Server not found" }, 404);
  if (ownedByOther(ctx, prev.client_id)) return forbidden();

  const src: AlertSource = { type: "windows", id: prev.id, name: prev.name, clientId: prev.client_id };
  const fs = failureState(cfg, body.status, prev);
  const now = new Date().toISOString();
  const update: Record<string, any> = {
    status: fs.status, consecutive_failures: fs.consecutive_failures,
    last_polled_at: now, last_error: body.last_error || null,
  };

  if (body.status === "offline") {
    await supabase.from("windows_servers").update(update).eq("id", server_id);
    const lines = await handleCollectFailure(supabase, src, fs, body.last_error);
    return jsonResp({ success: true, status: fs.status, alerts: lines.length });
  }

  const disks: any[] = Array.isArray(body.disks) ? body.disks.slice(0, 50) : [];
  const diskPct = (d: any) => num(d.usage_pct ?? d.pct);
  const diskName = (d: any) => String(d.letter ?? d.drive ?? d.name ?? d.mount ?? "?").replace(/\\$/, "");
  const maxDisk = maxOf(disks.map(diskPct));

  const fields = [
    "cpu_usage", "ram_total_gb", "ram_used_gb", "ram_usage_pct", "disk_total_gb", "disk_used_gb",
    "disk_free_gb", "disk_usage_pct", "uptime_seconds", "last_boot_time", "os_version", "services_status",
    "top_processes", "event_errors", "pending_reboot", "pending_updates", "cpu_model", "cpu_cores", "agent_version",
  ];
  for (const f of fields) if (body[f] !== undefined) update[f] = body[f];
  if (disks.length) { update.disks = disks; update.disk_usage_pct = maxDisk; }

  const hasMetrics = body.cpu_usage !== undefined || body.ram_usage_pct !== undefined || disks.length > 0;
  const th = effectiveThresholds(cfg, prev.thresholds);
  const conditions: AlertCondition[] = [];

  if (body.status === "warning" && !hasMetrics) {
    push(conditions, cond("collect", "collect", "warning", "Coleta incompleta",
      `O agente respondeu sem métricas${body.last_error ? `: ${String(body.last_error).substring(0, 200)}` : ""}`, { sustain: 3 }));
    await supabase.from("windows_servers").update(update).eq("id", server_id);
    // Sem métricas não dá para afirmar que disco/CPU normalizaram.
    const lines = await reconcileAlerts(supabase, src, conditions, { partial: true });
    return jsonResp({ success: true, status: fs.status, alerts: lines.length });
  }

  push(conditions, pctCondition("cpu", "cpu", "CPU", num(body.cpu_usage), th.cpu));
  push(conditions, pctCondition("ram", "ram", "Memória RAM", num(body.ram_usage_pct), th.ram));
  for (const d of disks) {
    const name = diskName(d);
    push(conditions, pctCondition(`disk:${name}`, "disk", `Disco ${name}`, diskPct(d), th.disk,
      num(d.free_gb) !== null ? { message: `Livre: ${r1(Number(d.free_gb))} GB` } : undefined));
    if (d.predict_failure === true) {
      push(conditions, cond(`smart:${name}`, "smart", "critical", `Disco ${name} com previsão de falha (SMART)`,
        "O próprio disco informa que pode falhar em breve. Faça backup e planeje a troca."));
    }
  }
  for (const s of serviceList(body.services_status)) {
    if (s.status.toLowerCase() !== "running") {
      push(conditions, cond(`service:${s.name}`, "service", "critical", `Serviço ${s.name} parado`, `Estado: ${s.status || "desconhecido"}`));
    }
  }
  if (body.pending_reboot === true) {
    push(conditions, cond("pending_reboot", "maintenance", "info", "Reinicialização pendente", "Atualizações aguardam reinício."));
  }
  const events: any[] = Array.isArray(body.event_errors) ? body.event_errors : [];
  const critEvents = events.filter((e) => String(e?.level ?? e?.Level ?? "").toLowerCase() === "critical");
  if (critEvents.length) {
    const first = critEvents[0];
    push(conditions, cond("events:critical", "events", "warning", `${critEvents.length} evento(s) crítico(s) no Windows`,
      String(first?.message ?? first?.Message ?? first?.source ?? "").substring(0, 200) || undefined));
  }

  update.last_success_at = now;
  const { error } = await supabase.from("windows_servers").update(update).eq("id", server_id);
  if (error) throw error;

  await recordSample(supabase, src, { cpu: num(body.cpu_usage), ram: num(body.ram_usage_pct), disk: maxDisk ?? num(body.disk_usage_pct) });
  const lines = await reconcileAlerts(supabase, src, conditions);
  return jsonResp({ success: true, status: fs.status, alerts: lines.length });
}

// ---- Linux
async function handleLinux(ctx: Ctx) {
  const { supabase, cfg, body } = ctx;
  const info = body.info || {};
  let serverId: string | null = body.server_id || null;

  if (!serverId) {
    const hostname = String(info.hostname || "").trim();
    if (!ctx.tokenClientId || !hostname) {
      return jsonResp({ error: "server_id required (ou token com cliente + info.hostname para autocadastro)" }, 400);
    }
    const { data: found } = await supabase.from("linux_servers").select("id")
      .eq("client_id", ctx.tokenClientId).ilike("hostname", hostname).maybeSingle();
    if (found) serverId = found.id;
    else {
      const { data: created, error } = await supabase.from("linux_servers").insert({
        client_id: ctx.tokenClientId, name: hostname, host: String(body.host || info.ip || hostname), hostname,
      }).select("id").single();
      if (error) throw error;
      serverId = created.id;
    }
  }

  const { data: prev } = await supabase.from("linux_servers")
    .select("id, name, client_id, status, consecutive_failures, thresholds").eq("id", serverId).maybeSingle();
  if (!prev) return jsonResp({ error: "Server not found" }, 404);
  if (ownedByOther(ctx, prev.client_id)) return forbidden();

  const src: AlertSource = { type: "linux", id: prev.id, name: prev.name, clientId: prev.client_id };
  const fs = failureState(cfg, body.status, prev);
  const now = new Date().toISOString();
  const update: Record<string, any> = {
    status: fs.status, consecutive_failures: fs.consecutive_failures, last_polled_at: now, last_error: body.last_error || null,
  };

  if (body.status === "offline") {
    await supabase.from("linux_servers").update(update).eq("id", prev.id);
    const lines = await handleCollectFailure(supabase, src, fs, body.last_error);
    return jsonResp({ success: true, server_id: prev.id, status: fs.status, alerts: lines.length });
  }

  const infoFields = [
    "hostname", "distro", "kernel", "cpu_model", "cpu_cores", "cpu_usage_pct", "iowait_pct", "load_1", "load_5", "load_15",
    "ram_total_gb", "ram_used_gb", "ram_usage_pct", "swap_total_gb", "swap_used_gb", "pending_updates",
    "security_updates", "reboot_required", "uptime_seconds", "agent_version",
  ];
  for (const f of infoFields) if (info[f] !== undefined) update[f] = info[f];

  const disks: any[] = Array.isArray(body.disks) ? body.disks.slice(0, 100) : [];
  const services: any[] = Array.isArray(body.services) ? body.services.slice(0, 200) : [];
  const failedUnits: any[] = Array.isArray(body.failed_units) ? body.failed_units.slice(0, 100) : [];
  const raid: any[] = Array.isArray(body.raid) ? body.raid : [];
  const zfs: any[] = Array.isArray(body.zfs) ? body.zfs : [];
  const smart: any[] = Array.isArray(body.smart) ? body.smart : [];
  const maxDisk = maxOf(disks.map((d) => num(d.pct)));

  update.disks = disks;
  update.disk_usage_pct = maxDisk;
  update.services_status = services;
  update.failed_units = failedUnits;
  update.raid_status = raid;
  update.zfs_pools = zfs;
  if (body.top_processes !== undefined) update.top_processes = body.top_processes;

  const th = effectiveThresholds(cfg, prev.thresholds);
  const conditions: AlertCondition[] = [];
  const ramPct = num(info.ram_usage_pct) ?? (num(info.ram_total_gb) && num(info.ram_used_gb) !== null
    ? (Number(info.ram_used_gb) / Number(info.ram_total_gb)) * 100 : null);
  const swapPct = num(info.swap_total_gb) && num(info.swap_used_gb) !== null
    ? (Number(info.swap_used_gb) / Number(info.swap_total_gb)) * 100 : null;

  push(conditions, pctCondition("cpu", "cpu", "CPU", num(info.cpu_usage_pct), th.cpu));
  push(conditions, pctCondition("iowait", "cpu", "Espera de disco (iowait)", num(info.iowait_pct), th.iowait,
    { message: "A CPU está esperando o disco — armazenamento lento ou sobrecarregado." }));
  push(conditions, pctCondition("ram", "ram", "Memória RAM", ramPct, th.ram));
  push(conditions, pctCondition("swap", "ram", "Swap", swapPct, th.swap,
    { message: "Uso de swap alto indica falta de memória RAM." }));

  const cores = num(info.cpu_cores);
  const load5 = num(info.load_5);
  if (cores && cores > 0 && load5 !== null) {
    const ratio = load5 / cores;
    if (ratio >= 2) {
      push(conditions, cond("load", "cpu", ratio >= 4 ? "critical" : "warning", `Carga ${r1(load5)} (${r1(ratio)}× os núcleos)`,
        `Load average de 5 min acima de ${ratio >= 4 ? 4 : 2}× os ${cores} núcleos — processos aguardando CPU/disco.`,
        { value: r1(ratio), threshold: ratio >= 4 ? 4 : 2, sustain: 3 }));
    }
  }
  for (const d of disks) {
    const mount = String(d.mount || "?");
    push(conditions, pctCondition(`disk:${mount}`, "disk", `Disco ${mount}`, num(d.pct), th.disk,
      num(d.total_gb) !== null && num(d.used_gb) !== null ? { message: `${r1(Number(d.used_gb))} de ${r1(Number(d.total_gb))} GB` } : undefined));
    push(conditions, pctCondition(`inode:${mount}`, "disk", `Inodes de ${mount}`, num(d.inode_pct), { warn: 90, crit: 97, sustain: 1 },
      { message: "Muitos arquivos pequenos: mesmo com espaço livre, não será possível criar arquivos." }));
  }
  for (const s of services) {
    const st = String(s?.status || "").toLowerCase();
    if (s?.name && st !== "active") {
      push(conditions, cond(`service:${s.name}`, "service", "critical", `Serviço ${s.name} parado`, `Estado: ${s.status || "desconhecido"}`));
    }
  }
  for (const u of failedUnits) {
    const name = String(typeof u === "string" ? u : u?.name || u?.unit || "");
    if (name) push(conditions, cond(`unit:${name}`, "service", "warning", `Unidade ${name} com falha`, "systemctl reporta estado failed."));
  }
  for (const r of raid) {
    if (r?.degraded === true) {
      push(conditions, cond(`raid:${r.device}`, "raid", "critical", `RAID ${r.device} degradado`, `Estado: ${r.state || "degraded"} — substitua o disco com falha.`));
    }
  }
  for (const z of zfs) {
    const name = String(z?.name || "?");
    if (String(z?.health || "").toUpperCase() !== "ONLINE") {
      push(conditions, cond(`zfs:${name}`, "zfs", "critical", `Pool ZFS ${name} ${z?.health || "com problema"}`,
        z?.errors ? `Erros: ${String(z.errors).substring(0, 200)}` : undefined));
    }
    push(conditions, pctCondition(`zfs:${name}:capacity`, "zfs", `Pool ZFS ${name}`, num(z?.capacity_pct), th.disk,
      { message: "ZFS perde desempenho acima de ~80% de ocupação." }));
  }
  for (const s of smart) {
    if (s?.passed === false) {
      push(conditions, cond(`smart:${s.device}`, "smart", "critical", `Disco ${s.device} reprovado no SMART`,
        `${s.result ? `${String(s.result).substring(0, 150)} — ` : ""}faça backup e planeje a troca.`));
    }
  }
  if (info.reboot_required === true) {
    push(conditions, cond("pending_reboot", "maintenance", "info", "Reinicialização pendente", "Kernel ou bibliotecas atualizados aguardam reinício."));
  }
  const secUpd = num(info.security_updates);
  if (secUpd && secUpd > 0) {
    push(conditions, cond("security_updates", "maintenance", "info", `${secUpd} atualização(ões) de segurança pendentes`));
  }

  update.last_success_at = now;
  const { error } = await supabase.from("linux_servers").update(update).eq("id", prev.id);
  if (error) throw error;

  await recordSample(supabase, src, { cpu: num(info.cpu_usage_pct), ram: ramPct, disk: maxDisk, extra: { iowait: num(info.iowait_pct), load_5: load5 } });
  const lines = await reconcileAlerts(supabase, src, conditions);
  return jsonResp({ success: true, server_id: prev.id, status: fs.status, alerts: lines.length });
}

// ---- SQL Server
async function handleSqlServer(ctx: Ctx) {
  const { supabase, cfg, body } = ctx;
  const { instance_id } = body;
  if (!instance_id) return jsonResp({ error: "instance_id required" }, 400);

  const { data: prev } = await supabase.from("sql_instances")
    .select("id, name, client_id, status, consecutive_failures, thresholds").eq("id", instance_id).maybeSingle();
  if (!prev) return jsonResp({ error: "Instance not found" }, 404);
  if (ownedByOther(ctx, prev.client_id)) return forbidden();

  const src: AlertSource = { type: "sqlserver", id: prev.id, name: prev.name, clientId: prev.client_id };
  const fs = failureState(cfg, body.status, prev);
  const now = new Date().toISOString();
  const update: Record<string, any> = {
    status: fs.status, consecutive_failures: fs.consecutive_failures, last_polled_at: now, last_error: body.last_error || null,
  };

  if (body.status === "offline") {
    await supabase.from("sql_instances").update(update).eq("id", prev.id);
    const lines = await handleCollectFailure(supabase, src, fs, body.last_error);
    return jsonResp({ success: true, status: fs.status, alerts: lines.length });
  }

  const info = body.info || {};
  const infoFields = [
    "version", "edition", "uptime_seconds", "sql_cpu_pct", "ple_seconds", "buffer_cache_hit_pct", "batch_requests_sec",
    "user_connections", "blocked_sessions", "longest_block_seconds", "agent_running", "max_server_memory_mb", "memory_used_mb",
  ];
  for (const f of infoFields) if (info[f] !== undefined) update[f] = info[f];
  if (body.agent_version !== undefined) update.agent_version = body.agent_version;

  const dbs: any[] = Array.isArray(body.databases) ? body.databases.slice(0, 500) : [];
  const jobs: any[] = Array.isArray(body.failed_jobs) ? body.failed_jobs.slice(0, 100) : [];
  const io: any[] = Array.isArray(body.io_latency) ? body.io_latency.slice(0, 500) : [];
  update.databases = dbs;
  update.failed_jobs = jobs;
  update.io_latency = io;
  update.long_running_queries = Array.isArray(body.long_running_queries) ? body.long_running_queries.slice(0, 50) : [];
  update.top_waits = Array.isArray(body.top_waits) ? body.top_waits.slice(0, 30) : [];

  const th = effectiveThresholds(cfg, prev.thresholds);
  const conditions: AlertCondition[] = [];

  push(conditions, pctCondition("cpu", "cpu", "CPU do SQL Server", num(info.sql_cpu_pct), th.cpu));

  const ple = num(info.ple_seconds);
  if (ple !== null && ple < th.sql_ple_min) {
    push(conditions, cond("ple", "memory", "warning", `Page Life Expectancy baixo (${Math.round(ple)} s)`,
      `As páginas ficam pouco tempo no cache (mínimo ${th.sql_ple_min} s): falta memória para o SQL Server e ele lê mais do disco.`,
      { value: ple, threshold: th.sql_ple_min, sustain: 3 }));
  }

  const block = num(info.longest_block_seconds);
  if (block !== null && block >= th.sql_block_seconds) {
    const crit = block >= th.sql_block_seconds * 5;
    push(conditions, cond("blocking", "locks", crit ? "critical" : "warning",
      `Bloqueio há ${Math.round(block)} s (${num(info.blocked_sessions) ?? "?"} sessão(ões) esperando)`,
      "Uma transação está segurando registros e outras ficam paradas aguardando. Verifique a sessão bloqueadora.",
      { value: block, threshold: th.sql_block_seconds }));
  }

  const isExpress = /express/i.test(String(info.edition || ""));
  if (info.agent_running === false && !isExpress) {
    push(conditions, cond("agent", "service", "warning", "SQL Server Agent parado",
      "Jobs agendados (inclusive backups) não serão executados."));
  }

  const logPct = th.sql_log_pct;
  for (const d of dbs) {
    const name = String(d?.name || "?");
    const state = String(d?.state || "").toUpperCase();
    if (state && state !== "ONLINE") {
      push(conditions, cond(`db:${name}:state`, "database", "critical", `Banco ${name} ${state}`,
        "O banco não está disponível para os sistemas."));
    }
    push(conditions, pctCondition(`db:${name}:log`, "database", `Log do banco ${name}`, num(d?.log_used_pct),
      { warn: logPct.warn, crit: logPct.crit, sustain: 1 },
      { message: `Log de transações quase cheio${d?.log_reuse_wait ? ` (aguardando: ${d.log_reuse_wait})` : ""}.` }));

    const lower = name.toLowerCase();
    if (lower === "tempdb" || lower === "model" || state !== "ONLINE") continue;
    const fullH = hoursSince(d?.last_full_backup);
    const limitFull = th.sql_backup_hours.full;
    if (fullH === null || fullH > limitFull) {
      const crit = fullH === null || fullH > limitFull * 3;
      push(conditions, cond(`db:${name}:backup`, "backup", crit ? "critical" : "warning",
        fullH === null ? `Banco ${name} sem backup completo` : `Backup completo de ${name} há ${Math.round(fullH)} h`,
        `Limite: ${limitFull} h. Sem backup recente, uma falha pode causar perda de dados.`,
        { value: fullH === null ? null : r1(fullH), threshold: limitFull }));
    }
    if (String(d?.recovery || "").toUpperCase() === "FULL") {
      const logH = hoursSince(d?.last_log_backup);
      const limitLog = th.sql_backup_hours.log;
      if (logH === null || logH > limitLog) {
        push(conditions, cond(`db:${name}:logbackup`, "backup", "warning",
          logH === null ? `Banco ${name} sem backup de log` : `Backup de log de ${name} há ${r1(logH)} h`,
          `Banco em recuperação FULL precisa de backup de log a cada ${limitLog} h; senão o log cresce sem parar.`,
          { value: logH === null ? null : r1(logH), threshold: limitLog }));
      }
    }
  }

  for (const j of jobs) {
    const name = String(j?.name || j?.job_name || "?");
    push(conditions, cond(`job:${name}`, "job", "warning", `Job ${name} falhou`,
      j?.message ? String(j.message).substring(0, 200) : undefined));
  }

  for (const l of io) {
    const ms = maxOf([num(l?.read_ms), num(l?.write_ms)]);
    if (ms === null || ms < 50) continue;
    push(conditions, cond(`io:${l?.db}:${l?.type}`, "io", ms >= 200 ? "critical" : "warning",
      `Disco lento em ${l?.db} (${l?.type}): ${Math.round(ms)} ms`,
      "Latência de leitura/escrita alta: o armazenamento está lento ou sobrecarregado.",
      { value: Math.round(ms), threshold: ms >= 200 ? 200 : 50, sustain: 3 }));
  }

  update.last_success_at = now;
  const { error } = await supabase.from("sql_instances").update(update).eq("id", prev.id);
  if (error) throw error;

  await recordSample(supabase, src, {
    cpu: num(info.sql_cpu_pct),
    ram: num(info.max_server_memory_mb) && num(info.memory_used_mb) !== null
      ? (Number(info.memory_used_mb) / Number(info.max_server_memory_mb)) * 100 : null,
    extra: { ple, blocked: num(info.blocked_sessions), connections: num(info.user_connections) },
  });
  const lines = await reconcileAlerts(supabase, src, conditions);
  return jsonResp({ success: true, status: fs.status, alerts: lines.length });
}

// ---- VMware
const vmIsOn = (s: unknown) => /on/i.test(String(s || "")) && !/off/i.test(String(s || ""));

async function handleVmware(ctx: Ctx) {
  const { supabase, cfg, body } = ctx;
  const { host_id } = body;
  if (!host_id) return jsonResp({ error: "host_id required" }, 400);

  const { data: prev } = await supabase.from("vmware_hosts")
    .select("id, name, client_id, status, consecutive_failures, thresholds").eq("id", host_id).maybeSingle();
  if (!prev) return jsonResp({ error: "Host not found" }, 404);
  if (ownedByOther(ctx, prev.client_id)) return forbidden();

  const src: AlertSource = { type: "vmware", id: prev.id, name: prev.name, clientId: prev.client_id };
  const vms: any[] = Array.isArray(body.vms) ? body.vms : [];
  const failed = body.status === "offline" ||
    (num(body.cpu_usage_pct) === null && num(body.ram_usage_pct) === null && vms.length === 0);
  const fs = failureState(cfg, failed ? "offline" : (body.status || "online"), prev);
  const now = new Date().toISOString();

  if (failed) {
    // Nunca apaga as VMs nem marca online numa coleta vazia.
    await supabase.from("vmware_hosts").update({
      status: fs.status, consecutive_failures: fs.consecutive_failures, last_polled_at: now,
      last_error: body.last_error || "Coleta sem dados",
    }).eq("id", prev.id);
    const lines = await handleCollectFailure(supabase, src, fs, body.last_error || "coleta sem dados");
    return jsonResp({ success: true, status: fs.status, alerts: lines.length });
  }

  const th = effectiveThresholds(cfg, prev.thresholds);
  const conditions: AlertCondition[] = [];
  push(conditions, pctCondition("cpu", "cpu", "CPU", num(body.cpu_usage_pct), th.cpu));
  push(conditions, pctCondition("ram", "ram", "Memória RAM", num(body.ram_usage_pct), th.ram));

  const datastores: any[] = Array.isArray(body.datastores) ? body.datastores : [];
  let maxDs: number | null = null;
  for (const ds of datastores) {
    const cap = num(ds?.capacity_gb ?? ds?.capacity);
    const free = num(ds?.free_gb ?? ds?.free);
    if (!cap || cap <= 0 || free === null) continue;
    const pct = ((cap - free) / cap) * 100;
    maxDs = Math.max(maxDs ?? 0, pct);
    push(conditions, pctCondition(`datastore:${ds?.name}`, "datastore", `Datastore ${ds?.name}`, pct, th.datastore,
      { message: `Livre: ${r1(free)} de ${r1(cap)} GB` }));
  }

  // VMs que desligaram: compara com o snapshot anterior e mantém o alerta enquanto seguir desligada.
  const { data: prevVms } = await supabase.from("vmware_vms").select("name, power_state").eq("host_id", prev.id);
  const wasOn = new Set((prevVms || []).filter((v: any) => vmIsOn(v.power_state)).map((v: any) => String(v.name)));
  const openKeys = await openAlertKeys(supabase, "vmware", prev.id);
  for (const vm of vms) {
    const name = String(vm?.name || "");
    const key = `vm:${name}`;
    if (name && !vmIsOn(vm?.power_state) && (wasOn.has(name) || openKeys.has(key))) {
      push(conditions, cond(key, "vm", "warning", `VM ${name} desligada`, `Estado: ${vm?.power_state || "desconhecido"}`));
    }
  }

  const { error: hostErr } = await supabase.from("vmware_hosts").update({
    status: fs.status, consecutive_failures: 0, last_success_at: now,
    cpu_cores: body.cpu_cores, cpu_usage_pct: body.cpu_usage_pct, ram_total_gb: body.ram_total_gb,
    ram_used_gb: body.ram_used_gb, ram_usage_pct: body.ram_usage_pct, esxi_version: body.esxi_version,
    uptime_seconds: body.uptime_seconds, datastores: body.datastores, last_polled_at: now, last_error: null,
  }).eq("id", prev.id);
  if (hostErr) throw hostErr;

  if (vms.length > 0) {
    await supabase.from("vmware_vms").delete().eq("host_id", prev.id);
    const { error: vmErr } = await supabase.from("vmware_vms").insert(vms.slice(0, 1000).map((vm: any) => ({
      host_id: prev.id, name: vm.name, power_state: vm.power_state || "unknown", guest_os: vm.guest_os,
      cpu_count: vm.cpu_count, ram_mb: vm.ram_mb, ip_address: vm.ip_address, tools_status: vm.tools_status,
      disk_used_gb: vm.disk_used_gb, disk_provisioned_gb: vm.disk_provisioned_gb, uptime_seconds: vm.uptime_seconds,
    })));
    if (vmErr) throw vmErr;
  }

  await recordSample(supabase, src, { cpu: num(body.cpu_usage_pct), ram: num(body.ram_usage_pct), disk: maxDs });
  const lines = await reconcileAlerts(supabase, src, conditions);
  return jsonResp({ success: true, status: fs.status, alerts: lines.length });
}

// ---- Proxmox
const CRITICAL_TAGS = /(^|[;,\s])(critico|crítico|prod|monitor)($|[;,\s])/i;

async function handleProxmox(ctx: Ctx) {
  const { supabase, cfg, body } = ctx;
  const { node_id, info = {}, storages, guests, interfaces } = body;
  if (!node_id) return jsonResp({ error: "node_id required" }, 400);

  const { data: prev } = await supabase.from("proxmox_nodes")
    .select("id, name, client_id, status, consecutive_failures, thresholds").eq("id", node_id).maybeSingle();
  if (!prev) return jsonResp({ error: "Node not found" }, 404);
  if (ownedByOther(ctx, prev.client_id)) return forbidden();

  const src: AlertSource = { type: "proxmox", id: prev.id, name: prev.name, clientId: prev.client_id };
  const fs = failureState(cfg, body.status, prev);
  const now = new Date().toISOString();
  const update: Record<string, any> = {
    status: fs.status, consecutive_failures: fs.consecutive_failures, last_polled_at: now, last_error: body.last_error || null,
  };

  if (body.status === "offline") {
    await supabase.from("proxmox_nodes").update(update).eq("id", prev.id);
    const lines = await handleCollectFailure(supabase, src, fs, body.last_error || "sem resposta da API");
    return jsonResp({ success: true, status: fs.status, alerts: lines.length });
  }

  const infoFields = [
    "node_name", "pve_version", "cpu_model", "cpu_cores", "cpu_usage_pct", "iowait_pct",
    "ram_total_gb", "ram_used_gb", "ram_usage_pct", "swap_total_gb", "swap_used_gb",
    "disk_total_gb", "disk_used_gb", "disk_usage_pct", "load_avg", "uptime_seconds",
  ];
  for (const f of infoFields) if (info[f] !== undefined) update[f] = info[f];
  const storageList: any[] = Array.isArray(storages) ? storages.slice(0, 100) : [];
  if (Array.isArray(storages)) update.storages = storageList;

  const th = effectiveThresholds(cfg, prev.thresholds);
  const conditions: AlertCondition[] = [];
  const swapPct = num(info.swap_total_gb) && num(info.swap_used_gb) !== null
    ? (Number(info.swap_used_gb) / Number(info.swap_total_gb)) * 100 : null;

  push(conditions, pctCondition("cpu", "cpu", "CPU", num(info.cpu_usage_pct), th.cpu));
  push(conditions, pctCondition("ram", "ram", "Memória RAM", num(info.ram_usage_pct), th.ram,
    { message: "Verifique as VMs/containers que mais consomem memória." }));
  push(conditions, pctCondition("iowait", "cpu", "Espera de disco (iowait)", num(info.iowait_pct), th.iowait,
    { message: "A CPU está esperando o disco — armazenamento lento ou sobrecarregado." }));
  push(conditions, pctCondition("swap", "ram", "Swap", swapPct, th.swap,
    { message: "Uso de swap alto indica falta de memória RAM no host." }));
  push(conditions, pctCondition("disk:root", "disk", "Disco do sistema (/)", num(info.disk_usage_pct), th.disk));

  for (const s of storageList) {
    const name = String(s?.storage ?? s?.name ?? "?");
    let pct = num(s?.used_pct ?? s?.usage_pct);
    if (pct === null) {
      const total = num(s?.total_gb ?? s?.total);
      const used = num(s?.used_gb ?? s?.used);
      if (total && total > 0 && used !== null) pct = (used / total) * 100;
    }
    push(conditions, pctCondition(`storage:${name}`, "storage", `Storage ${name}`, pct, th.datastore));
  }

  const guestList: any[] = Array.isArray(guests) ? guests.slice(0, 500) : [];
  if (Array.isArray(guests)) {
    const { data: prevGuests } = await supabase.from("proxmox_guests").select("vmid, status").eq("node_id", prev.id);
    const wasRunning = new Set((prevGuests || []).filter((g: any) => g.status === "running").map((g: any) => Number(g.vmid)));
    const openKeys = await openAlertKeys(supabase, "proxmox", prev.id);
    for (const g of guestList) {
      const vmid = Number(g?.vmid) || 0;
      if (!vmid || g?.status === "running") continue;
      const key = `guest:${vmid}`;
      const critical = CRITICAL_TAGS.test(String(g?.tags || ""));
      if (critical || wasRunning.has(vmid) || openKeys.has(key)) {
        push(conditions, cond(key, "guest", critical ? "critical" : "warning",
          `${g?.guest_type === "lxc" ? "Container" : "VM"} ${vmid} (${g?.name || "—"}) parada`,
          `Estado: ${g?.status || "desconhecido"}${critical ? " — marcada como crítica" : ""}`));
      }
    }
  }

  update.last_success_at = now;
  const { error: nodeErr } = await supabase.from("proxmox_nodes").update(update).eq("id", prev.id);
  if (nodeErr) throw nodeErr;

  if (Array.isArray(guests)) {
    await supabase.from("proxmox_guests").delete().eq("node_id", prev.id);
    if (guestList.length > 0) {
      const { error: guestErr } = await supabase.from("proxmox_guests").insert(guestList.map((g: any) => ({
        node_id: prev.id,
        vmid: Number(g.vmid) || 0,
        name: String(g.name || `VM ${g.vmid}`).substring(0, 200),
        guest_type: g.guest_type === "lxc" ? "lxc" : "qemu",
        status: String(g.status || "unknown"),
        cpu_count: g.cpu_count ?? null,
        cpu_usage_pct: g.cpu_usage_pct ?? null,
        ram_total_gb: g.ram_total_gb ?? null,
        ram_used_gb: g.ram_used_gb ?? null,
        ram_usage_pct: g.ram_usage_pct ?? null,
        disk_total_gb: g.disk_total_gb ?? null,
        disk_used_gb: g.disk_used_gb ?? null,
        uptime_seconds: g.uptime_seconds ?? null,
        tags: g.tags ?? null,
      })));
      if (guestErr) throw guestErr;
    }
  }

  if (Array.isArray(interfaces) && interfaces.length > 0) {
    await upsertProxmoxInterfaces(supabase, prev.id, interfaces);
  }

  await recordSample(supabase, src, {
    cpu: num(info.cpu_usage_pct), ram: num(info.ram_usage_pct), disk: num(info.disk_usage_pct),
    extra: { iowait: num(info.iowait_pct), swap_pct: swapPct === null ? null : r1(swapPct) },
  });
  const lines = await reconcileAlerts(supabase, src, conditions);
  return jsonResp({ success: true, status: fs.status, alerts: lines.length });
}

async function upsertProxmoxInterfaces(supabase: SupabaseClient, nodeId: string, interfaces: any[]) {
  const rows = interfaces.slice(0, 100).map((i: any) => ({
    node_id: nodeId,
    interface_name: String(i.interface_name || "").substring(0, 100),
    status: String(i.status || "unknown").substring(0, 30),
    mac_address: i.mac_address ? String(i.mac_address).substring(0, 40) : null,
    speed_mbps: num(i.speed_mbps),
    rx_bytes: num(i.rx_bytes),
    tx_bytes: num(i.tx_bytes),
    rx_rate_bps: num(i.rx_rate_bps),
    tx_rate_bps: num(i.tx_rate_bps),
    rx_errors: num(i.rx_errors),
    tx_errors: num(i.tx_errors),
    updated_at: new Date().toISOString(),
  })).filter((r: any) => r.interface_name);
  if (!rows.length) return 0;
  const { error } = await supabase.from("proxmox_interfaces").upsert(rows, { onConflict: "node_id,interface_name" });
  if (error) throw error;
  return rows.length;
}

async function handleProxmoxNet(ctx: Ctx) {
  const { supabase, body } = ctx;
  const { node_id, hostname, interfaces } = body;
  if (!Array.isArray(interfaces) || interfaces.length === 0) return jsonResp({ error: "interfaces required" }, 400);

  let resolvedId: string | null = node_id || null;
  if (!resolvedId && hostname) {
    let q = supabase.from("proxmox_nodes").select("id, name, node_name").eq("is_active", true);
    if (ctx.tokenClientId) q = q.eq("client_id", ctx.tokenClientId);
    const { data: candidates } = await q;
    const host = String(hostname).toLowerCase();
    const match = (candidates || []).find(
      (n: any) => String(n.node_name || "").toLowerCase() === host || String(n.name || "").toLowerCase() === host,
    );
    resolvedId = match?.id ?? null;
  }
  if (!resolvedId) {
    return jsonResp({ error: `Nó Proxmox não identificado (hostname: ${hostname || "—"}). Informe --node-id.` }, 404);
  }
  if (ctx.tokenClientId) {
    const { data: n } = await supabase.from("proxmox_nodes").select("client_id").eq("id", resolvedId).maybeSingle();
    if (n && n.client_id !== ctx.tokenClientId) return forbidden();
  }
  const count = await upsertProxmoxInterfaces(supabase, resolvedId, interfaces);
  return jsonResp({ success: true, node_id: resolvedId, interfaces: count });
}

// ---- iLO / iDRAC
async function handleIlo(ctx: Ctx) {
  const { supabase, cfg, body } = ctx;
  const { server_id, info, health, sensors, events } = body;
  if (!server_id) return jsonResp({ error: "server_id required" }, 400);

  const { data: prev } = await supabase.from("ilo_servers")
    .select("id, name, client_id, status, consecutive_failures, thresholds").eq("id", server_id).maybeSingle();
  if (!prev) return jsonResp({ error: "Server not found" }, 404);
  if (ownedByOther(ctx, prev.client_id)) return forbidden();

  const src: AlertSource = { type: "ilo", id: prev.id, name: prev.name, clientId: prev.client_id };
  const fs = failureState(cfg, body.status, prev);
  const now = new Date().toISOString();
  const update: Record<string, any> = {
    status: fs.status, consecutive_failures: fs.consecutive_failures, last_polled_at: now,
    last_error: body.last_error || null, updated_at: now,
  };

  if (body.status === "offline") {
    await supabase.from("ilo_servers").update(update).eq("id", prev.id);
    const lines = await handleCollectFailure(supabase, src, fs, body.last_error);
    return jsonResp({ success: true, status: fs.status, alerts: lines.length });
  }

  const infoFields = [
    "server_model", "serial_number", "ilo_version", "ilo_firmware", "bios_version",
    "cpu_model", "cpu_count", "ram_total_gb", "power_state", "post_state",
    "indicator_led", "uptime_seconds", "health_summary",
  ];
  for (const f of infoFields) if (info && info[f] !== undefined) update[f] = info[f];
  const healthFields = [
    "health_processor", "health_memory", "health_storage",
    "health_fans", "health_power", "health_temperature", "health_network",
  ];
  for (const f of healthFields) if (health && health[f] !== undefined) update[f] = health[f];
  update.last_success_at = now;

  const { error: srvErr } = await supabase.from("ilo_servers").update(update).eq("id", prev.id);
  if (srvErr) throw srvErr;

  const th = effectiveThresholds(cfg, prev.thresholds);
  const tempMargin = Number(th.temperature_margin_c) || 0;
  const sensorList: SensorPayload[] = Array.isArray(sensors) ? sensors.slice(0, 500) : [];

  if (Array.isArray(sensors)) {
    await supabase.from("ilo_sensors").delete().eq("server_id", prev.id);
    if (sensorList.length > 0) {
      const { error: sensorErr } = await supabase.from("ilo_sensors").insert(sensorList.map((s: any) => ({
        server_id: prev.id,
        sensor_type: String(s.sensor_type || "other"),
        name: String(s.name || "—"),
        reading: s.reading ?? null,
        unit: s.unit ?? null,
        status: s.status ?? null,
        health: s.health ?? null,
        upper_critical: s.upper_critical ?? null,
        location: s.location ?? null,
        details: s.details ?? null,
      })));
      if (sensorErr) throw sensorErr;
    }
    await syncSensorAlertTable(supabase, prev.id, sensorList, tempMargin);
  }

  const conditions: AlertCondition[] = [];
  for (const s of sensorList) {
    const c = classificarSensor(s, tempMargin);
    if (!c) continue;
    const t = String(s.sensor_type || "other");
    const leitura = typeof s.reading === "number" ? `${s.reading}${s.unit ? ` ${s.unit}` : ""}` : "—";
    push(conditions, cond(`sensor:${t}:${s.name || "—"}`.substring(0, 200), "sensor", c.severity,
      `${TIPO_LABEL[t] || TIPO_LABEL.other} ${s.name || "—"}: ${c.motivo}`,
      `Leitura: ${leitura}${s.location ? ` · Local: ${s.location}` : ""}`,
      { value: typeof s.reading === "number" ? s.reading : null, threshold: s.upper_critical ?? null }));
  }

  const healthMap: Record<string, string> = {
    health_summary: "Saúde geral", health_processor: "Processador", health_memory: "Memória",
    health_storage: "Armazenamento", health_fans: "Ventilação", health_power: "Fontes",
    health_temperature: "Temperatura", health_network: "Rede",
  };
  for (const [field, label] of Object.entries(healthMap)) {
    const v = String(update[field] ?? "").toLowerCase();
    if (v === "critical" || v === "warning") {
      push(conditions, cond(`health:${field.replace("health_", "")}`, "health", v === "critical" ? "critical" : "warning",
        `${label} do hardware em ${v === "critical" ? "estado CRÍTICO" : "atenção"}`));
    }
  }
  if (String(update.power_state ?? "").toLowerCase() === "off") {
    push(conditions, cond("power", "power", "critical", "Servidor desligado", "A controladora informa energia Off."));
  }

  // Eventos IML/SEL: só os críticos novos geram aviso pontual.
  const newCritical: string[] = [];
  if (Array.isArray(events) && events.length > 0) {
    const rows = events.slice(0, 200).map((e: any) => ({
      server_id: prev.id,
      event_key: String(e.event_key ?? `${e.recorded_at}-${e.message}`).substring(0, 200),
      severity: String(e.severity || "info"),
      category: e.category ?? null,
      message: String(e.message || "").substring(0, 2000),
      recorded_at: e.recorded_at || now,
    }));
    const { data: inserted, error: evErr } = await supabase.from("ilo_events")
      .upsert(rows, { onConflict: "server_id,event_key", ignoreDuplicates: true })
      .select("severity, message");
    if (evErr) console.error("ilo events upsert:", evErr.message);
    (inserted || []).forEach((e: any) => { if (e.severity === "critical") newCritical.push(e.message); });
  }
  if (newCritical.length) {
    await notifyEvent(supabase, src, "critical",
      newCritical.slice(0, 5).map((m) => ({ title: "Evento crítico no log do hardware", message: String(m).substring(0, 300) })));
  }

  const temps = sensorList.filter((s) => s.sensor_type === "temperature").map((s) => num(s.reading));
  const watts = sensorList
    .filter((s) => /^w(atts)?$/i.test(String(s.unit || "").trim()))
    .map((s) => num(s.reading)).filter((v): v is number => v !== null);
  await recordSample(supabase, src, {
    extra: { temp_max: maxOf(temps), watts: watts.length ? r1(watts.reduce((a, b) => a + b, 0)) : null },
  });

  const lines = await reconcileAlerts(supabase, src, conditions);
  return jsonResp({ success: true, status: fs.status, alerts: lines.length, new_critical: newCritical.length });
}

// ---- Listas para os coletores (exigem token)
async function handleList(ctx: Ctx, type: string) {
  const { supabase } = ctx;
  const map: Record<string, { table: string; cols: string }> = {
    "list-windows": { table: "windows_servers", cols: "id, name, host" },
    "list-vmware": { table: "vmware_hosts", cols: "id, name, host, username, password, port" },
    "list-ilo": { table: "ilo_servers", cols: "id, name, host, username, password, port, vendor" },
    "list-proxmox": { table: "proxmox_nodes", cols: "id, name, host, port, node_name, auth_mode, username, token_name, token_secret, password" },
    "list-sqlserver": { table: "sql_instances", cols: "id, name, instance, auth_mode, username, password" },
  };
  const def = map[type];
  if (!def) return jsonResp({ error: "Unknown type" }, 400);
  let q = supabase.from(def.table).select(def.cols).eq("is_active", true);
  if (ctx.tokenClientId) q = q.eq("client_id", ctx.tokenClientId);
  const { data, error } = await q;
  if (error) throw error;
  return jsonResp(data || []);
}

// ---------------------------------------------------------------- servidor

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const body = await req.json().catch(() => null);
    if (!body || typeof body.type !== "string") return jsonResp({ error: "type required" }, 400);
    const type: string = body.type;

    const auth = await authenticateAgent(req, supabase, type, { requireToken: type.startsWith("list-") });
    if (!auth.ok) return jsonResp({ error: auth.error }, auth.status);

    const ctx: Ctx = { supabase, cfg: await loadMonitorConfig(supabase), body, tokenClientId: auth.clientId };

    if (type.startsWith("list-")) return await handleList(ctx, type);
    switch (type) {
      case "windows": return await handleWindows(ctx);
      case "linux": return await handleLinux(ctx);
      case "sqlserver": return await handleSqlServer(ctx);
      case "vmware": return await handleVmware(ctx);
      case "proxmox": return await handleProxmox(ctx);
      case "proxmox-net": return await handleProxmoxNet(ctx);
      case "ilo": return await handleIlo(ctx);
      default: return jsonResp({ error: "Unknown type" }, 400);
    }
  } catch (err) {
    console.error(err);
    return jsonResp({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});
