/**
 * Gateway do agente unificado Mororo.Tech (mororo-agent).
 *
 * O agente (servidor ou estação) autentica com `x-monitor-token` (escopo "agent",
 * token vinculado a um cliente) e chama esta função com `{ action, ... }`:
 *
 *  - whoami            → valida o token e devolve o cliente (usado pelo assistente).
 *  - enroll            → cadastra/atualiza a máquina; servidores ganham uma linha em
 *                        windows_servers/linux_servers para usar os alertas existentes.
 *  - config            → configuração da máquina, checagens de rede e dados da área de trabalho.
 *  - report            → métricas, inventário (hardware/software) e resultado das checagens.
 *  - discovery         → resultado da varredura de rede feita no assistente.
 *  - register-devices  → equipamentos marcados no assistente (Proxmox, VMware, iLO/iDRAC,
 *                        SQL Server e checagens de ping/porta/HTTP).
 *
 * As métricas de servidor e dos equipamentos continuam entrando por server-monitor-ingest.
 */
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";
import {
  type AlertCondition,
  type AlertSource,
  authenticateAgent,
  effectiveThresholds,
  loadMonitorConfig,
  pctCondition,
  reconcileAlerts,
} from "../_shared/monitorAlerts.ts";
import { AGENT_VERSIONS, isOutdated } from "../_shared/agentVersions.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-monitor-token",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const str = (v: unknown, max = 500): string | null => {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s ? s.substring(0, max) : null;
};
const bool = (v: unknown): boolean | null => (typeof v === "boolean" ? v : null);
const arr = (v: unknown, max = 200): any[] => (Array.isArray(v) ? v.slice(0, max) : []);
const r1 = (v: number) => Math.round(v * 10) / 10;
/** Escapa % e _ para usar ilike como comparação exata sem diferenciar maiúsculas. */
const likeExact = (s: string) => s.replace(/[\\%_]/g, (c) => "\\" + c);

type Ctx = { supabase: SupabaseClient; body: any; clientId: string };

const ENDPOINT_COLS =
  "id, client_id, name, hostname, role, settings, thresholds, windows_server_id, linux_server_id, equipment_id, is_active";

async function loadEndpoint(ctx: Ctx) {
  const id = str(ctx.body.endpoint_id, 64);
  if (!id) return null;
  const { data } = await ctx.supabase.from("agent_endpoints").select(ENDPOINT_COLS)
    .eq("id", id).eq("client_id", ctx.clientId).maybeSingle();
  return data;
}

// ---------------------------------------------------------------- whoami

async function whoami(ctx: Ctx) {
  const { data: client } = await ctx.supabase.from("clients").select("id, full_name").eq("id", ctx.clientId).maybeSingle();
  if (!client) return json({ error: "Cliente do token não encontrado" }, 404);
  return json({
    success: true,
    client: { id: client.id, name: client.full_name },
    latest_version: AGENT_VERSIONS["mororo-agent"]?.version ?? null,
  });
}

// ---------------------------------------------------------------- enroll

/** Garante a linha em windows_servers/linux_servers de um servidor com agente. */
async function linkServerRow(ctx: Ctx, ep: { id: string; name: string; hostname: string | null }, family: string) {
  const table = family === "windows" ? "windows_servers" : "linux_servers";
  const hostname = ep.hostname || ep.name;

  // 1) já vinculado a este endpoint
  const { data: linked } = await ctx.supabase.from(table).select("id, is_active")
    .eq("client_id", ctx.clientId).eq("collector_endpoint_id", ep.id).limit(1).maybeSingle();
  if (linked && !linked.is_active) await ctx.supabase.from(table).update({ is_active: true }).eq("id", linked.id);
  let row: { id: string } | null = linked;
  // 2) cadastrado antes (coletor avulso ou agente bash) com o mesmo nome/host: assume
  if (!row) {
    const col = table === "linux_servers" ? "hostname" : "host";
    const { data: same } = await ctx.supabase.from(table).select("id")
      .eq("client_id", ctx.clientId).ilike(col, likeExact(hostname)).limit(1).maybeSingle();
    if (same) {
      await ctx.supabase.from(table).update({ collector_endpoint_id: ep.id, is_active: true }).eq("id", same.id);
      row = same;
    }
  }
  // 3) novo
  if (!row) {
    const insert: Record<string, unknown> = {
      client_id: ctx.clientId, name: ep.name, host: hostname, collector_endpoint_id: ep.id,
    };
    if (table === "linux_servers") insert.hostname = hostname;
    const { data: created, error } = await ctx.supabase.from(table).insert(insert).select("id").single();
    if (error) throw error;
    row = created;
  }
  return row!.id as string;
}

async function enroll(ctx: Ctx) {
  const b = ctx.body;
  const machineId = str(b.machine_id, 128);
  const hostname = str(b.hostname, 128);
  if (!machineId || !hostname) return json({ error: "machine_id e hostname são obrigatórios" }, 400);
  const role = b.role === "server" ? "server" : "workstation";
  const family = String(b.os_family || "").toLowerCase() === "windows" ? "windows" : "linux";

  const { data: existing } = await ctx.supabase.from("agent_endpoints").select("id, name, settings")
    .eq("client_id", ctx.clientId).eq("machine_id", machineId).maybeSingle();

  const record: Record<string, unknown> = {
    client_id: ctx.clientId, machine_id: machineId, hostname, role, is_active: true,
    os_family: family, os_name: str(b.os_name), os_version: str(b.os_version), arch: str(b.arch, 32),
    agent_version: str(b.agent_version, 32), last_seen_at: new Date().toISOString(), status: "online",
  };
  if (!existing) record.name = str(b.name, 128) || hostname;
  else if (str(b.name, 128)) record.name = str(b.name, 128);
  if (b.settings && typeof b.settings === "object") {
    record.settings = { ...(existing?.settings as object || {}), ...b.settings };
  }

  const { data: ep, error } = await ctx.supabase.from("agent_endpoints")
    .upsert(record, { onConflict: "client_id,machine_id" })
    .select("id, name, hostname, role").single();
  if (error) throw error;

  const links: Record<string, string | null> = { windows_server_id: null, linux_server_id: null };
  if (role === "workstation") {
    const { data: prevLinks } = await ctx.supabase.from("agent_endpoints").select("id, windows_server_id, linux_server_id").eq("id", ep.id).maybeSingle();
    if (prevLinks) await unlinkServerRows(ctx, prevLinks);
  }
  if (role === "server") {
    const id = await linkServerRow(ctx, ep, family);
    links[family === "windows" ? "windows_server_id" : "linux_server_id"] = id;
  }
  await ctx.supabase.from("agent_endpoints").update(links).eq("id", ep.id);

  return json({ success: true, endpoint_id: ep.id, ...links, config: await buildConfig(ctx, ep.id) });
}

// ---------------------------------------------------------------- config

const DEFAULT_DESKTOP = {
  enabled: true,
  company: "Mororo.Tech",
  phone: "",
  message: "Suporte de TI",
  position: "bottom-right",
};

async function buildConfig(ctx: Ctx, endpointId: string) {
  const { data: ep } = await ctx.supabase.from("agent_endpoints").select(ENDPOINT_COLS).eq("id", endpointId).maybeSingle();
  if (!ep) return null;
  const { data: client } = await ctx.supabase.from("clients").select("full_name").eq("id", ctx.clientId).maybeSingle();

  let globalDesktop: Record<string, unknown> = {};
  const { data: ds } = await ctx.supabase.from("system_settings").select("value").eq("key", "agent_desktop_info").maybeSingle();
  if (ds?.value) {
    try { globalDesktop = typeof ds.value === "string" ? JSON.parse(ds.value) : ds.value; } catch { /* padrão */ }
  }
  const settings = (ep.settings || {}) as Record<string, any>;
  const isServer = ep.role === "server";

  const { data: probes } = await ctx.supabase.from("network_probes")
    .select("id, name, kind, target, port, expected_status, keyword, interval_seconds")
    .eq("endpoint_id", endpointId).eq("is_active", true);

  // Quais tipos de equipamento este agente coleta (evita chamadas de lista à toa).
  const collect: Record<string, boolean> = {};
  for (const [k, table] of [["proxmox", "proxmox_nodes"], ["vmware", "vmware_hosts"], ["ilo", "ilo_servers"], ["sqlserver", "sql_instances"]]) {
    const { count } = await ctx.supabase.from(table).select("id", { count: "exact", head: true })
      .eq("collector_endpoint_id", endpointId).eq("is_active", true);
    collect[k] = (count ?? 0) > 0;
  }

  return {
    endpoint_id: ep.id,
    name: ep.name,
    role: ep.role,
    client_name: client?.full_name ?? null,
    windows_server_id: ep.windows_server_id,
    linux_server_id: ep.linux_server_id,
    metrics_interval_seconds: Number(settings.metrics_interval_seconds) || (isServer ? 300 : 900),
    inventory_interval_hours: Number(settings.inventory_interval_hours) || 12,
    devices_interval_seconds: Number(settings.devices_interval_seconds) || 300,
    services: Array.isArray(settings.services) ? settings.services : [],
    desktop: { ...DEFAULT_DESKTOP, ...globalDesktop, ...(settings.desktop || {}), client: client?.full_name ?? null },
    probes: probes || [],
    collect,
    latest_version: AGENT_VERSIONS["mororo-agent"]?.version ?? null,
  };
}

async function config(ctx: Ctx) {
  const ep = await loadEndpoint(ctx);
  if (!ep) return json({ error: "Endpoint não encontrado (refaça o cadastro)" }, 404);
  // Virou servidor pelo painel: cria o vínculo com windows_servers/linux_servers.
  if (ep.role === "server" && !ep.windows_server_id && !ep.linux_server_id) {
    const { data: full } = await ctx.supabase.from("agent_endpoints").select("os_family").eq("id", ep.id).maybeSingle();
    const family = full?.os_family === "windows" ? "windows" : "linux";
    const id = await linkServerRow(ctx, ep, family);
    await ctx.supabase.from("agent_endpoints").update({ [family === "windows" ? "windows_server_id" : "linux_server_id"]: id }).eq("id", ep.id);
  }
  if (ep.role === "workstation" && (ep.windows_server_id || ep.linux_server_id)) await unlinkServerRows(ctx, ep);
  return json({ success: true, config: await buildConfig(ctx, ep.id) });
}

/** Deixou de ser servidor: desativa a linha de servidor para não gerar alerta de "sem dados". */
async function unlinkServerRows(ctx: Ctx, ep: { id: string; windows_server_id: string | null; linux_server_id: string | null }) {
  if (ep.windows_server_id) await ctx.supabase.from("windows_servers").update({ is_active: false }).eq("id", ep.windows_server_id).eq("collector_endpoint_id", ep.id);
  if (ep.linux_server_id) await ctx.supabase.from("linux_servers").update({ is_active: false }).eq("id", ep.linux_server_id).eq("collector_endpoint_id", ep.id);
  await ctx.supabase.from("agent_endpoints").update({ windows_server_id: null, linux_server_id: null }).eq("id", ep.id);
}

// ---------------------------------------------------------------- report

const GENERIC_SERIALS = /^(to be filled|default string|system serial number|none|n\/a|0+|123456789|not specified|chassis serial number)/i;

async function syncEquipment(ctx: Ctx, ep: any, inv: any, disks: any[]) {
  const serial = str(inv.serial_number, 128);
  const validSerial = serial && !GENERIC_SERIALS.test(serial) ? serial : null;
  let equipmentId: string | null = ep.equipment_id;

  if (!equipmentId && validSerial) {
    const { data } = await ctx.supabase.from("equipment_inventory").select("id")
      .eq("client_id", ctx.clientId).eq("serial_number", validSerial).limit(1).maybeSingle();
    equipmentId = data?.id ?? null;
  }
  if (!equipmentId) {
    const { data } = await ctx.supabase.from("equipment_inventory").select("id")
      .eq("client_id", ctx.clientId).ilike("name", likeExact(ep.hostname || ep.name)).limit(1).maybeSingle();
    equipmentId = data?.id ?? null;
  }

  const totals = disks.reduce((a, d) => {
    a.total += num(d.total_gb) ?? 0; a.used += num(d.used_gb) ?? 0; a.free += num(d.free_gb) ?? 0; return a;
  }, { total: 0, used: 0, free: 0 });
  const record: Record<string, unknown> = {
    name: ep.name, client_id: ctx.clientId, brand: str(inv.manufacturer), model: str(inv.model),
    cpu: str(inv.cpu_model), ram_total_gb: num(inv.ram_total_gb),
    disk_total_gb: totals.total ? r1(totals.total) : null, disk_used_gb: totals.total ? r1(totals.used) : null,
    disk_free_gb: totals.total ? r1(totals.free) : null,
    logged_in_user: str(inv.logged_user), hardware_updated_at: new Date().toISOString(),
  };
  if (validSerial) record.serial_number = validSerial;

  if (equipmentId) {
    await ctx.supabase.from("equipment_inventory").update(record).eq("id", equipmentId);
  } else {
    const { data: types } = await ctx.supabase.from("equipment_types").select("id, name");
    const want = ep.role === "server" ? /servidor|server/i : inv.is_laptop ? /notebook|laptop/i : /computador|desktop|pc|esta[cç][aã]o/i;
    const type = (types || []).find((t: { name: string }) => want.test(t.name));
    const { data: created, error } = await ctx.supabase.from("equipment_inventory")
      .insert({ ...record, status: "active", equipment_type_id: type?.id ?? null, notes: "Cadastrado pelo mororo-agent" })
      .select("id").single();
    if (error) { console.error("[endpoint-agent] equipment insert", error.message); return null; }
    equipmentId = created.id;
  }

  if (disks.length) {
    await ctx.supabase.from("equipment_disks").delete().eq("equipment_id", equipmentId);
    await ctx.supabase.from("equipment_disks").insert(disks.slice(0, 30).map((d) => ({
      equipment_id: equipmentId, drive_letter: str(d.mount ?? d.drive, 64), label: str(d.label, 128),
      disk_total_gb: num(d.total_gb), disk_used_gb: num(d.used_gb), disk_free_gb: num(d.free_gb), file_system: str(d.fstype, 32),
    })));
  }
  return equipmentId;
}

async function processProbes(ctx: Ctx, results: any[]) {
  if (!results.length) return 0;
  const ids = results.map((r) => str(r.id, 64)).filter(Boolean) as string[];
  const { data: probes } = await ctx.supabase.from("network_probes")
    .select("id, name, kind, target, port, status, consecutive_failures, failures_before_alert, ssl_warn_days, severity, client_id")
    .in("id", ids).eq("client_id", ctx.clientId);
  const now = new Date().toISOString();
  let alerts = 0;

  for (const p of probes || []) {
    const r = results.find((x) => x.id === p.id);
    if (!r) continue;
    const up = r.status === "up";
    const fails = up ? 0 : (p.consecutive_failures || 0) + 1;
    const sslExp = str(r.ssl_expires_at, 40);
    const status = up ? (r.degraded ? "warning" : "online") : (fails >= p.failures_before_alert ? "offline" : p.status === "unknown" ? "warning" : p.status);
    await ctx.supabase.from("network_probes").update({
      status, consecutive_failures: fails, latency_ms: num(r.latency_ms), packet_loss_pct: num(r.packet_loss_pct),
      http_status: num(r.http_status), ssl_expires_at: sslExp, last_polled_at: now, last_error: up ? null : str(r.error),
      ...(status !== p.status ? { last_change_at: now } : {}),
    }).eq("id", p.id);

    const where = p.kind === "http" ? p.target : `${p.target}${p.port ? `:${p.port}` : ""}`;
    const src: AlertSource = { type: "probe", id: p.id, name: `${p.name} (${where})`, clientId: p.client_id };
    const conditions: AlertCondition[] = [];
    if (!up) {
      conditions.push({
        key: "down", category: "availability", severity: p.severity === "warning" ? "warning" : "critical",
        title: p.kind === "ping" ? "Sem resposta ao ping" : p.kind === "tcp" ? `Porta ${p.port} fechada` : "Site/serviço fora do ar",
        message: str(r.error, 200) ?? undefined, sustain: Math.max(1, p.failures_before_alert || 1),
      });
    }
    if (sslExp) {
      const days = (new Date(sslExp).getTime() - Date.now()) / 86_400_000;
      if (days <= (p.ssl_warn_days || 15)) {
        conditions.push({
          key: "ssl", category: "certificate", severity: days <= 3 ? "critical" : "warning",
          title: days < 0 ? "Certificado SSL vencido" : `Certificado SSL vence em ${Math.max(0, Math.floor(days))} dia(s)`,
          message: `Validade: ${new Date(sslExp).toLocaleDateString("pt-BR")}`,
        });
      }
    }
    if (up && r.degraded && r.error) {
      conditions.push({ key: "degraded", category: "availability", severity: "warning", title: "Resposta inesperada", message: str(r.error, 200) ?? undefined, sustain: 3 });
    }
    alerts += (await reconcileAlerts(ctx.supabase, src, conditions)).length;
  }
  return alerts;
}

async function report(ctx: Ctx) {
  const ep = await loadEndpoint(ctx);
  if (!ep) return json({ error: "Endpoint não encontrado (refaça o cadastro)" }, 404);
  const b = ctx.body;
  const m = b.metrics || {};
  const now = new Date().toISOString();
  const disks = arr(m.disks, 50);
  const maxDisk = disks.map((d) => num(d.usage_pct)).filter((v): v is number => v !== null).reduce((a, v) => Math.max(a, v), -1);

  const update: Record<string, unknown> = {
    last_seen_at: now, status: "online", last_error: str(b.last_error),
    agent_version: str(b.agent_version, 32) ?? undefined,
  };
  if (b.metrics) {
    Object.assign(update, {
      cpu_usage_pct: num(m.cpu_usage_pct), ram_usage_pct: num(m.ram_usage_pct),
      disk_usage_pct: maxDisk >= 0 ? r1(maxDisk) : null, disks,
      top_processes: arr(m.top_processes, 20), pending_reboot: bool(m.pending_reboot),
      uptime_seconds: num(m.uptime_seconds), last_boot_time: str(m.last_boot_time, 40),
      logged_user: str(m.logged_user, 128), ip_addresses: arr(m.ip_addresses, 20),
      remote_access_id: str(m.remote_access_id, 64),
    });
    if (Array.isArray(m.antivirus)) update.antivirus = arr(m.antivirus, 10);
    if (Array.isArray(m.physical_disks)) update.physical_disks = arr(m.physical_disks, 30);
  }

  const inv = b.inventory;
  if (inv && typeof inv === "object") {
    Object.assign(update, {
      manufacturer: str(inv.manufacturer, 128), model: str(inv.model, 128), serial_number: str(inv.serial_number, 128),
      bios_version: str(inv.bios_version, 128), cpu_model: str(inv.cpu_model, 200), cpu_cores: num(inv.cpu_cores),
      ram_total_gb: num(inv.ram_total_gb), domain: str(inv.domain, 128), os_name: str(inv.os_name, 200) ?? undefined,
      os_version: str(inv.os_version, 100) ?? undefined, mac_addresses: arr(inv.mac_addresses, 20),
      inventory_updated_at: now,
    });
    const software = arr(inv.software, 3000).filter((s) => s && s.name);
    if (Array.isArray(inv.software)) {
      update.software_count = software.length;
      await ctx.supabase.from("agent_software").delete().eq("endpoint_id", ep.id);
      for (let i = 0; i < software.length; i += 500) {
        const { error } = await ctx.supabase.from("agent_software").insert(software.slice(i, i + 500).map((s) => ({
          endpoint_id: ep.id, name: str(s.name, 300)!, version: str(s.version, 100),
          publisher: str(s.publisher, 200), install_date: str(s.install_date, 20),
        })));
        if (error) console.error("[endpoint-agent] software insert", error.message);
      }
    }
    const equipmentId = await syncEquipment(ctx, ep, { ...inv, logged_user: m.logged_user }, disks);
    if (equipmentId) update.equipment_id = equipmentId;
  }

  for (const k of Object.keys(update)) if (update[k] === undefined) delete update[k];
  const { error } = await ctx.supabase.from("agent_endpoints").update(update).eq("id", ep.id);
  if (error) throw error;

  // Alertas de estação. Servidores já recebem os alertas completos pelo server-monitor-ingest.
  let alerts = 0;
  if (b.metrics && ep.role === "workstation") {
    const cfg = await loadMonitorConfig(ctx.supabase);
    const th = effectiveThresholds(cfg, ep.thresholds);
    const src: AlertSource = { type: "endpoint", id: ep.id, name: ep.name, clientId: ctx.clientId };
    const conditions: AlertCondition[] = [];
    for (const d of disks) {
      const name = String(d.mount ?? d.drive ?? "?");
      // Estações: só o limite crítico gera alerta.
      const c = pctCondition(`disk:${name}`, "disk", `Disco ${name}`, num(d.usage_pct), { warn: th.disk.crit, crit: Math.max(th.disk.crit, 97), sustain: 2 },
        num(d.free_gb) !== null ? { message: `Livre: ${r1(Number(d.free_gb))} GB` } : undefined);
      if (c) conditions.push(c);
    }
    for (const pd of arr(m.physical_disks, 30)) {
      if (pd?.predict_failure === true || String(pd?.health || "").toLowerCase() === "unhealthy") {
        conditions.push({
          key: `smart:${pd.name || pd.serial || "disco"}`, category: "smart", severity: "critical",
          title: `Disco ${pd.model || pd.name || ""} com previsão de falha`.replace(/\s+/g, " "),
          message: "Faça backup dos dados do usuário e planeje a troca do disco.",
        });
      }
    }
    const avList = arr(m.antivirus, 10);
    if (avList.length && !avList.some((a) => a?.enabled === true)) {
      conditions.push({ key: "antivirus", category: "security", severity: "warning", title: "Antivírus desativado", message: avList.map((a) => a?.name).filter(Boolean).join(", "), sustain: 2 });
    } else if (avList.length && avList.every((a) => a?.enabled === true && a?.up_to_date === false)) {
      conditions.push({ key: "antivirus", category: "security", severity: "warning", title: "Antivírus desatualizado", message: avList.map((a) => a?.name).filter(Boolean).join(", "), sustain: 4 });
    }
    alerts += (await reconcileAlerts(ctx.supabase, src, conditions, { managedPrefixes: ["disk:", "smart:", "antivirus"] })).length;
  }

  alerts += await processProbes(ctx, arr(b.probes, 500));

  const latest = AGENT_VERSIONS["mororo-agent"]?.version ?? null;
  return json({
    success: true, alerts,
    latest_version: latest,
    outdated: latest ? isOutdated(str(b.agent_version, 32), latest) : false,
  });
}

// ---------------------------------------------------------------- discovery

async function discovery(ctx: Ctx) {
  const ep = await loadEndpoint(ctx);
  const devices = arr(ctx.body.devices, 2048).filter((d) => str(d?.ip, 64));
  if (!devices.length) return json({ success: true, saved: 0 });
  const now = new Date().toISOString();
  const rows = devices.map((d) => ({
    client_id: ctx.clientId, endpoint_id: ep?.id ?? null, ip: str(d.ip, 64)!, mac: str(d.mac, 32), hostname: str(d.hostname, 200),
    vendor: str(d.vendor, 120), device_type: str(d.device_type, 40), open_ports: arr(d.open_ports, 50),
    details: d.details && typeof d.details === "object" ? d.details : null, last_seen_at: now,
  }));
  const { error } = await ctx.supabase.from("network_discoveries").upsert(rows, { onConflict: "client_id,ip" });
  if (error) throw error;
  return json({ success: true, saved: rows.length });
}

// ---------------------------------------------------------------- register-devices

async function upsertByHost(ctx: Ctx, table: string, hostCol: string, host: string, record: Record<string, unknown>) {
  const { data: same } = await ctx.supabase.from(table).select("id").eq("client_id", ctx.clientId).ilike(hostCol, likeExact(host)).limit(1).maybeSingle();
  if (same) {
    const { error } = await ctx.supabase.from(table).update(record).eq("id", same.id);
    if (error) throw error;
    return { id: same.id, created: false };
  }
  const { data, error } = await ctx.supabase.from(table).insert({ ...record, client_id: ctx.clientId }).select("id").single();
  if (error) throw error;
  return { id: data.id, created: true };
}

const PROBE_KINDS = new Set(["ping", "tcp", "http"]);

async function registerDevices(ctx: Ctx) {
  const ep = await loadEndpoint(ctx);
  if (!ep) return json({ error: "Endpoint não encontrado (refaça o cadastro)" }, 404);
  const results: { name: string; kind: string; ok: boolean; id?: string; created?: boolean; error?: string }[] = [];

  for (const d of arr(ctx.body.devices, 300)) {
    const kind = String(d?.kind || "");
    const name = str(d?.name, 128) || str(d?.host, 128) || kind;
    const host = str(d?.host, 255);
    try {
      let r: { id: string; created: boolean };
      const base = { name, is_active: true, collector_endpoint_id: ep.id };
      switch (kind) {
        case "proxmox": {
          if (!host) throw new Error("host obrigatório");
          r = await upsertByHost(ctx, "proxmox_nodes", "host", host, {
            ...base, host, port: num(d.port) ?? 8006, node_name: str(d.node_name, 64),
            auth_mode: d.token_secret ? "token" : "password", username: str(d.username, 128) || "root@pam",
            token_name: str(d.token_name, 128), token_secret: str(d.token_secret, 256), password: str(d.password, 256),
          });
          break;
        }
        case "vmware": {
          if (!host || !d.username) throw new Error("host e usuário obrigatórios");
          r = await upsertByHost(ctx, "vmware_hosts", "host", host, {
            ...base, host, port: num(d.port) ?? 22, username: str(d.username, 128), password: str(d.password, 256) ?? "",
          });
          break;
        }
        case "ilo":
        case "idrac": {
          if (!host || !d.username) throw new Error("host e usuário obrigatórios");
          r = await upsertByHost(ctx, "ilo_servers", "host", host, {
            ...base, host, port: num(d.port) ?? 443, username: str(d.username, 128), password: str(d.password, 256) ?? "",
            vendor: kind === "idrac" ? "dell" : "hp",
          });
          break;
        }
        case "sqlserver": {
          const instance = str(d.instance, 255) || host;
          if (!instance) throw new Error("instância obrigatória");
          r = await upsertByHost(ctx, "sql_instances", "instance", instance, {
            ...base, instance, auth_mode: d.auth_mode === "sql" ? "sql" : "windows",
            username: str(d.username, 128), password: str(d.password, 256), windows_server_id: ep.windows_server_id,
          });
          break;
        }
        default: {
          const pk = String(d?.probe_kind || kind);
          if (!PROBE_KINDS.has(pk)) throw new Error(`tipo desconhecido: ${kind}`);
          const target = str(d.target, 500) || host;
          if (!target) throw new Error("alvo obrigatório");
          const port = pk === "tcp" ? num(d.port) : null;
          const { data: same } = await ctx.supabase.from("network_probes").select("id")
            .eq("client_id", ctx.clientId).eq("kind", pk).eq("target", target).limit(1).maybeSingle();
          const record = {
            name, kind: pk, target, port, endpoint_id: ep.id, is_active: true,
            device_type: str(d.device_type, 40) || "other", expected_status: num(d.expected_status), keyword: str(d.keyword, 200),
            interval_seconds: Math.max(30, num(d.interval_seconds) ?? 60),
            severity: d.severity === "warning" ? "warning" : "critical",
          };
          if (same && (pk !== "tcp" || port !== null)) {
            await ctx.supabase.from("network_probes").update(record).eq("id", same.id);
            r = { id: same.id, created: false };
          } else {
            const { data, error } = await ctx.supabase.from("network_probes").insert({ ...record, client_id: ctx.clientId }).select("id").single();
            if (error) throw error;
            r = { id: data.id, created: true };
          }
        }
      }
      results.push({ name, kind, ok: true, ...r });
    } catch (e) {
      results.push({ name, kind, ok: false, error: e instanceof Error ? e.message : String(e) });
    }
  }
  return json({ success: true, results, config: await buildConfig(ctx, ep.id) });
}

// ---------------------------------------------------------------- servidor

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const body = await req.json().catch(() => null);
    if (!body || typeof body.action !== "string") return json({ error: "action obrigatório" }, 400);

    const auth = await authenticateAgent(req, supabase, "agent", { requireToken: true });
    if (!auth.ok) return json({ error: auth.error }, auth.status);
    if (!auth.clientId) return json({ error: "O token do agente precisa estar vinculado a um cliente" }, 403);

    const ctx: Ctx = { supabase, body, clientId: auth.clientId };
    switch (body.action) {
      case "whoami": return await whoami(ctx);
      case "enroll": return await enroll(ctx);
      case "config": return await config(ctx);
      case "report": return await report(ctx);
      case "discovery": return await discovery(ctx);
      case "register-devices": return await registerDevices(ctx);
      default: return json({ error: "action desconhecida" }, 400);
    }
  } catch (err) {
    console.error(err);
    return json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});
