#!/usr/bin/env node
// === VMware ESXi Collector via SSH ===
// Compatível com ESXi 6.5+ usando vim-cmd via SSH
// Requer: node >= 18, ssh2
// npm install ssh2
// =====================================

const { Client } = require("ssh2");
const https = require("https");

// ---- CONFIGURAÇÃO ----
const SUPABASE_URL = "https://egbusmegupjfxqswdlxq.supabase.co";
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || "COLE_SUA_ANON_KEY_AQUI";
// Token do agente (gerado no painel). Obrigatório para listar os hosts.
const MONITOR_TOKEN = process.env.MONITOR_TOKEN || "COLE_SEU_MONITOR_TOKEN_AQUI";
const POLL_INTERVAL_MS = 5 * 60 * 1000; // 5 minutos
// Versao deste coletor. Mantenha igual a src/lib/agentVersions.ts.
const AGENT_VERSION = "1.2.0";
// ---- FIM CONFIGURAÇÃO ----

function log(msg) {
  console.log(`[${new Date().toISOString()}] ${msg}`);
}

// ---- Helper: POST JSON to Supabase ----
function supabasePost(path, payload) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, SUPABASE_URL);
    const data = JSON.stringify(payload);
    const req = https.request(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(MONITOR_TOKEN && !MONITOR_TOKEN.startsWith("COLE_") ? { "x-monitor-token": MONITOR_TOKEN } : {}),
        ...(SUPABASE_ANON_KEY && !SUPABASE_ANON_KEY.startsWith("COLE_")
          ? { Authorization: `Bearer ${SUPABASE_ANON_KEY}`, apikey: SUPABASE_ANON_KEY }
          : {}),
        "Content-Length": Buffer.byteLength(data),
      },
      timeout: 15000,
    }, (res) => {
      let body = "";
      res.on("data", (c) => body += c);
      res.on("end", () => {
        try { resolve(JSON.parse(body)); } catch { resolve(body); }
      });
    });
    req.on("error", reject);
    req.on("timeout", () => { req.destroy(); reject(new Error("timeout")); });
    req.write(data);
    req.end();
  });
}

// ---- SSH helpers ----
const SSH_ALGORITHMS = {
  kex: [
    "diffie-hellman-group14-sha256",
    "diffie-hellman-group14-sha1",
    "diffie-hellman-group-exchange-sha256",
    "diffie-hellman-group-exchange-sha1",
    "diffie-hellman-group1-sha1",
  ],
  cipher: ["aes128-ctr", "aes192-ctr", "aes256-ctr", "aes128-cbc", "aes256-cbc"],
  serverHostKey: ["ssh-rsa", "ssh-ed25519", "ecdsa-sha2-nistp256"],
  hmac: ["hmac-sha2-256", "hmac-sha1"],
};

function sshExec(conn, cmd) {
  return new Promise((resolve, reject) => {
    conn.exec(cmd, (err, stream) => {
      if (err) return reject(err);
      let stdout = "";
      let stderr = "";
      stream.on("data", (c) => stdout += c.toString());
      stream.stderr.on("data", (c) => stderr += c.toString());
      stream.on("close", (code) => {
        if (code !== 0 && !stdout) {
          reject(new Error(`cmd '${cmd}' exit ${code}: ${stderr.trim()}`));
        } else {
          resolve(stdout);
        }
      });
    });
  });
}

function sshConnect(host, port, username, password) {
  return new Promise((resolve, reject) => {
    const conn = new Client();
    conn.on("keyboard-interactive", (_n, _i, _il, _p, finish) => finish([password]));
    conn.on("ready", () => resolve(conn));
    conn.on("error", (err) => reject(err));
    conn.connect({
      host,
      port: port || 22,
      username,
      password,
      tryKeyboard: true,
      algorithms: SSH_ALGORITHMS,
      readyTimeout: 20000,
    });
  });
}

// ---- Parsers para saída do vim-cmd / esxcli ----

function parseVmList(raw) {
  // vim-cmd vmsvc/getallvms
  // Vmid  Name       File                Guest OS       Version   Annotation
  const lines = raw.split("\n").slice(1).filter((l) => l.trim());
  return lines.map((line) => {
    const match = line.match(/^(\d+)\s+(\S+)\s+\[([^\]]+)\]\s+(\S+)\s+(\S+)\s+(\S+)/);
    if (match) {
      return { vmid: match[1], name: match[2], datastore: match[3], file: match[4], guestOs: match[5] };
    }
    // fallback: split por espaços
    const parts = line.trim().split(/\s+/);
    return { vmid: parts[0], name: parts[1], datastore: "", file: "", guestOs: parts[4] || "" };
  });
}

function parsePowerState(raw) {
  if (raw.includes("Powered on")) return "poweredOn";
  if (raw.includes("Powered off")) return "poweredOff";
  if (raw.includes("Suspended")) return "suspended";
  return "unknown";
}

function parseVmSummary(raw) {
  // vim-cmd vmsvc/get.summary <vmid> - pega campos relevantes
  const result = {};
  const getVal = (key) => {
    const regex = new RegExp(`${key}\\s*=\\s*(.+?)\\s*,`, "i");
    const m = raw.match(regex);
    return m ? m[1].trim().replace(/^"|"$/g, "") : null;
  };

  result.numCpu = parseInt(getVal("numCpu")) || null;
  result.memorySizeMB = parseInt(getVal("memorySizeMB")) || null;
  result.ipAddress = getVal("ipAddress") || getVal("guest.ipAddress");
  result.guestFullName = getVal("guestFullName");
  result.toolsStatus = getVal("toolsStatus") || getVal("toolsRunningStatus");
  result.committedStorage = parseInt(getVal("committed")) || null;
  result.uncommittedStorage = parseInt(getVal("uncommitted")) || null;

  // limpar <unset> do ipAddress
  if (result.ipAddress === "<unset>" || result.ipAddress === "unset") {
    result.ipAddress = null;
  }

  return result;
}

function parseDatastores(raw) {
  // esxcli storage filesystem list
  // Mount Point  Volume Name  UUID  Mounted  Type  Size  Free
  const lines = raw.split("\n").filter((l) => l.trim() && !l.startsWith("---") && !l.startsWith("Mount Point"));
  return lines.map((line) => {
    const parts = line.trim().split(/\s{2,}/);
    if (parts.length >= 7) {
      return {
        name: parts[1] || parts[0],
        capacity_gb: +(parseInt(parts[5]) / (1024 ** 3)).toFixed(2) || 0,
        free_gb: +(parseInt(parts[6]) / (1024 ** 3)).toFixed(2) || 0,
        type: parts[4] || "VMFS",
      };
    }
    return null;
  }).filter(Boolean);
}

function parseHostInfo(raw) {
  // esxcli system version get
  const info = {};
  raw.split("\n").forEach((line) => {
    const [key, ...val] = line.split(":");
    if (key && val.length) {
      const k = key.trim().toLowerCase().replace(/\s+/g, "_");
      info[k] = val.join(":").trim();
    }
  });
  return info;
}

function parseUptime(raw) {
  // uptime output
  const match = raw.match(/up\s+(.+?),\s+\d+ users/i) || raw.match(/up\s+(.+)/i);
  if (!match) return null;
  const parts = match[1];
  let seconds = 0;
  const days = parts.match(/(\d+)\s*day/);
  const hours = parts.match(/(\d+):(\d+)/);
  const mins = parts.match(/(\d+)\s*min/);
  if (days) seconds += parseInt(days[1]) * 86400;
  if (hours) { seconds += parseInt(hours[1]) * 3600 + parseInt(hours[2]) * 60; }
  if (mins && !hours) seconds += parseInt(mins[1]) * 60;
  return seconds || null;
}

function parseCpuMemInfo(raw) {
  // esxcli hardware cpu global get -> CPU count / cores
  const result = { cpuCores: null };
  const cores = raw.match(/CPU Cores:\s*(\d+)/i);
  if (cores) result.cpuCores = parseInt(cores[1]);
  const packages = raw.match(/CPU Packages:\s*(\d+)/i);
  if (packages) result.cpuPackages = parseInt(packages[1]);
  return result;
}

function parseMemInfo(raw) {
  // esxcli hardware memory get
  const result = { ramTotalGB: null };
  const bytes = raw.match(/Physical Memory:\s*(\d+)/i);
  if (bytes) result.ramTotalGB = +(parseInt(bytes[1]) / (1024 ** 3)).toFixed(2);
  return result;
}

// ---- Coleta principal ----
async function collectVmwareHost(hostConfig) {
  const { id, name, host, username, password } = hostConfig;
  const sshPort = hostConfig.ssh_port || 22;
  log(`📡 Coletando host: ${name} (${host}:${sshPort})`);

  let conn;
  try {
    conn = await sshConnect(host, sshPort, username, password);
    log(`  🔑 SSH conectado`);

    // Coletas paralelas
    const [vmListRaw, datastoreRaw, versionRaw, uptimeRaw, cpuRaw, memRaw] = await Promise.all([
      sshExec(conn, "vim-cmd vmsvc/getallvms").catch(() => ""),
      sshExec(conn, "esxcli storage filesystem list").catch(() => ""),
      sshExec(conn, "esxcli system version get").catch(() => ""),
      sshExec(conn, "uptime").catch(() => ""),
      sshExec(conn, "esxcli hardware cpu global get").catch(() => ""),
      sshExec(conn, "esxcli hardware memory get").catch(() => ""),
    ]);

    // Parse VMs
    const vmEntries = parseVmList(vmListRaw);
    const vms = [];

    // Coleta detalhes de cada VM (sequencial para não sobrecarregar SSH)
    for (const vm of vmEntries) {
      try {
        const [powerRaw, summaryRaw] = await Promise.all([
          sshExec(conn, `vim-cmd vmsvc/power.getstate ${vm.vmid}`).catch(() => ""),
          sshExec(conn, `vim-cmd vmsvc/get.summary ${vm.vmid}`).catch(() => ""),
        ]);

        const powerState = parsePowerState(powerRaw);
        const summary = parseVmSummary(summaryRaw);

        let diskProvisionedGb = null;
        if (summary.committedStorage || summary.uncommittedStorage) {
          diskProvisionedGb = +(((summary.committedStorage || 0) + (summary.uncommittedStorage || 0)) / (1024 ** 3)).toFixed(2);
        }

        vms.push({
          name: vm.name,
          power_state: powerState,
          cpu_count: summary.numCpu,
          ram_mb: summary.memorySizeMB,
          ip_address: summary.ipAddress,
          guest_os: summary.guestFullName || vm.guestOs,
          tools_status: summary.toolsStatus,
          disk_provisioned_gb: diskProvisionedGb,
          disk_used_gb: summary.committedStorage ? +(summary.committedStorage / (1024 ** 3)).toFixed(2) : null,
        });
      } catch (err) {
        log(`    ⚠ VM ${vm.name}: ${err.message}`);
        vms.push({ name: vm.name, power_state: "unknown" });
      }
    }

    // Parse datastores
    const datastores = parseDatastores(datastoreRaw);

    // Parse host info
    const hostInfo = parseHostInfo(versionRaw);
    const uptimeSeconds = parseUptime(uptimeRaw);
    const cpuInfo = parseCpuMemInfo(cpuRaw);
    const memInfo = parseMemInfo(memRaw);

    const esxiVersion = hostInfo.version
      ? `${hostInfo.product || "ESXi"} ${hostInfo.version} (Build ${hostInfo.build || "?"})`
      : null;

    const payload = {
      type: "vmware",
      host_id: id,
      cpu_cores: cpuInfo.cpuCores,
      ram_total_gb: memInfo.ramTotalGB,
      esxi_version: esxiVersion,
      uptime_seconds: uptimeSeconds,
      datastores,
      vms,
    };

    await supabasePost("/functions/v1/server-monitor-ingest", payload);
    log(`  ✅ ${name}: ${vms.length} VMs, ${datastores.length} datastores`);
  } catch (err) {
    log(`  ❌ ${name}: ${err.message}`);
    try {
      await supabasePost("/functions/v1/server-monitor-ingest", {
        type: "vmware",
        host_id: id,
        status: "offline",
        last_error: String(err.message || err).substring(0, 500),
      });
    } catch {}
  } finally {
    if (conn) conn.end();
  }
}

async function fetchHosts() {
  try {
    const data = await supabasePost("/functions/v1/server-monitor-ingest", { type: "list-vmware" });
    return Array.isArray(data) ? data : [];
  } catch (err) {
    log(`❌ Erro ao buscar hosts: ${err.message}`);
    return [];
  }
}

/** Informa ao painel a versao instalada deste agente. */
async function reportVersion() {
  try {
    await supabasePost("/functions/v1/agent-heartbeat", {
      agent_type: "vmware",
      version: AGENT_VERSION,
      host: require("os").hostname(),
    });
  } catch (err) {
    log(`aviso: falha ao reportar versao do agente: ${err.message}`);
  }
}

async function runCycle() {
  log("=== Ciclo de coleta VMware (SSH) ===");
  await reportVersion();
  const hosts = await fetchHosts();

  if (hosts.length === 0) {
    log("Nenhum host VMware ativo encontrado.");
    return;
  }

  log(`${hosts.length} host(s) encontrado(s)`);

  for (const h of hosts) {
    await collectVmwareHost(h);
  }

  log("=== Ciclo finalizado ===\n");
}

// Run
(async () => {
  log("🚀 VMware Collector (SSH) iniciado");
  await runCycle();
  setInterval(runCycle, POLL_INTERVAL_MS);
})();
