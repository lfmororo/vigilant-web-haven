#!/usr/bin/env node
// === VMware ESXi/vCenter Collector ===
// Roda em VPS externa, coleta dados dos hosts ESXi via API REST
// Requer: node >= 18, axios
// npm install axios
// =====================================

const axios = require("axios");
const https = require("https");

// ---- CONFIGURAÇÃO ----
const SUPABASE_URL = "https://egbusmegupjfxqswdlxq.supabase.co";
const SUPABASE_ANON_KEY = "COLE_SUA_ANON_KEY_AQUI";
const POLL_INTERVAL_MS = 5 * 60 * 1000; // 5 minutos
// ---- FIM CONFIGURAÇÃO ----

const agent = new https.Agent({ rejectUnauthorized: false });

const supabaseHeaders = {
  "Content-Type": "application/json",
  Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
  apikey: SUPABASE_ANON_KEY,
};

function log(msg) {
  console.log(`[${new Date().toISOString()}] ${msg}`);
}

async function getVmwareSession(host, port, username, password) {
  try {
    const url = `https://${host}:${port}/api/session`;
    const res = await axios.post(url, null, {
      auth: { username, password },
      httpsAgent: agent,
      timeout: 15000,
    });
    return res.data; // session token string
  } catch (err) {
    // Try legacy SOAP login for older ESXi
    throw new Error(`Login failed: ${err.message}`);
  }
}

async function getVmwareData(host, port, sessionToken) {
  const baseUrl = `https://${host}:${port}/api`;
  const headers = { "vmware-api-session-id": sessionToken };

  // Get host system info
  let hostInfo = {};
  try {
    const res = await axios.get(`${baseUrl}/vcenter/host`, { headers, httpsAgent: agent, timeout: 15000 });
    if (res.data && res.data.length > 0) {
      hostInfo = res.data[0];
    }
  } catch {
    // Standalone ESXi may not have /vcenter/host
  }

  // Get VMs
  let vms = [];
  try {
    const res = await axios.get(`${baseUrl}/vcenter/vm`, { headers, httpsAgent: agent, timeout: 15000 });
    vms = (res.data || []).map((vm) => ({
      name: vm.name,
      power_state: vm.power_state,
      cpu_count: vm.cpu_count,
      ram_mb: vm.memory_size_MiB,
    }));

    // Get detailed info per VM
    for (let i = 0; i < vms.length; i++) {
      try {
        const vmId = res.data[i].vm;
        const detail = await axios.get(`${baseUrl}/vcenter/vm/${vmId}`, { headers, httpsAgent: agent, timeout: 10000 });
        const d = detail.data;
        if (d.guest) {
          vms[i].ip_address = d.guest?.networking?.ip_addresses?.[0]?.ip_address || null;
          vms[i].guest_os = d.guest?.os_id || null;
          vms[i].tools_status = d.guest?.tools_version_status || null;
        }
        // Disk info
        if (d.disks) {
          let totalCapacity = 0;
          Object.values(d.disks).forEach((disk) => {
            totalCapacity += (disk.capacity || 0);
          });
          vms[i].disk_provisioned_gb = +(totalCapacity / (1024 ** 3)).toFixed(2);
        }
      } catch {}
    }
  } catch (err) {
    log(`  ⚠ Erro ao listar VMs: ${err.message}`);
  }

  // Get datastores
  let datastores = [];
  try {
    const res = await axios.get(`${baseUrl}/vcenter/datastore`, { headers, httpsAgent: agent, timeout: 15000 });
    for (const ds of res.data || []) {
      try {
        const detail = await axios.get(`${baseUrl}/vcenter/datastore/${ds.datastore}`, { headers, httpsAgent: agent, timeout: 10000 });
        datastores.push({
          name: detail.data.name,
          capacity_gb: +((detail.data.capacity || 0) / (1024 ** 3)).toFixed(2),
          free_gb: +((detail.data.free_space || 0) / (1024 ** 3)).toFixed(2),
          type: detail.data.type,
        });
      } catch {}
    }
  } catch (err) {
    log(`  ⚠ Erro ao listar datastores: ${err.message}`);
  }

  return { hostInfo, vms, datastores };
}

async function destroySession(host, port, sessionToken) {
  try {
    await axios.delete(`https://${host}:${port}/api/session`, {
      headers: { "vmware-api-session-id": sessionToken },
      httpsAgent: agent,
      timeout: 5000,
    });
  } catch {}
}

async function collectVmwareHost(hostConfig) {
  const { id, name, host, port, username, password } = hostConfig;
  log(`📡 Coletando host: ${name} (${host}:${port})`);

  let sessionToken;
  try {
    sessionToken = await getVmwareSession(host, port, username, password);
    const { vms, datastores } = await getVmwareData(host, port, sessionToken);

    const payload = {
      type: "vmware",
      host_id: id,
      vms,
      datastores,
    };

    await axios.post(`${SUPABASE_URL}/functions/v1/server-monitor-ingest`, payload, {
      headers: supabaseHeaders,
      timeout: 15000,
    });

    log(`  ✅ ${name}: ${vms.length} VMs, ${datastores.length} datastores`);
  } catch (err) {
    log(`  ❌ ${name}: ${err.message}`);
    // Report error status
    try {
      await axios.post(`${SUPABASE_URL}/functions/v1/server-monitor-ingest`, {
        type: "vmware",
        host_id: id,
        vms: [],
        datastores: [],
      }, { headers: supabaseHeaders, timeout: 10000 });
    } catch {}
  } finally {
    if (sessionToken) await destroySession(host, port, sessionToken);
  }
}

async function fetchHosts() {
  try {
    const res = await axios.post(`${SUPABASE_URL}/functions/v1/server-monitor-ingest`, { type: "list-vmware" }, {
      headers: supabaseHeaders,
      timeout: 15000,
    });
    return res.data || [];
  } catch (err) {
    log(`❌ Erro ao buscar hosts: ${err.message}`);
    return [];
  }
}

async function runCycle() {
  log("=== Ciclo de coleta VMware ===");
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
  log("🚀 VMware Collector iniciado");
  await runCycle();
  setInterval(runCycle, POLL_INTERVAL_MS);
})();
