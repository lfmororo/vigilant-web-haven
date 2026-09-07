#!/usr/bin/env node
/**
 * Coletor de Monitoramento — Servidores Dell com iDRAC9 (Redfish REST API)
 * =========================================================================
 *
 * Roda em UMA máquina/VPS com acesso à rede de gerenciamento dos iDRACs e
 * coleta, de todos os servidores Dell cadastrados no painel:
 *
 *   - Status geral do servidor (online / alerta / offline)
 *   - Temperaturas e voltagens
 *   - Ventoinhas (RPM e estado)
 *   - Fontes de alimentação (estado, potência, entrada)
 *   - CPUs e memória (saúde por componente)
 *   - Controladoras RAID, volumes virtuais e discos físicos
 *   - Eventos do SEL (System Event Log) do iDRAC9
 *
 * Segurança:
 *   - HTTPS sempre (porta 443 por padrão).
 *   - Autenticação Basic com usuário do iDRAC — use um usuário com função
 *     "Read Only".
 *   - Certificados autoassinados são aceitos por padrão (--inseguro); use
 *     --seguro para exigir certificado válido.
 *
 * Uso:
 *   node idrac-collector.js --url <SUPABASE_URL> --key <ANON_KEY> [opções]
 *
 * Opções:
 *   --intervalo <seg>   Intervalo entre coletas (padrão: 300)
 *   --uma-vez           Executa apenas um ciclo e encerra (ideal p/ cron)
 *   --inseguro          Aceita certificado autoassinado (padrão)
 *   --seguro            Exige certificado válido
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
    else if (a === "--intervalo") args.intervalo = Number(argv[++i]) || 300;
    else if (a === "--uma-vez" || a === "--once") args.umaVez = true;
    else if (a === "--inseguro") args.inseguro = true;
    else if (a === "--seguro") args.inseguro = false;
  }
  args.url = args.url || process.env.SUPABASE_URL;
  args.key = args.key || process.env.SUPABASE_ANON_KEY;
  return args;
}

const CONFIG = parseArgs(process.argv);

if (!CONFIG.url || !CONFIG.key) {
  console.error("ERRO: informe --url <SUPABASE_URL> e --key <ANON_KEY>.");
  process.exit(1);
}

const INGEST_URL = `${CONFIG.url.replace(/\/+$/, "")}/functions/v1/server-monitor-ingest`;
const TIMEOUT_MS = 20000;
const HEARTBEAT_URL = `${CONFIG.url.replace(/\/+$/, "")}/functions/v1/agent-heartbeat`;
// Versao deste coletor. Mantenha igual a src/lib/agentVersions.ts.
const AGENT_VERSION = "1.1.0";

const SYS = "/redfish/v1/Systems/System.Embedded.1";
const MGR = "/redfish/v1/Managers/iDRAC.Embedded.1";
const CHASSIS = "/redfish/v1/Chassis/System.Embedded.1";

function log(nivel, msg) {
  console.log(`[${new Date().toISOString()}] [${nivel}] ${msg}`);
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
          apikey: CONFIG.key,
          Authorization: `Bearer ${CONFIG.key}`,
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

/** GET Redfish autenticado no iDRAC. */
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
          if (res.statusCode === 401) return reject(new Error("Credenciais do iDRAC inválidas (401)"));
          if (res.statusCode === 403) return reject(new Error("Usuário sem permissão de leitura no iDRAC (403)"));
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

/** GET tolerante: devolve null em vez de lançar (recursos opcionais). */
async function redfishTry(server, path) {
  try {
    return await redfishGet(server, path);
  } catch (err) {
    log("DEBUG", `${server.name}: ${path} indisponível — ${err.message}`);
    return null;
  }
}

// -------------------------------------------------------------- Normalizadores

function health(obj) {
  const h = obj?.Status?.Health || obj?.Status?.HealthRollup || obj?.Health;
  return h ? String(h) : null;
}

/** Consolida uma lista de itens Redfish em uma única saúde (pior caso). */
function piorSaude(itens) {
  let resultado = null;
  for (const item of itens || []) {
    const h = health(item);
    if (h === "Critical") return "Critical";
    if (h === "Warning") resultado = "Warning";
    else if (h === "OK" && !resultado) resultado = "OK";
  }
  return resultado;
}

function severityFromSel(entry) {
  const s = String(entry.Severity || "").toLowerCase();
  if (s.includes("critical") || s.includes("fatal")) return "critical";
  if (s.includes("warning") || s.includes("caution")) return "warning";
  return "info";
}

// -------------------------------------------------------------------- Coletores

async function coletarSistema(server) {
  const sys = await redfishGet(server, SYS);
  const mgr = await redfishTry(server, MGR);

  const cpuSummary = sys.ProcessorSummary || {};
  const memSummary = sys.MemorySummary || {};
  const oemDell = mgr?.Oem?.Dell || {};

  const info = {
    server_model: sys.Model || null,
    serial_number: sys.SKU || sys.SerialNumber || null,
    bios_version: sys.BiosVersion || null,
    // Reaproveitamos os campos de "iLO" para a controladora remota do fabricante.
    ilo_version: mgr?.Model || oemDell.DelliDRACCard?.Model || "iDRAC9",
    ilo_firmware: mgr?.FirmwareVersion || null,
    cpu_model: cpuSummary.Model || null,
    cpu_count: cpuSummary.Count ?? null,
    ram_total_gb: memSummary.TotalSystemMemoryGiB ?? null,
    power_state: sys.PowerState || null,
    post_state: sys.Oem?.Dell?.DellSystem?.PostState || null,
    indicator_led: sys.IndicatorLED || null,
    health_summary: health(sys) || sys.Status?.HealthRollup || null,
  };

  return { sys, info, cpuSummary, memSummary };
}

async function coletarTermicoEEnergia(server) {
  const sensores = [];
  const thermal = await redfishTry(server, `${CHASSIS}/Thermal`);
  const power = await redfishTry(server, `${CHASSIS}/Power`);

  for (const t of thermal?.Temperatures || []) {
    if (t.ReadingCelsius == null) continue;
    sensores.push({
      sensor_type: "temperature",
      name: t.Name || "Sensor de temperatura",
      reading: t.ReadingCelsius,
      unit: "°C",
      status: t.Status?.State || null,
      health: health(t),
      upper_critical: t.UpperThresholdCritical ?? t.UpperThresholdFatal ?? null,
      location: t.PhysicalContext || null,
    });
  }

  for (const f of thermal?.Fans || []) {
    sensores.push({
      sensor_type: "fan",
      name: f.FanName || f.Name || "Ventoinha",
      reading: f.Reading ?? f.ReadingRPM ?? null,
      unit: f.ReadingUnits || "RPM",
      status: f.Status?.State || null,
      health: health(f),
      location: f.PhysicalContext || null,
    });
  }

  for (const ps of power?.PowerSupplies || []) {
    sensores.push({
      sensor_type: "power_supply",
      name: ps.Name || "Fonte de alimentação",
      reading: ps.LastPowerOutputWatts ?? ps.PowerOutputWatts ?? ps.PowerCapacityWatts ?? null,
      unit: "W",
      status: ps.Status?.State || null,
      health: health(ps),
      location: ps.Model || ps.SerialNumber || null,
      details: {
        capacidade_w: ps.PowerCapacityWatts ?? null,
        entrada_v: ps.LineInputVoltage ?? null,
        tipo_entrada: ps.LineInputVoltageType ?? null,
        modelo: ps.Model ?? null,
        serial: ps.SerialNumber ?? null,
        firmware: ps.FirmwareVersion ?? null,
      },
    });
  }

  for (const v of power?.Voltages || []) {
    if (v.ReadingVolts == null) continue;
    sensores.push({
      sensor_type: "voltage",
      name: v.Name || "Voltagem",
      reading: v.ReadingVolts,
      unit: "V",
      status: v.Status?.State || null,
      health: health(v),
      upper_critical: v.UpperThresholdCritical ?? null,
    });
  }

  return { sensores, thermal, power };
}

async function coletarArmazenamento(server) {
  const sensores = [];
  const storage = await redfishTry(server, `${SYS}/Storage`);

  for (const ref of storage?.Members || []) {
    const ctrl = await redfishTry(server, ref["@odata.id"]);
    if (!ctrl) continue;

    const controladora = (ctrl.StorageControllers || [])[0] || {};
    sensores.push({
      sensor_type: "controller",
      name: controladora.Model || ctrl.Name || "Controladora RAID",
      status: controladora.Status?.State || ctrl.Status?.State || null,
      health: health(controladora) || health(ctrl),
      location: ctrl.Id || null,
      details: {
        firmware: controladora.FirmwareVersion ?? null,
        fabricante: controladora.Manufacturer ?? null,
      },
    });

    // Volumes virtuais (RAID)
    const volumes = await redfishTry(server, `${ref["@odata.id"]}/Volumes`);
    for (const volRef of volumes?.Members || []) {
      const vol = await redfishTry(server, volRef["@odata.id"]);
      if (!vol) continue;
      sensores.push({
        sensor_type: "logical_drive",
        name: vol.Name || vol.Id || "Volume",
        reading: vol.CapacityBytes ? Math.round(vol.CapacityBytes / 1024 ** 3) : null,
        unit: "GB",
        status: vol.Status?.State || null,
        health: health(vol),
        location: vol.RAIDType || vol.VolumeType || null,
        details: { raid: vol.RAIDType ?? vol.VolumeType ?? null },
      });
    }

    // Discos físicos
    for (const driveRef of ctrl.Drives || []) {
      const d = await redfishTry(server, driveRef["@odata.id"]);
      if (!d) continue;
      sensores.push({
        sensor_type: "disk",
        name: d.Model ? `${d.Name} — ${d.Model}` : d.Name || "Disco",
        reading: d.CapacityBytes ? Math.round(d.CapacityBytes / 1024 ** 3) : null,
        unit: "GB",
        status: d.Status?.State || null,
        health: health(d),
        location: d.PhysicalLocation?.PartLocation?.ServiceLabel || d.Id || null,
        details: {
          serial: d.SerialNumber ?? null,
          interface: d.Protocol ?? null,
          media: d.MediaType ?? null,
          rpm: d.RotationSpeedRPM ?? null,
          failure_prevista: d.FailurePredicted ?? null,
          desgaste_ssd_pct: d.PredictedMediaLifeLeftPercent != null
            ? 100 - d.PredictedMediaLifeLeftPercent
            : null,
          firmware: d.Revision ?? null,
        },
      });
    }
  }

  return sensores;
}

async function coletarEventos(server) {
  const eventos = [];
  const sel = await redfishTry(server, `${MGR}/LogServices/Sel/Entries?$top=50`);
  const membros = sel?.Members || [];

  for (const entry of membros.slice(-50)) {
    eventos.push({
      event_key: String(entry.Id ?? entry["@odata.id"] ?? entry.Created ?? Math.random()),
      severity: severityFromSel(entry),
      category: entry.EntryType || entry.SensorType || null,
      message: entry.Message || entry.Name || "Evento de hardware",
      recorded_at: entry.Created || new Date().toISOString(),
    });
  }

  return eventos;
}

// ---------------------------------------------------------------------- Ciclo

async function processarServidor(server) {
  try {
    log("INFO", `Coletando ${server.name} (${server.host})...`);

    const { info, cpuSummary, memSummary } = await coletarSistema(server);
    const { sensores: ambiente, thermal, power } = await coletarTermicoEEnergia(server);
    const discos = await coletarArmazenamento(server);
    const sensores = [...ambiente, ...discos];
    const eventos = await coletarEventos(server);

    const healthObj = {
      health_processor: health({ Status: cpuSummary.Status }),
      health_memory: health({ Status: memSummary.Status }),
      health_storage: piorSaude(discos.map((s) => ({ Health: s.health }))),
      health_fans: piorSaude(thermal?.Fans),
      health_power: piorSaude(power?.PowerSupplies),
      health_temperature: piorSaude(thermal?.Temperatures),
      health_network: null,
    };

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

    /**
     * Antes de reportar offline, tentamos novamente algumas vezes. Falhas
     * pontuais (timeout, iDRAC ocupado, reinício da interface web) não devem
     * gerar alerta de servidor fora do ar.
     */
    let recuperou = false;
    for (let tentativa = 1; tentativa <= 2 && !recuperou; tentativa++) {
      await new Promise((r) => setTimeout(r, 8000));
      const ping = await redfishTry(server, "/redfish/v1/Systems/System.Embedded.1");
      if (ping) {
        recuperou = true;
        log("AVISO", `${server.name}: respondeu na tentativa extra ${tentativa}; sem alerta de offline.`);
      }
    }

    try {
      await postIngest({
        type: "ilo",
        server_id: server.id,
        status: recuperou ? "warning" : "offline",
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
      { agent_type: "idrac", version: AGENT_VERSION, host: require("os").hostname() },
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

  // Somente os servidores marcados como Dell no painel.
  const dell = (Array.isArray(servidores) ? servidores : []).filter((s) => s.vendor === "dell");

  if (dell.length === 0) {
    log("AVISO", "Nenhum servidor Dell iDRAC9 ativo cadastrado no painel.");
    return;
  }

  log("INFO", `${dell.length} servidor(es) Dell para coletar.`);
  for (const s of dell) {
    await processarServidor(s);
  }
  log("INFO", "Ciclo concluído.");
}

async function main() {
  log("INFO", `Coletor Dell iDRAC9 iniciado — destino: ${INGEST_URL}`);
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
  log("INFO", "Encerrando coletor iDRAC9.");
  process.exit(0);
});

main().catch((err) => {
  log("ERRO", `Falha fatal: ${err.message}`);
  process.exit(1);
});
