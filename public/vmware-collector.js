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
  // Try modern API first (ESXi 7.0+/vCenter 7.0+)
  try {
    const url = `https://${host}:${port}/api/session`;
    const res = await axios.post(url, null, {
      auth: { username, password },
      httpsAgent: agent,
      timeout: 15000,
    });
    return { token: res.data, legacy: false };
  } catch {
    // Try legacy REST API (ESXi 6.5-6.7)
    try {
      const url = `https://${host}:${port}/rest/com/vmware/cis/session`;
      const res = await axios.post(url, null, {
        auth: { username, password },
        httpsAgent: agent,
        timeout: 15000,
      });
      return { token: res.data.value, legacy: true };
    } catch (err2) {
      throw new Error(`Login failed on both /api and /rest endpoints: ${err2.message}`);
    }
  }
}

async function getVmwareData(host, port, sessionToken, legacy) {
  const baseUrl = legacy
    ? `https://${host}:${port}/rest/vcenter`
    : `https://${host}:${port}/api/vcenter`;
  const headers = { "vmware-api-session-id": sessionToken };

  // Get VMs
  let vms = [];
  try {
    const res = await axios.get(`${baseUrl}/vm`, { headers, httpsAgent: agent, timeout: 15000 });
    const vmList = legacy ? (res.data.value || []) : (res.data || []);
    vms = vmList.map((vm) => ({
      name: vm.name,
      power_state: vm.power_state,
      cpu_count: vm.cpu_count,
      ram_mb: vm.memory_size_MiB || vm.memory_size_mib,
    }));

    // Get detailed info per VM
    for (let i = 0; i < vms.length; i++) {
      try {
        const vmId = vmList[i].vm;
        const detail = await axios.get(`${baseUrl}/vm/${vmId}`, { headers, httpsAgent: agent, timeout: 10000 });
        const d = legacy ? (detail.data.value || detail.data) : detail.data;
        if (d.guest) {
          vms[i].ip_address = d.guest?.networking?.ip_addresses?.[0]?.ip_address || null;
          vms[i].guest_os = d.guest?.os_id || d.guest?.os || null;
          vms[i].tools_status = d.guest?.tools_version_status || null;
        }
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
    const res = await axios.get(`${baseUrl}/datastore`, { headers, httpsAgent: agent, timeout: 15000 });
    const dsList = legacy ? (res.data.value || []) : (res.data || []);
    for (const ds of dsList) {
      try {
        const detail = await axios.get(`${baseUrl}/datastore/${ds.datastore}`, { headers, httpsAgent: agent, timeout: 10000 });
        const dd = legacy ? (detail.data.value || detail.data) : detail.data;
        datastores.push({
          name: dd.name,
          capacity_gb: +((dd.capacity || 0) / (1024 ** 3)).toFixed(2),
          free_gb: +((dd.free_space || 0) / (1024 ** 3)).toFixed(2),
          type: dd.type,
        });
      } catch {}
    }
  } catch (err) {
    log(`  ⚠ Erro ao listar datastores: ${err.message}`);
  }

  return { vms, datastores };
}

async function destroySession(host, port, sessionToken, legacy) {
  try {
    const url = legacy
      ? `https://${host}:${port}/rest/com/vmware/cis/session`
      : `https://${host}:${port}/api/session`;
    await axios.delete(url, {
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
    const session = await getVmwareSession(host, port, username, password);
    sessionToken = session.token;
    isLegacy = session.legacy;
    log(`  🔑 Login OK (${isLegacy ? "legacy /rest" : "modern /api"})`);
    const { vms, datastores } = await getVmwareData(host, port, sessionToken, isLegacy);

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
