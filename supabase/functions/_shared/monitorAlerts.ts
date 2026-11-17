/**
 * Núcleo compartilhado do monitoramento v2: configuração, autenticação de
 * agentes, amostras, estado de falha, reconciliação de alertas e envio
 * agrupado por WhatsApp (Evolution API).
 */
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { getEvolutionConfig, toEvolutionNumber } from "./whatsapp.ts";

// ---------------------------------------------------------------- tipos

export type Severity = "info" | "warning" | "critical";
export type SourceType = "windows" | "linux" | "sqlserver" | "vmware" | "proxmox" | "ilo" | "endpoint" | "probe";

export interface PctLimit { warn: number; crit: number; sustain?: number }

export interface MonitorConfig {
  thresholds: {
    cpu: PctLimit; ram: PctLimit; disk: PctLimit; swap: PctLimit; iowait: PctLimit; datastore: PctLimit;
    sql_ple_min: number;
    sql_block_seconds: number;
    sql_log_pct: { warn: number; crit: number };
    sql_backup_hours: { full: number; log: number };
    temperature_margin_c: number;
    [k: string]: unknown;
  };
  offline_after_failures: number;
  stale_minutes: number;
  renotify_critical_minutes: number;
  quiet_hours: { enabled: boolean; start: string; end: string; allow_critical: boolean };
  daily_digest: boolean;
}

export interface AlertSource { type: SourceType | string; id: string; name: string; clientId: string | null }

export interface AlertCondition {
  key: string;            // ex.: "disk:C:", "service:MSSQLSERVER", "offline"
  category: string;       // ex.: "disk", "cpu", "service"
  severity: Severity;
  title: string;
  message?: string;
  value?: number | null;
  threshold?: number | null;
  sustain?: number;       // nº de coletas seguidas antes de avisar (padrão 1)
}

export interface AlertLine {
  alertId: string | null;
  severity: Severity;
  title: string;
  message?: string;
  resolved?: boolean;
}

export interface MonitorToken { id: string; client_id: string | null; scopes: string[] }

// ---------------------------------------------------------------- config

export const DEFAULT_MONITOR_CONFIG: MonitorConfig = {
  thresholds: {
    cpu: { warn: 85, crit: 95, sustain: 3 },
    ram: { warn: 90, crit: 95, sustain: 3 },
    disk: { warn: 85, crit: 92, sustain: 1 },
    swap: { warn: 50, crit: 80, sustain: 3 },
    iowait: { warn: 20, crit: 40, sustain: 3 },
    datastore: { warn: 85, crit: 92, sustain: 1 },
    sql_ple_min: 300,
    sql_block_seconds: 60,
    sql_log_pct: { warn: 80, crit: 90 },
    sql_backup_hours: { full: 26, log: 2 },
    temperature_margin_c: 5,
  },
  offline_after_failures: 3,
  stale_minutes: 15,
  renotify_critical_minutes: 120,
  quiet_hours: { enabled: false, start: "22:00", end: "07:00", allow_critical: true },
  daily_digest: true,
};

const isObj = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);

export function deepMerge<T>(base: T, over: unknown): T {
  if (!isObj(base) || !isObj(over)) return (over === undefined || over === null ? base : over) as T;
  const out: Record<string, unknown> = { ...(base as Record<string, unknown>) };
  for (const [k, v] of Object.entries(over)) {
    if (v === undefined || v === null) continue;
    out[k] = isObj(out[k]) && isObj(v) ? deepMerge(out[k], v) : v;
  }
  return out as T;
}

let cfgCache: { at: number; cfg: MonitorConfig } | null = null;
const CFG_TTL_MS = 60_000;

export async function loadMonitorConfig(supabase: SupabaseClient): Promise<MonitorConfig> {
  if (cfgCache && Date.now() - cfgCache.at < CFG_TTL_MS) return cfgCache.cfg;
  let stored: unknown = null;
  try {
    const { data } = await supabase.from("system_settings").select("value").eq("key", "monitor_config").maybeSingle();
    if (data?.value) stored = typeof data.value === "string" ? JSON.parse(data.value) : data.value;
  } catch (e) {
    console.error("[monitorAlerts] monitor_config inválido, usando padrões", e);
  }
  const cfg = deepMerge(DEFAULT_MONITOR_CONFIG, stored);
  cfgCache = { at: Date.now(), cfg };
  return cfg;
}

/** Limites globais + coluna `thresholds` da própria fonte (que tem prioridade). */
export function effectiveThresholds(cfg: MonitorConfig, override: unknown): MonitorConfig["thresholds"] {
  return deepMerge(cfg.thresholds, isObj(override) ? override : null);
}

// ---------------------------------------------------------------- condições

const fmtPct = (v: number) => `${Math.round(v * 10) / 10}%`;

/** Condição de porcentagem (CPU, RAM, disco…). Retorna null se estiver normal. */
export function pctCondition(
  key: string,
  category: string,
  label: string,
  value: number | null | undefined,
  limit: PctLimit,
  extra?: { message?: string },
): AlertCondition | null {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return null;
  const v = Number(value);
  let severity: Severity | null = null;
  let threshold = limit.warn;
  if (v >= limit.crit) { severity = "critical"; threshold = limit.crit; }
  else if (v >= limit.warn) severity = "warning";
  if (!severity) return null;
  return {
    key, category, severity,
    title: `${label} em ${fmtPct(v)}`,
    message: extra?.message ?? `Limite ${severity === "critical" ? "crítico" : "de atenção"}: ${threshold}%`,
    value: Math.round(v * 10) / 10,
    threshold,
    sustain: Math.max(1, limit.sustain ?? 1),
  };
}

// ---------------------------------------------------------------- autenticação

const TYPE_SCOPE: Record<string, string> = {
  windows: "windows", "list-windows": "windows",
  linux: "linux", "list-linux": "linux",
  sqlserver: "sqlserver", "list-sqlserver": "sqlserver",
  vmware: "vmware", "list-vmware": "vmware",
  proxmox: "proxmox", "proxmox-net": "proxmox", "list-proxmox": "proxmox",
  ilo: "ilo", "list-ilo": "ilo",
};

export function scopeForType(type: string): string | null {
  return TYPE_SCOPE[type] ?? null;
}

export async function sha256Hex(value: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export type AgentAuthResult =
  | { ok: true; token: MonitorToken | null; clientId: string | null; legacy: boolean }
  | { ok: false; status: 401 | 403; error: string };

/**
 * Valida o header x-monitor-token.
 * - `scope` pode ser um escopo ("vmware") ou um type ("list-vmware", "proxmox-net").
 * - `requireToken`: força token (usado em list-*). Sem isso, a ausência de token
 *   só é aceita enquanto MONITOR_REQUIRE_TOKEN != "true" (modo legado).
 */
export async function authenticateAgent(
  req: Request,
  supabase: SupabaseClient,
  scope: string,
  opts: { requireToken?: boolean } = {},
): Promise<AgentAuthResult> {
  const needed = TYPE_SCOPE[scope] ?? scope;
  const requireToken = opts.requireToken ?? scope.startsWith("list-");
  const raw = (req.headers.get("x-monitor-token") || "").trim();

  if (!raw) {
    if (requireToken || Deno.env.get("MONITOR_REQUIRE_TOKEN") === "true") {
      return { ok: false, status: 401, error: "x-monitor-token obrigatório" };
    }
    console.warn(`[monitorAlerts] requisição sem token (scope=${scope}) — modo legado`);
    return { ok: true, token: null, clientId: null, legacy: true };
  }

  const { data } = await supabase
    .from("monitor_agent_tokens")
    .select("id, client_id, scopes")
    .eq("token_hash", await sha256Hex(raw))
    .is("revoked_at", null)
    .maybeSingle();
  if (!data) return { ok: false, status: 401, error: "Token inválido ou revogado" };
  const token = data as MonitorToken;

  // O escopo "agent" (agente unificado mororo-agent) vale para todos os tipos.
  if (token.scopes?.length && !token.scopes.includes(needed) && !token.scopes.includes("agent")) {
    return { ok: false, status: 403, error: `Token sem permissão para '${scope}'` };
  }

  const ip = (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || null;
  // Não bloqueia a resposta.
  supabase.from("monitor_agent_tokens")
    .update({ last_used_at: new Date().toISOString(), last_ip: ip })
    .eq("id", token.id)
    .then(({ error }) => { if (error) console.error("[monitorAlerts] last_used_at", error); });

  return { ok: true, token, clientId: token.client_id, legacy: false };
}

// ---------------------------------------------------------------- amostras e falhas

export async function recordSample(
  supabase: SupabaseClient,
  src: AlertSource,
  m: { cpu?: number | null; ram?: number | null; disk?: number | null; extra?: unknown },
): Promise<void> {
  const num = (v: unknown) => (v === null || v === undefined || !Number.isFinite(Number(v)) ? null : Number(v));
  const { error } = await supabase.from("monitor_metric_samples").insert({
    source_type: src.type,
    source_id: src.id,
    client_id: src.clientId,
    cpu_pct: num(m.cpu),
    ram_pct: num(m.ram),
    disk_pct: num(m.disk),
    extra: m.extra ?? null,
  });
  if (error) console.error("[monitorAlerts] recordSample", error);
}

/**
 * "offline" incrementa consecutive_failures; qualquer outro status zera.
 * Só confirma offline após cfg.offline_after_failures; antes disso mantém o status anterior.
 */
export function failureState(
  cfg: MonitorConfig,
  reportedStatus: string | null | undefined,
  previous: { status?: string | null; consecutive_failures?: number | null } | null,
): { status: string; consecutive_failures: number; confirmedOffline: boolean; recovered: boolean } {
  const prevStatus = previous?.status || "unknown";
  const prevFails = Number(previous?.consecutive_failures || 0);
  const reported = reportedStatus || "online";

  if (reported === "offline") {
    const fails = prevFails + 1;
    const confirmed = fails >= Math.max(1, cfg.offline_after_failures);
    return {
      status: confirmed ? "offline" : (prevStatus === "offline" ? "unknown" : prevStatus),
      consecutive_failures: fails,
      confirmedOffline: confirmed,
      recovered: false,
    };
  }
  return { status: reported, consecutive_failures: 0, confirmedOffline: false, recovered: prevStatus === "offline" };
}

// ---------------------------------------------------------------- reconciliação

const SEV_RANK: Record<Severity, number> = { info: 0, warning: 1, critical: 2 };

interface AlertRow {
  id: string; alert_key: string; severity: Severity; status: string;
  breach_count: number; notify_count: number; last_notified_at: string | null;
}

/**
 * Compara o conjunto COMPLETO de condições anormais desta coleta com os alertas
 * abertos da fonte. Cria/atualiza/resolve e decide quem deve ser avisado.
 */
export async function reconcileAlerts(
  supabase: SupabaseClient,
  src: AlertSource,
  conditions: AlertCondition[],
  opts: { managedPrefixes?: string[]; partial?: boolean; silent?: boolean; header?: string; logType?: string } = {},
): Promise<AlertLine[]> {
  const cfg = await loadMonitorConfig(supabase);
  const now = new Date();
  const nowIso = now.toISOString();
  const lines: AlertLine[] = [];

  // Deduplica por key (mantém a mais grave).
  const byKey = new Map<string, AlertCondition>();
  for (const c of conditions) {
    if (!c) continue;
    const cur = byKey.get(c.key);
    if (!cur || SEV_RANK[c.severity] > SEV_RANK[cur.severity]) byKey.set(c.key, c);
  }

  const { data: openRows, error } = await supabase
    .from("monitor_alerts")
    .select("id, alert_key, severity, status, breach_count, notify_count, last_notified_at")
    .eq("source_type", src.type)
    .eq("source_id", src.id)
    .in("status", ["active", "acknowledged"]);
  if (error) { console.error("[monitorAlerts] reconcile select", error); return lines; }
  const open = new Map<string, AlertRow>(((openRows || []) as AlertRow[]).map((r) => [r.alert_key, r]));

  const renotifyMs = Math.max(1, cfg.renotify_critical_minutes) * 60_000;

  for (const c of byKey.values()) {
    const prev = open.get(c.key);
    const sustain = Math.max(1, c.sustain ?? 1);
    const base = {
      source_name: src.name, client_id: src.clientId, category: c.category,
      severity: c.severity, title: c.title, message: c.message ?? null,
      value: c.value ?? null, threshold: c.threshold ?? null, last_seen_at: nowIso,
    };

    let row: AlertRow | null = null;
    let breach = 1;
    let notifyCount = 0;
    let notify = false;

    if (!prev) {
      // Pode existir uma linha resolvida com a mesma chave (unique): reabre.
      const { data, error: upErr } = await supabase.from("monitor_alerts").upsert({
        ...base, source_type: src.type, source_id: src.id, alert_key: c.key,
        status: "active", breach_count: 1, notify_count: 0, first_detected_at: nowIso,
        last_notified_at: null, acknowledged_by: null, acknowledged_at: null, ack_note: null, resolved_at: null,
      }, { onConflict: "source_type,source_id,alert_key" }).select("id, alert_key, severity, status, breach_count, notify_count, last_notified_at").single();
      if (upErr) { console.error("[monitorAlerts] insert", upErr); continue; }
      row = data as AlertRow;
      notify = sustain <= 1;
    } else {
      breach = (prev.breach_count || 0) + 1;
      notifyCount = prev.notify_count || 0;
      const escalated = SEV_RANK[c.severity] > SEV_RANK[prev.severity] && c.severity === "critical";
      const reachedSustain = breach >= sustain && notifyCount === 0;
      const renotify = c.severity === "critical" && prev.status === "active" && notifyCount > 0 &&
        (!prev.last_notified_at || now.getTime() - new Date(prev.last_notified_at).getTime() >= renotifyMs);
      notify = reachedSustain || escalated || renotify;
      const { error: updErr } = await supabase.from("monitor_alerts").update({ ...base, breach_count: breach }).eq("id", prev.id);
      if (updErr) console.error("[monitorAlerts] update", updErr);
      row = { ...prev, breach_count: breach, severity: c.severity };
    }

    if (notify && c.severity !== "info" && row) {
      lines.push({ alertId: row.id, severity: c.severity, title: c.title, message: c.message });
      await supabase.from("monitor_alerts").update({
        notify_count: (row.notify_count || 0) + 1, last_notified_at: nowIso,
      }).eq("id", row.id);
    }
  }

  // Resolve alertas que sumiram.
  if (!opts.partial) {
    const prefixes = opts.managedPrefixes;
    const manages = (key: string) =>
      prefixes ? prefixes.some((p) => key === p || key.startsWith(p)) : !(key === "stale" || key.startsWith("stale:"));
    for (const prev of open.values()) {
      if (byKey.has(prev.alert_key) || !manages(prev.alert_key)) continue;
      const { data: res, error: rErr } = await supabase.from("monitor_alerts")
        .update({ status: "resolved", resolved_at: nowIso, last_seen_at: nowIso })
        .eq("id", prev.id)
        .select("title")
        .single();
      if (rErr) { console.error("[monitorAlerts] resolve", rErr); continue; }
      if ((prev.notify_count || 0) > 0 && prev.severity !== "info") {
        lines.push({
          alertId: prev.id, severity: prev.severity, resolved: true,
          title: `✅ Normalizado: ${(res as { title: string })?.title ?? prev.alert_key}`,
        });
      }
    }
  }

  if (opts.silent || lines.length === 0) return lines;
  await dispatchGrouped(supabase, src.clientId, opts.header ?? sourceHeader(src), lines, opts.logType ?? `monitor_${src.type}`);
  return lines;
}

// ---------------------------------------------------------------- envio

const SOURCE_ICON: Record<string, string> = {
  windows: "🪟 Windows", linux: "🐧 Linux", sqlserver: "🗄️ SQL Server",
  vmware: "☁️ VMware", proxmox: "🖥️ Proxmox", ilo: "🧰 iLO/iDRAC",
  endpoint: "💻 Estação", probe: "📶 Rede",
};

export function sourceHeader(src: AlertSource): string {
  return `${SOURCE_ICON[src.type] ?? src.type} — ${src.name}`;
}

function severityEmoji(l: AlertLine): string {
  if (l.resolved) return "🟢";
  return l.severity === "critical" ? "🔴" : l.severity === "warning" ? "🟡" : "🔵";
}

function toMinutes(hhmm: string): number {
  const [h, m] = String(hhmm || "0:0").split(":").map((x) => Number(x) || 0);
  return h * 60 + m;
}

export function isQuietNow(cfg: MonitorConfig, at = new Date()): boolean {
  const q = cfg.quiet_hours;
  if (!q?.enabled) return false;
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "America/Fortaleza", hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(at);
  const h = Number(parts.find((p) => p.type === "hour")?.value || 0) % 24;
  const m = Number(parts.find((p) => p.type === "minute")?.value || 0);
  const now = h * 60 + m;
  const s = toMinutes(q.start), e = toMinutes(q.end);
  return s <= e ? now >= s && now < e : now >= s || now < e;
}

function buildMessage(header: string, items: AlertLine[]): string {
  const top = items.some((i) => !i.resolved && i.severity === "critical") ? "🔥" :
    items.every((i) => i.resolved) ? "✅" : "⚠️";
  const body = items.map((i) => `${severityEmoji(i)} *${i.title}*${i.message ? `\n   ${i.message}` : ""}`).join("\n\n");
  const when = new Date().toLocaleString("pt-BR", { timeZone: "America/Fortaleza" });
  return `${top} *${header}*\n\n${body}\n\n_${when}_`;
}

async function sendEvolution(cfg: { baseUrl: string; apiKey: string; instance: string }, to: string, text: string) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15_000);
  try {
    const res = await fetch(`${cfg.baseUrl}/message/sendText/${encodeURIComponent(cfg.instance)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: cfg.apiKey },
      body: JSON.stringify({ number: toEvolutionNumber(to), text }),
      signal: ctrl.signal,
    });
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}: ${(await res.text()).slice(0, 300)}` };
    return { ok: true, error: null };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? (e.name === "AbortError" ? "timeout 15s" : e.message) : String(e) };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Envia UMA mensagem por destinatário com todas as linhas da coleta.
 * Admins recebem warning e critical; o grupo do cliente só se monitor_notify_group,
 * respeitando monitor_min_severity. Horário silencioso: só crítico (se allow_critical).
 */
export async function dispatchGrouped(
  supabase: SupabaseClient,
  clientId: string | null,
  header: string,
  items: AlertLine[],
  logType: string,
): Promise<{ sent: number; failed: number }> {
  const result = { sent: 0, failed: 0 };
  let list = items.filter((i) => i.severity !== "info");
  if (list.length === 0) return result;

  const cfg = await loadMonitorConfig(supabase);
  if (isQuietNow(cfg)) {
    list = cfg.quiet_hours.allow_critical ? list.filter((i) => i.severity === "critical") : [];
    if (list.length === 0) return result;
  }

  const evo = await getEvolutionConfig();
  if (!evo.enabled || !evo.baseUrl || !evo.apiKey) {
    console.warn("[monitorAlerts] WhatsApp desativado ou sem configuração");
    return result;
  }

  // Destinatários
  const recipients: { to: string; items: AlertLine[] }[] = [];
  const { data: roles } = await supabase.from("user_roles").select("user_id").eq("role", "admin");
  const adminIds = (roles || []).map((r: { user_id: string }) => r.user_id);
  if (adminIds.length) {
    const { data: profs } = await supabase.from("profiles").select("phone").in("id", adminIds);
    const phones = new Set((profs || []).map((p: { phone: string | null }) => (p.phone || "").trim()).filter(Boolean));
    for (const phone of phones) recipients.push({ to: phone, items: list });
  }

  if (clientId) {
    const { data: client } = await supabase.from("clients")
      .select("whatsapp_group_id, monitor_notify_group, monitor_min_severity")
      .eq("id", clientId).maybeSingle();
    const group = (client?.whatsapp_group_id || "").trim();
    if (client?.monitor_notify_group && group) {
      const min: Severity = client.monitor_min_severity === "warning" ? "warning" : "critical";
      const groupItems = list.filter((i) => SEV_RANK[i.severity] >= SEV_RANK[min]);
      if (groupItems.length) recipients.push({ to: group.includes("@") ? group : `${group}@g.us`, items: groupItems });
    }
  }

  await Promise.all(recipients.map(async (r) => {
    const text = buildMessage(header, r.items);
    const res = await sendEvolution(evo, r.to, text);
    if (res.ok) result.sent++; else result.failed++;
    const logs = r.items.map((i) => ({
      notification_type: logType,
      recipient_phone: r.to,
      message_preview: text.slice(0, 500),
      status: res.ok ? "sent" : "failed",
      error_message: res.error,
      monitor_alert_id: i.alertId,
    }));
    // Uma linha por alerta (para rastrear) — ou uma só se não houver alertas com id.
    const rows = logs.some((l) => l.monitor_alert_id) ? logs : [logs[0]];
    const { error } = await supabase.from("whatsapp_notification_logs").insert(rows);
    if (error) console.error("[monitorAlerts] log", error);
  }));

  return result;
}

/** Evento pontual (ex.: entrada crítica no IML do iLO) — sem estado em monitor_alerts. */
export async function notifyEvent(
  supabase: SupabaseClient,
  src: AlertSource,
  severity: Severity,
  lines: { title: string; message?: string }[],
): Promise<{ sent: number; failed: number }> {
  if (severity === "info" || lines.length === 0) return { sent: 0, failed: 0 };
  return dispatchGrouped(
    supabase,
    src.clientId,
    sourceHeader(src),
    lines.map((l) => ({ alertId: null, severity, title: l.title, message: l.message })),
    `monitor_event_${src.type}`,
  );
}

/** Envia um texto pronto só para os administradores (ex.: resumo diário). */
export async function sendTextToAdmins(
  supabase: SupabaseClient,
  text: string,
  logType: string,
): Promise<{ sent: number; failed: number }> {
  const result = { sent: 0, failed: 0 };
  const evo = await getEvolutionConfig();
  if (!evo.enabled || !evo.baseUrl || !evo.apiKey) return result;
  const { data: roles } = await supabase.from("user_roles").select("user_id").eq("role", "admin");
  const ids = (roles || []).map((r: { user_id: string }) => r.user_id);
  if (!ids.length) return result;
  const { data: profs } = await supabase.from("profiles").select("phone").in("id", ids);
  const phones = [...new Set((profs || []).map((p: { phone: string | null }) => (p.phone || "").trim()).filter(Boolean))];
  await Promise.all(phones.map(async (to) => {
    const res = await sendEvolution(evo, to, text);
    if (res.ok) result.sent++; else result.failed++;
    await supabase.from("whatsapp_notification_logs").insert({
      notification_type: logType, recipient_phone: to, message_preview: text.slice(0, 500),
      status: res.ok ? "sent" : "failed", error_message: res.error,
    });
  }));
  return result;
}
