import { isServiceRole, denied } from "../_shared/caller.ts";
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";
import {
  type AlertLine,
  type AlertSource,
  dispatchGrouped,
  loadMonitorConfig,
  reconcileAlerts,
  sendTextToAdmins,
} from "../_shared/monitorAlerts.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const SOURCES: { type: string; table: string; label: string }[] = [
  { type: "windows", table: "windows_servers", label: "Windows" },
  { type: "linux", table: "linux_servers", label: "Linux" },
  { type: "sqlserver", table: "sql_instances", label: "SQL Server" },
  { type: "vmware", table: "vmware_hosts", label: "VMware" },
  { type: "proxmox", table: "proxmox_nodes", label: "Proxmox" },
  { type: "ilo", table: "ilo_servers", label: "iLO/iDRAC" },
];

function ago(iso: string | null): string {
  if (!iso) return "—";
  const min = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  if (h < 48) return `${h} h${min % 60 ? ` ${min % 60} min` : ""}`;
  return `${Math.floor(h / 24)} dias`;
}

// ---------------------------------------------------------------- watchdog

async function watchdog(supabase: SupabaseClient) {
  const cfg = await loadMonitorConfig(supabase);
  const staleMs = Math.max(1, cfg.stale_minutes) * 60_000;
  const byClient = new Map<string, AlertLine[]>();
  let checked = 0, stale = 0;

  for (const s of SOURCES) {
    const { data, error } = await supabase.from(s.table)
      .select("id, name, client_id, last_polled_at, created_at").eq("is_active", true);
    if (error) { console.error(`[watchdog] ${s.table}`, error.message); continue; }

    for (const row of data || []) {
      checked++;
      const ref = row.last_polled_at || row.created_at;
      const isStale = !!ref && Date.now() - new Date(ref).getTime() > staleMs;
      if (isStale) stale++;
      const src: AlertSource = { type: s.type, id: row.id, name: row.name, clientId: row.client_id };
      const lines = await reconcileAlerts(supabase, src, isStale ? [{
        key: "stale", category: "availability", severity: "critical",
        title: `${s.label} ${row.name}: sem dados há ${ago(ref)}`,
        message: row.last_polled_at
          ? "O coletor parou de enviar dados. Verifique o agente/serviço na rede do cliente."
          : "Cadastrado, mas nenhuma coleta foi recebida ainda.",
      }] : [], { managedPrefixes: ["stale"], silent: true });
      if (lines.length) {
        const k = row.client_id || "";
        byClient.set(k, [...(byClient.get(k) || []), ...lines]);
      }
    }
  }

  // Estações que fazem checagens de rede: se pararem, as checagens também param.
  // (Servidores com agente já entram acima, por windows_servers/linux_servers.)
  const { data: probeOwners } = await supabase.from("network_probes").select("endpoint_id").eq("is_active", true).not("endpoint_id", "is", null);
  const ownerIds = [...new Set((probeOwners || []).map((p: { endpoint_id: string }) => p.endpoint_id))];
  if (ownerIds.length) {
    const { data: eps } = await supabase.from("agent_endpoints")
      .select("id, name, client_id, role, last_seen_at, created_at").in("id", ownerIds).eq("role", "workstation").eq("is_active", true);
    for (const row of eps || []) {
      checked++;
      const ref = row.last_seen_at || row.created_at;
      const isStale = !!ref && Date.now() - new Date(ref).getTime() > Math.max(staleMs, 50 * 60_000);
      if (isStale) stale++;
      const src: AlertSource = { type: "endpoint", id: row.id, name: row.name, clientId: row.client_id };
      const lines = await reconcileAlerts(supabase, src, isStale ? [{
        key: "stale", category: "availability", severity: "warning",
        title: `Agente ${row.name}: sem comunicação há ${ago(ref)}`,
        message: "Esta máquina faz checagens de rede (ping/sites). Enquanto estiver desligada, essas checagens ficam paradas.",
      }] : [], { managedPrefixes: ["stale"], silent: true });
      if (lines.length) {
        const k = row.client_id || "";
        byClient.set(k, [...(byClient.get(k) || []), ...lines]);
      }
    }
  }

  // UMA mensagem por cliente.
  const clientIds = [...byClient.keys()].filter(Boolean);
  const names = new Map<string, string>();
  if (clientIds.length) {
    const { data } = await supabase.from("clients").select("id, full_name").in("id", clientIds);
    (data || []).forEach((c: { id: string; full_name: string }) => names.set(c.id, c.full_name));
  }
  let messages = 0;
  for (const [clientId, lines] of byClient) {
    const header = `📡 Monitoramento — ${names.get(clientId) || "Sem cliente"}`;
    await dispatchGrouped(supabase, clientId || null, header, lines, "monitor_watchdog");
    messages++;
  }
  return { checked, stale, clients_notified: messages };
}

// ---------------------------------------------------------------- digest

async function digest(supabase: SupabaseClient) {
  const cfg = await loadMonitorConfig(supabase);
  if (!cfg.daily_digest) return { skipped: "daily_digest desativado" };

  // Proteção contra disparo duplicado (a função é pública): no máximo 1 por 20 h.
  const { data: last } = await supabase.from("system_settings").select("value").eq("key", "monitor_digest_last_sent").maybeSingle();
  if (last?.value && Date.now() - new Date(last.value).getTime() < 20 * 3_600_000) {
    return { skipped: "resumo já enviado nas últimas 20 h" };
  }

  const out: string[] = ["📊 *Resumo diário do monitoramento*", ""];

  out.push("*Fontes online*");
  for (const s of SOURCES) {
    const { data } = await supabase.from(s.table).select("status").eq("is_active", true);
    const total = data?.length || 0;
    if (!total) continue;
    const online = (data || []).filter((r: { status: string }) => r.status === "online").length;
    out.push(`${online === total ? "🟢" : "🟠"} ${s.label}: ${online}/${total}`);
  }

  const { data: active } = await supabase.from("monitor_alerts")
    .select("source_name, source_type, title, severity, status, category, first_detected_at")
    .in("status", ["active", "acknowledged"]).order("first_detected_at");
  const list = active || [];
  const crit = list.filter((a: any) => a.severity === "critical");
  const warn = list.filter((a: any) => a.severity === "warning");

  const since = new Date(Date.now() - 24 * 3_600_000).toISOString();
  const [{ count: opened }, { count: resolved }] = await Promise.all([
    supabase.from("monitor_alerts").select("id", { count: "exact", head: true }).gte("first_detected_at", since),
    supabase.from("monitor_alerts").select("id", { count: "exact", head: true }).eq("status", "resolved").gte("resolved_at", since),
  ]);

  out.push("", `🔴 Críticos ativos: *${crit.length}*   🟡 Atenção: *${warn.length}*`);
  out.push(`Últimas 24 h: ${opened ?? 0} aberto(s), ${resolved ?? 0} resolvido(s)`);

  if (!list.filter((a: any) => a.severity !== "info").length) {
    out.push("", "✅ Nenhum alerta ativo");
  } else {
    if (crit.length) {
      out.push("", "*Críticos*");
      crit.slice(0, 20).forEach((a: any) =>
        out.push(`${a.status === "acknowledged" ? "✔️" : "🔴"} ${a.source_name}: ${a.title} (há ${ago(a.first_detected_at)})`));
      if (crit.length > 20) out.push(`… e mais ${crit.length - 20}`);
    }
    const backups = list.filter((a: any) => a.category === "backup");
    if (backups.length) {
      out.push("", "*Backups pendentes*");
      backups.slice(0, 15).forEach((a: any) => out.push(`💾 ${a.source_name}: ${a.title}`));
    }
    const disks = list.filter((a: any) => ["disk", "datastore", "storage", "zfs"].includes(a.category));
    if (disks.length) {
      out.push("", "*Disco*");
      disks.slice(0, 15).forEach((a: any) => out.push(`${a.severity === "critical" ? "🔴" : "🟡"} ${a.source_name}: ${a.title}`));
    }
  }

  out.push("", `_${new Date().toLocaleString("pt-BR", { timeZone: "America/Fortaleza" })}_`);
  const res = await sendTextToAdmins(supabase, out.join("\n"), "monitor_digest");
  if (res.sent > 0) {
    await supabase.from("system_settings").upsert(
      { key: "monitor_digest_last_sent", value: new Date().toISOString(), description: "Último resumo diário do monitoramento" },
      { onConflict: "key" },
    );
  }
  return { ...res, critical: crit.length, warning: warn.length };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  // Só o próprio servidor (cron com a service_role) pode chamar.
  if (!isServiceRole(req)) return denied(corsHeaders);
  try {
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const body = await req.json().catch(() => ({}));
    const mode = body?.mode;
    if (mode === "watchdog") return json({ success: true, ...(await watchdog(supabase)) });
    if (mode === "digest") return json({ success: true, ...(await digest(supabase)) });
    return json({ error: "mode deve ser 'watchdog' ou 'digest'" }, 400);
  } catch (err) {
    console.error(err);
    return json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});
