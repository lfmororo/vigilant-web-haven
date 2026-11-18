/**
 * DVR VPS Collector
 * Executa na VPS com SIMPlay da Intelbras instalado.
 * Monitora DVRs via ping e câmeras via ffmpeg (RTSP).
 *
 * Dependências: npm install axios ping
 * Requer ffmpeg instalado no sistema.
 *
 * Uso: node dvr-vps-collector.js
 */

const axios = require("axios");
const ping = require("ping");
const { exec } = require("child_process");

// ================= CONFIG =================
// Aceita --url, --key e --intervalo (segundos) na linha de comando ou variáveis de ambiente.
function cliArg(name) {
  const i = process.argv.indexOf(name);
  return i > 1 && i + 1 < process.argv.length ? process.argv[i + 1] : undefined;
}
const SUPABASE_URL = cliArg("--url") || process.env.SUPABASE_URL || "https://egbusmegupjfxqswdlxq.supabase.co";
const SUPABASE_ANON_KEY = cliArg("--key") || process.env.SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVnYnVzbWVndXBqZnhxc3dkbHhxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY0MDUxMDYsImV4cCI6MjA4MTk4MTEwNn0.SPh-z2s1UEyacv5ucviiMwWO58JifVKQ8NIYYYcfuQw";

const POLL_INTERVAL = (Number(cliArg("--intervalo")) || 60) * 1000; // padrão 60 segundos
// Versao deste coletor. Mantenha igual a src/lib/agentVersions.ts.
const AGENT_VERSION = "1.1.0";

// ================= BUSCAR DVRs DO BANCO =================
async function fetchDVRs() {
  try {
    const { data } = await axios.get(
      `${SUPABASE_URL}/rest/v1/dvr_devices?is_active=eq.true&select=id,name,host,port,username,password,dvr_cameras(id,name,channel,rtsp_url)`,
      {
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        },
      }
    );
    return data || [];
  } catch (err) {
    console.error("Erro ao buscar DVRs:", err.message);
    return [];
  }
}

// ================= DVR ONLINE (PING) =================
async function checkDVR(host) {
  try {
    const res = await ping.promise.probe(host, { timeout: 3 });
    return res.alive;
  } catch {
    return false;
  }
}

// ================= TESTE RTSP (FFMPEG) =================
function checkRTSP(rtspUrl) {
  return new Promise((resolve) => {
    if (!rtspUrl) {
      resolve(false);
      return;
    }
    const cmd = `ffmpeg -rtsp_transport tcp -i "${rtspUrl}" -t 5 -f null - 2>&1`;

    const proc = exec(cmd, { timeout: 15000 }, (error, stdout, stderr) => {
      // ffmpeg retorna código 0 se conseguiu ler frames
      if (error) {
        resolve(false);
      } else {
        resolve(true);
      }
    });
  });
}

// ================= ENVIAR DADOS =================
async function sendData(dvrs) {
  try {
    await axios.post(
      `${SUPABASE_URL}/functions/v1/dvr-vps-ingest`,
      { dvrs },
      {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        },
        timeout: 30000,
      }
    );
    console.log(`[${new Date().toISOString()}] Dados enviados com sucesso.`);
  } catch (err) {
    console.error("Erro ao enviar dados:", err.message);
  }
}

// ================= LOOP PRINCIPAL =================
/** Informa ao painel a versao instalada deste agente. */
async function reportVersion() {
  try {
    await axios.post(
      `${SUPABASE_URL}/functions/v1/agent-heartbeat`,
      { agent_type: "dvr", version: AGENT_VERSION, host: require("os").hostname() },
      {
        headers: {
          "Content-Type": "application/json",
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        },
        timeout: 15000,
      }
    );
  } catch (err) {
    console.warn("Aviso: falha ao reportar versao do agente:", err.message);
  }
}

async function monitor() {
  console.log(`[${new Date().toISOString()}] 🔍 Monitorando DVRs...`);
  await reportVersion();

  const dvrList = await fetchDVRs();
  if (dvrList.length === 0) {
    console.log("Nenhum DVR ativo encontrado.");
    return;
  }

  const results = [];

  for (const dvr of dvrList) {
    console.log(`  Verificando DVR: ${dvr.name} (${dvr.host})`);
    const online = await checkDVR(dvr.host);

    const dvrResult = {
      dvr_id: dvr.id,
      status: online ? "online" : "offline",
      error: online ? null : "Host não respondeu ao ping",
      cameras: [],
    };

    if (online && dvr.dvr_cameras && dvr.dvr_cameras.length > 0) {
      for (const cam of dvr.dvr_cameras) {
        console.log(`    Verificando câmera: ${cam.name} (canal ${cam.channel})`);

        // Construir URL RTSP se não definida manualmente
        let rtspUrl = cam.rtsp_url;
        if (!rtspUrl && dvr.host && dvr.username && dvr.password) {
          rtspUrl = `rtsp://${dvr.username}:${dvr.password}@${dvr.host}:554/cam/realmonitor?channel=${cam.channel}&subtype=0`;
        }

        const camOnline = await checkRTSP(rtspUrl);
        dvrResult.cameras.push({
          camera_id: cam.id,
          status: camOnline ? "online" : "offline",
        });

        console.log(`    → ${cam.name}: ${camOnline ? "✅ Online" : "❌ Offline"}`);
      }
    }

    results.push(dvrResult);
    console.log(`  → DVR ${dvr.name}: ${online ? "✅ Online" : "❌ Offline"}`);
  }

  await sendData(results);
}

// ================= INICIAR =================
console.log("=== DVR VPS Collector ===");
console.log(`Intervalo: ${POLL_INTERVAL / 1000}s`);
console.log(`Supabase: ${SUPABASE_URL}`);
console.log("");

monitor();
setInterval(monitor, POLL_INTERVAL);
