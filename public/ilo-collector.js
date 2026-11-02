#!/usr/bin/env node
/**
 * Coletor de Monitoramento — Servidores HP com iLO4 (Redfish REST API)
 * =====================================================================
 *
 * Roda em UMA máquina/VPS com acesso à rede de gerenciamento dos iLOs e coleta,
 * de todos os servidores cadastrados no painel:
 *
 *   - Temperaturas (CPU, memória, discos, ambiente)
 *   - Ventiladores (RPM / % e estado)
 *   - Fontes de alimentação (estado, potência, voltagem)
 *   - Discos / controladoras (SmartStorage: RAID e SMART)
 *   - Eventos de hardware (IML — Integrated Management Log)
 *   - Informações do sistema (modelo, serial, versão do iLO e da BIOS)
 *
 * Segurança:
 *   - Comunicação sempre por HTTPS (porta 443 por padrão).
 *   - Autenticação Basic com usuário dedicado do iLO (recomenda-se um usuário
 *     somente-leitura, com permissão de "Login" apenas).
 *   - Certificados autoassinados do iLO são comuns; use --inseguro somente em
 *     rede de gerenciamento confiável.
 *
 * Uso:
 *   node ilo-collector.js --url <SUPABASE_URL> --key <ANON_KEY> [opções]
 *
 * Opções:
 *   --intervalo <seg>   Intervalo entre coletas (padrão: 300)
 *   --uma-vez           Executa apenas um ciclo e encerra (ideal p/ cron)
 *   --inseguro          Aceita certificado autoassinado do iLO (padrão: sim)
 *   --seguro            Exige certificado válido
 *
 * Agendamento (cron, a cada 5 minutos):
 *   ​*​/5 * * * * /usr/bin/node /opt/ilo/ilo-collector.js --url ... --key ... --uma-vez
 */

"use strict";

const https = require("https");
const { URL } = require("url");

// ---------------------------------------------------------------- Configuração

function parseArgs(argv) {
  const args = { intervalo: 300, umaVez: false, inseguro: true };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--url") args.url = argv[++i];
    else if (a === "--key") args.key = argv[++i];
    else if (a === "--token") args.token = argv[++i];
    else if (a === "--intervalo") args.intervalo = Number(argv[++i]) || 300;
    else if (a === "--uma-vez" || a === "--once") args.umaVez = true;
    else if (a === "--inseguro") args.inseguro = true;
    else if (a === "--seguro") args.inseguro = false;
  }
  args.url = args.url || process.env.SUPABASE_URL;
  args.key = args.key || process.env.SUPABASE_ANON_KEY;
  args.token = args.token || process.env.MONITOR_TOKEN;
  return args;
}

const CONFIG = parseArgs(process.argv);

if (!CONFIG.url || !(CONFIG.key || CONFIG.token)) {
  console.error("ERRO: informe --url <SUPABASE_URL> e --token <MONITOR_TOKEN> (ou --key <ANON_KEY>).");
  process.exit(1);
}

const INGEST_URL = `${CONFIG.url.replace(/\/+$/, "")}/functions/v1/server-monitor-ingest`;
const TIMEOUT_MS = 20000;
const HEARTBEAT_URL = `${CONFIG.url.replace(/\/+$/, "")}/functions/v1/agent-heartbeat`;
// Versao deste coletor. Mantenha igual a src/lib/agentVersions.ts.
const AGENT_VERSION = "1.2.0";

/** Headers de autenticação: x-monitor-token (preferido) e, se informada, a chave pública. */
function authHeaders() {
  const h = {};
  if (CONFIG.token) h["x-monitor-token"] = CONFIG.token;
  if (CONFIG.key) { h.apikey = CONFIG.key; h.Authorization = `Bearer ${CONFIG.key}`; }
  return h;
}

function log(nivel, msg) {
  const ts = new Date().toISOString();
  console.log(`[${ts}] [${nivel}] ${msg}`);
}

// ------------------------------------------------------------------- HTTP util

/** POST JSON para a Edge Function de ingestão. */
function postIngest(payload, url = INGEST_URL) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(payload);
    const u = new URL(url);
    const req = https.request(
      {
        hostname: u.hostname,
        port: u.port || 443,
        path: u.pathname,
        method: "POST",
        timeout: TIMEOUT_MS,
        headers: {
          "Content-Type": "application/json",
          ...authHeaders(),
          "Content-Length": Buffer.byteLength(body),
        },
      },
      (res) => {
        let data = "";
        res.on("data", (c) => (data += c));
        res.on("end", () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            try {
              resolve(JSON.parse(data || "{}"));
            } catch {
              resolve({});
            }
          } else {
            reject(new Error(`Ingest HTTP ${res.statusCode}: ${data.substring(0, 300)}`));
          }
        });
      },
    );
    req.on("timeout", () => req.destroy(new Error("timeout na ingestão")));
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

/** GET Redfish autenticado no iLO. */
function redfishGet(server, path) {
  return new Promise((resolve, reject) => {
    const auth = Buffer.from(`${server.username}:${server.password}`).toString("base64");
    const req = https.request(
      {
        host: server.host,
        port: server.port || 443,
        path,
        method: "GET",
        timeout: TIMEOUT_MS,
        rejectUnauthorized: !CONFIG.inseguro,
        headers: { Authorization: `Basic ${auth}`, Accept: "application/json" },
      },
      (res) => {
        let data = "";
        res.on("data", (c) => (data += c));
        res.on("end", () => {
          if (res.statusCode === 401) return reject(new Error("Credenciais do iLO inválidas (401)"));
          if (res.statusCode >= 400) return reject(new Error(`Redfish HTTP ${res.statusCode} em ${path}`));
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject(new Error(`Resposta inválida em ${path}: ${e.message}`));
          }
        });
      },
    );
    req.on("timeout", () => req.destroy(new Error(`timeout em ${path}`)));
    req.on("error", reject);
    req.end();
  });
}

/** GET tolerante: devolve null em vez de lançar (recursos opcionais do iLO). */
async function redfishTry(server, path) {
  try {
    return await redfishGet(server, path);
  } catch (err) {
    log("DEBUG", `${server.name}: ${path} indisponível — ${err.message}`);
    return null;
  }
}

// -------------------------------------------------------------- Normalizadores

/** Converte a saúde Redfish (OK/Warning/Critical) para texto padronizado. */
function health(obj) {
  const h = obj?.Status?.Health || obj?.Status?.HealthRollup || obj?.Health;
  if (!h) return null;
  return String(h);
}

function severityFromIml(entry) {
  const s = String(entry.Severity || entry.Oem?.Hp?.Severity || "").toLowerCase();
  if (s.includes("critical") || s.includes("fatal")) return "critical";
  if (s.includes("warning") || s.includes("caution")) return "warning";
  return "info";
}

function toC(reading, unit) {
  // iLO4 pode reportar em Fahrenheit dependendo da configuração do usuário.
  if (unit && String(unit).toLowerCase().startsWith("f") && reading != null) {
    return Math.round(((reading - 32) * 5) / 9);
  }
  return reading;
}

// -------------------------------------------------------------------- Coletores

async function coletarSistema(server) {
  const sys = await redfishGet(server, "/redfish/v1/Systems/1/");
  const mgr = await redfishTry(server, "/redfish/v1/Managers/1/");

  const oemHp = sys.Oem?.Hp || sys.Oem?.Hpe || {};
  const mgrOem = mgr?.Oem?.Hp || mgr?.Oem?.Hpe || {};

  const cpuSummary = sys.ProcessorSummary || {};
  const memSummary = sys.MemorySummary || {};

  const info = {
    server_model: sys.Model || null,
    serial_number: sys.SerialNumber || null,
    bios_version: sys.BiosVersion || null,
    ilo_version: mgr?.Model || mgrOem.Type || "iLO 4",
    ilo_firmware: mgr?.FirmwareVersion || mgrOem.FirmwareVersion?.Current?.VersionString || null,
    cpu_model: cpuSummary.Model || null,
    cpu_count: cpuSummary.Count ?? null,
    ram_total_gb: memSummary.TotalSystemMemoryGiB ?? null,
    power_state: sys.PowerState || null,
    post_state: oemHp.PostState || null,
    indicator_led: sys.IndicatorLED || null,
    health_summary: health(sys),
  };

  const healthObj = {
    health_processor: health({ Status: cpuSummary.Status }),
    health_memory: health({ Status: memSummary.Status }),
    health_storage: oemHp.AggregateHealthStatus?.Storage?.Status?.Health || null,
    health_fans: oemHp.AggregateHealthStatus?.Fans?.Status?.Health || null,
    health_power: oemHp.AggregateHealthStatus?.PowerSupplies?.Status?.Health || null,
    health_temperature: oemHp.AggregateHealthStatus?.Temperatures?.Status?.Health || null,
    health_network: oemHp.AggregateHealthStatus?.Network?.Status?.Health || null,
  };

  return { info, health: healthObj };
}

async function coletarTermicoEEnergia(server) {
  const sensores = [];

  const thermal = await redfishTry(server, "/redfish/v1/Chassis/1/Thermal/");
  for (const t of thermal?.Temperatures || []) {
    if (t.ReadingCelsius == null && t.CurrentReading == null) continue;
    const raw = t.ReadingCelsius ?? t.CurrentReading;
    sensores.push({
      sensor_type: "temperature",
      name: t.Name || `Sensor ${t.Number ?? ""}`,
      reading: toC(raw, t.Units),
      unit: "°C",
      status: t.Status?.State || null,
      health: health(t),
      upper_critical: t.UpperThresholdCritical ?? t.UpperThresholdFatal ?? null,
      location: t.PhysicalContext || t.Oem?.Hp?.LocationXmm != null ? t.PhysicalContext : null,
    });
  }

  for (const f of thermal?.Fans || []) {
    const reading = f.Reading ?? f.CurrentReading ?? null;
    sensores.push({
      sensor_type: "fan",
      name: f.FanName || f.Name || "Ventilador",
      reading,
      unit: f.ReadingUnits || f.Units || "%",
      status: f.Status?.State || null,
      health: health(f),
      location: f.PhysicalContext || null,
    });
  }

  const power = await redfishTry(server, "/redfish/v1/Chassis/1/Power/");
  for (const ps of power?.PowerSupplies || []) {
    sensores.push({
      sensor_type: "power_supply",
      name: ps.Name || `Fonte ${ps.Oem?.Hp?.BayNumber ?? ""}`,
      reading: ps.LastPowerOutputWatts ?? ps.PowerCapacityWatts ?? null,
      unit: "W",
      status: ps.Status?.State || null,
      health: health(ps),
      location: ps.Model || ps.SerialNumber || null,
      details: {
        capacidade_w: ps.PowerCapacityWatts ?? null,
        entrada_v: ps.LineInputVoltage ?? null,
        modelo: ps.Model ?? null,
        serial: ps.SerialNumber ?? null,
        firmware: ps.FirmwareVersion ?? null,
      },
    });
  }

  for (const v of power?.Voltages || []) {
    sensores.push({
      sensor_type: "voltage",
      name: v.Name || "Voltagem",
      reading: v.ReadingVolts ?? null,
      unit: "V",
      status: v.Status?.State || null,
      health: health(v),
      upper_critical: v.UpperThresholdCritical ?? null,
    });
  }

  return sensores;
}

async function coletarDiscos(server) {
  const sensores = [];
  const controllers = await redfishTry(
    server,
    "/redfish/v1/Systems/1/SmartStorage/ArrayControllers/",
  );

  for (const ref of controllers?.Members || []) {
    const ctrl = await redfishTry(server, ref["@odata.id"]);
    if (!ctrl) continue;

    sensores.push({
      sensor_type: "controller",
      name: ctrl.Model || "Controladora RAID",
      status: ctrl.Status?.State || null,
      health: health(ctrl),
      location: ctrl.Location || null,
      details: { firmware: ctrl.FirmwareVersion?.Current?.VersionString ?? null, serial: ctrl.SerialNumber ?? null },
    });

    // Volumes lógicos (estado do RAID)
    const ldRoot = await redfishTry(server, `${ref["@odata.id"]}LogicalDrives/`);
    for (const ldRef of ldRoot?.Members || []) {
      const ld = await redfishTry(server, ldRef["@odata.id"]);
      if (!ld) continue;
      sensores.push({
        sensor_type: "logical_drive",
        name: ld.LogicalDriveName || `Volume ${ld.LogicalDriveNumber ?? ""}`,
        reading: ld.CapacityMiB ? Math.round(ld.CapacityMiB / 1024) : null,
        unit: "GB",
        status: ld.Status?.State || null,
        health: health(ld),
        location: `RAID ${ld.Raid ?? "?"}`,
        details: { raid: ld.Raid ?? null, stripe_kb: ld.StripeSizeBytes ? ld.StripeSizeBytes / 1024 : null },
      });
    }

    // Discos físicos (SMART / desgaste)
    const pdRoot = await redfishTry(server, `${ref["@odata.id"]}DiskDrives/`);
    for (const pdRef of pdRoot?.Members || []) {
      const pd = await redfishTry(server, pdRef["@odata.id"]);
      if (!pd) continue;
      sensores.push({
        sensor_type: "disk",
        name: pd.Model ? `${pd.Location || pd.Name} — ${pd.Model}` : pd.Name || "Disco",
        reading: pd.CapacityMiB ? Math.round(pd.CapacityMiB / 1024) : null,
        unit: "GB",
        status: pd.Status?.State || null,
        health: health(pd),
        location: pd.Location || null,
        details: {
          serial: pd.SerialNumber ?? null,
          interface: pd.InterfaceType ?? null,
          media: pd.MediaType ?? null,
          rpm: pd.RotationalSpeedRpm ?? null,
          horas_uso: pd.PowerOnHours ?? null,
          desgaste_ssd_pct: pd.SSDEnduranceUtilizationPercentage ?? null,
          firmware: pd.FirmwareVersion?.Current?.VersionString ?? null,
        },
      });
    }
  }

  return sensores;
}

async function coletarEventos(server) {
  const eventos = [];
  const iml = await redfishTry(server, "/redfish/v1/Systems/1/LogServices/IML/Entries/?$top=50");
  const membros = iml?.Members || [];

  // O IML devolve do mais antigo ao mais novo; ficamos com os 50 últimos.
  for (const entry of membros.slice(-50)) {
    const detalhe = entry.Message ? entry : await redfishTry(server, entry["@odata.id"]);
    if (!detalhe) continue;
    eventos.push({
      event_key: String(detalhe.Id ?? detalhe["@odata.id"] ?? detalhe.Created ?? Math.random()),
      severity: severityFromIml(detalhe),
      category: detalhe.EntryType || detalhe.Oem?.Hp?.Class || null,
      message: detalhe.Message || detalhe.Name || "Evento de hardware",
      recorded_at: detalhe.Created || new Date().toISOString(),
    });
  }

  return eventos;
}

// ---------------------------------------------------------------------- Ciclo

async function processarServidor(server) {
  try {
    log("INFO", `Coletando ${server.name} (${server.host})...`);

    const { info, health: healthObj } = await coletarSistema(server);
    const sensores = [
      ...(await coletarTermicoEEnergia(server)),
      ...(await coletarDiscos(server)),
    ];
    const eventos = await coletarEventos(server);

    // Saúde consolidada: qualquer subsistema crítico eleva o status geral.
    const valores = Object.values(healthObj).filter(Boolean).map(String);
    if (valores.some((v) => v === "Critical")) info.health_summary = "Critical";
    else if (valores.some((v) => v === "Warning") && info.health_summary !== "Critical") {
      info.health_summary = "Warning";
    }

    const status = info.health_summary === "Critical" || info.health_summary === "Warning"
      ? "warning"
      : "online";

    const res = await postIngest({
      type: "ilo",
      server_id: server.id,
      status,
      info,
      health: healthObj,
      sensors: sensores,
      events: eventos,
    });

    log(
      "OK",
      `${server.name}: ${sensores.length} sensores, ${eventos.length} eventos ` +
        `(${res.new_critical || 0} críticos novos), saúde=${info.health_summary || "—"}`,
    );
  } catch (err) {
    log("ERRO", `${server.name}: ${err.message}`);
    try {
      await postIngest({
        type: "ilo",
        server_id: server.id,
        status: "offline",
        last_error: err.message.substring(0, 500),
      });
    } catch (e) {
      log("ERRO", `Falha ao reportar erro de ${server.name}: ${e.message}`);
    }
  }
}

/** Informa ao painel a versao instalada deste agente. */
async function reportarVersao() {
  try {
    await postIngest(
      { agent_type: "ilo", version: AGENT_VERSION, host: require("os").hostname() },
      HEARTBEAT_URL,
    );
  } catch (err) {
    log("AVISO", `Falha ao reportar a versao do agente: ${err.message}`);
  }
}

async function ciclo() {
  await reportarVersao();
  let servidores;
  try {
    servidores = await postIngest({ type: "list-ilo" });
  } catch (err) {
    log("ERRO", `Não foi possível obter a lista de servidores: ${err.message}`);
    return;
  }

  // Servidores Dell sao tratados pelo idrac-collector.js.
  const hp = (Array.isArray(servidores) ? servidores : []).filter((s) => s.vendor !== "dell");

  if (hp.length === 0) {
    log("AVISO", "Nenhum servidor HP iLO ativo cadastrado no painel.");
    return;
  }

  log("INFO", `${hp.length} servidor(es) iLO para coletar.`);
  for (const s of hp) {
    await processarServidor(s);
  }
  log("INFO", "Ciclo concluído.");
}

async function main() {
  log("INFO", `Coletor iLO4 iniciado — destino: ${INGEST_URL}`);
  if (CONFIG.inseguro) {
    log("AVISO", "Certificados autoassinados aceitos (--inseguro). Use apenas em rede de gerenciamento confiável.");
  }

  await ciclo();
  if (CONFIG.umaVez) return;

  log("INFO", `Próximas coletas a cada ${CONFIG.intervalo}s. Ctrl+C para encerrar.`);
  setInterval(() => {
    ciclo().catch((e) => log("ERRO", `Ciclo falhou: ${e.message}`));
  }, CONFIG.intervalo * 1000);
}

process.on("SIGINT", () => {
  log("INFO", "Encerrando coletor iLO4.");
  process.exit(0);
});

main().catch((err) => {
  log("ERRO", `Falha fatal: ${err.message}`);
  process.exit(1);
});
