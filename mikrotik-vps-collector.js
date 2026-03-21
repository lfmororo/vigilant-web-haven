#!/usr/bin/env node
/**
 * Mikrotik VPS Collector
 * 
 * Script para rodar em uma VPS que coleta dados de dispositivos Mikrotik
 * (RouterOS 6.x ou 7.x) via API binária e envia para o sistema via Edge Function.
 * O sistema então notifica via WhatsApp quando detecta mudanças de status.
 * 
 * Instalação:
 *   npm init -y
 *   npm install routeros-client node-cron
 * 
 * Configuração:
 *   Edite o arquivo config.json (será criado automaticamente na primeira execução)
 * 
 * Execução:
 *   node mikrotik-vps-collector.js
 * 
 * Para rodar como serviço (systemd):
 *   sudo nano /etc/systemd/system/mikrotik-collector.service
 *   ---
 *   [Unit]
 *   Description=Mikrotik VPS Collector
 *   After=network.target
 *   [Service]
 *   Type=simple
 *   User=root
 *   WorkingDirectory=/opt/mikrotik-collector
 *   ExecStart=/usr/bin/node mikrotik-vps-collector.js
 *   Restart=always
 *   RestartSec=10
 *   [Install]
 *   WantedBy=multi-user.target
 *   ---
 *   sudo systemctl enable mikrotik-collector
 *   sudo systemctl start mikrotik-collector
 */

const { RouterOSClient } = require('routeros-client');
const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');

// ==================== CONFIG ====================

const CONFIG_PATH = path.join(__dirname, 'collector-config.json');

const DEFAULT_CONFIG = {
  // URL do sistema (Supabase Edge Function)
  supabase_url: 'https://egbusmegupjfxqswdlxq.supabase.co',
  supabase_anon_key: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVnYnVzbWVndXBqZnhxc3dkbHhxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY0MDUxMDYsImV4cCI6MjA4MTk4MTEwNn0.SPh-z2s1UEyacv5ucviiMwWO58JifVKQ8NIYYYcfuQw',

  // Intervalo de polling em segundos
  poll_interval_seconds: 60,

  // Dispositivos para monitorar
  devices: [
    {
      device_id: 'UUID_DO_DISPOSITIVO_NO_SISTEMA',
      name: 'Mikrotik Principal',
      host: '192.168.0.1',
      port: 8728,
      username: 'admin',
      password: 'senha',
      // Interfaces para monitorar mudanças de status (vazio = todas)
      watch_interfaces: [],
    }
  ]
};

function loadConfig() {
  if (!fs.existsSync(CONFIG_PATH)) {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(DEFAULT_CONFIG, null, 2));
    console.log(`\n⚠️  Arquivo de configuração criado: ${CONFIG_PATH}`);
    console.log('   Edite o arquivo com as credenciais corretas e execute novamente.\n');
    process.exit(0);
  }
  return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
}

// ==================== STATE ====================

// Armazena estado anterior das interfaces para detectar mudanças
const previousStates = new Map();

// ==================== MIKROTIK API ====================

async function connectToDevice(device) {
  const api = new RouterOSClient({
    host: device.host,
    port: device.port || 8728,
    user: device.username,
    password: device.password,
    timeout: 15,
  });

  try {
    const client = await api.connect();
    return { api, client };
  } catch (err) {
    throw new Error(`Falha ao conectar em ${device.host}:${device.port}: ${err.message}`);
  }
}

async function collectDeviceData(device) {
  let api;
  try {
    const conn = await connectToDevice(device);
    api = conn.api;
    const client = conn.client;
    console.log(`✅ Conectado a ${device.name} (${device.host})`);

    // Coletar interfaces
    const interfaces = await client.menu('/interface').getAll();

    // Coletar endereços IP
    let ipAddresses = [];
    try {
      ipAddresses = await client.menu('/ip/address').getAll();
    } catch (_) {}

    // Coletar clientes PPPoE
    let pppoeClients = [];
    try {
      pppoeClients = await client.menu('/interface/pppoe-client').getAll();
    } catch (_) {}

    // Coletar identidade do sistema
    let identity = '';
    try {
      const identityRes = await client.menu('/system/identity').getAll();
      identity = identityRes?.[0]?.name || '';
    } catch (_) {}

    // Coletar resource (uptime, version)
    let resource = {};
    try {
      const resData = await client.menu('/system/resource').getAll();
      resource = resData?.[0] || {};
    } catch (_) {}

    // Coletar logs recentes (últimos 200 para análise de 24h)
    let logs = [];
    try {
      const logData = await client.menu('/log').getAll();
      logs = (logData || []).slice(-200);
    } catch (_) {}

    // Coletar leases DHCP
    let dhcpLeases = [];
    try {
      dhcpLeases = await client.menu('/ip/dhcp-server/lease').getAll();
    } catch (_) {}

    await api.disconnect();

    return {
      success: true,
      identity,
      resource,
      interfaces: interfaces || [],
      ipAddresses: ipAddresses || [],
      pppoeClients: pppoeClients || [],
      logs,
      dhcpLeases: dhcpLeases || [],
    };
  } catch (err) {
    if (api) {
      try { await api.disconnect(); } catch (_) {}
    }
    return { success: false, error: err.message };
  }
}

// ==================== STATUS CHANGE DETECTION ====================

function detectChanges(deviceId, deviceName, currentInterfaces, watchInterfaces) {
  const changes = [];
  const stateKey = deviceId;
  const prevState = previousStates.get(stateKey) || {};

  for (const iface of currentInterfaces) {
    const ifName = iface.name || iface['.id'];
    if (!ifName) continue;

    // Se watchInterfaces está definido e não vazio, filtrar
    if (watchInterfaces?.length > 0 && !watchInterfaces.includes(ifName)) continue;

    const isRunning = iface.running === 'true' || iface.running === true;
    const wasRunning = prevState[ifName];

    if (wasRunning !== undefined && wasRunning !== isRunning) {
      changes.push({
        interface_name: ifName,
        previous_status: wasRunning ? 'up' : 'down',
        current_status: isRunning ? 'up' : 'down',
        device_name: deviceName,
      });
    }

    prevState[ifName] = isRunning;
  }

  previousStates.set(stateKey, prevState);
  return changes;
}

function detectLogAlerts(logs) {
  const alerts = [];
  const keywords = ['down', 'error', 'fail', 'critical', 'link down', 'disconnected', 'ppp', 'timeout', 'login failure', 'denied', 'unreachable', 'duplicate'];
  
  for (const log of logs) {
    const msg = (log.message || '').toLowerCase();
    const topic = (log.topics || '').toLowerCase();
    
    if (keywords.some(kw => msg.includes(kw)) || topic.includes('error') || topic.includes('critical') || topic.includes('warning')) {
      alerts.push({
        time: log.time || '',
        topics: log.topics || '',
        message: log.message || '',
      });
    }
  }

  return alerts;
}

// ==================== DHCP ANALYSIS ====================

function analyzeDhcpLeases(dhcpLeases) {
  const now = Date.now();
  const oneDayAgo = now - (24 * 60 * 60 * 1000);

  const totalLeases = dhcpLeases.length;
  const activeLeases = dhcpLeases.filter(l => 
    l.status === 'bound' || l.dynamic === 'true' || l.dynamic === true
  ).length;
  const staticLeases = dhcpLeases.filter(l => 
    l.dynamic === 'false' || l.dynamic === false
  ).length;

  // Agrupar por servidor DHCP
  const byServer = {};
  for (const lease of dhcpLeases) {
    const server = lease.server || lease['dhcp-server'] || 'default';
    if (!byServer[server]) byServer[server] = { total: 0, active: 0 };
    byServer[server].total++;
    if (lease.status === 'bound') byServer[server].active++;
  }

  return {
    total_leases: totalLeases,
    active_leases: activeLeases,
    static_leases: staticLeases,
    dynamic_leases: totalLeases - staticLeases,
    by_server: byServer,
  };
}

function postJSON(url, data, headers) {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const mod = parsedUrl.protocol === 'https:' ? https : http;
    const body = JSON.stringify(data);

    const req = mod.request(parsedUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
        ...headers,
      },
      timeout: 30000,
    }, (res) => {
      let responseBody = '';
      res.on('data', chunk => responseBody += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(responseBody) });
        } catch {
          resolve({ status: res.statusCode, data: responseBody });
        }
      });
    });

    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Request timeout')); });
    req.write(body);
    req.end();
  });
}

async function sendToSystem(config, deviceId, collectedData, changes, logAlerts, dhcpSummary) {
  const functionUrl = `${config.supabase_url}/functions/v1/mikrotik-vps-ingest`;

  const payload = {
    device_id: deviceId,
    collected_data: collectedData,
    status_changes: changes,
    log_alerts: logAlerts,
    dhcp_summary: dhcpSummary || null,
  };

  try {
    const result = await postJSON(functionUrl, payload, {
      'Authorization': `Bearer ${config.supabase_anon_key}`,
      'apikey': config.supabase_anon_key,
    });

    if (result.status >= 200 && result.status < 300) {
      console.log(`  📤 Dados enviados ao sistema (${collectedData.interfaces?.length || 0} interfaces, ${changes.length} mudanças)`);
    } else {
      console.error(`  ❌ Erro ao enviar dados: ${result.status}`, result.data);
    }

    return result;
  } catch (err) {
    console.error(`  ❌ Falha de conexão com o sistema: ${err.message}`);
    return null;
  }
}

// ==================== MAIN LOOP ====================

async function pollDevice(config, device) {
  console.log(`\n🔄 Coletando dados de ${device.name} (${device.host})...`);

  const data = await collectDeviceData(device);

  if (!data.success) {
    console.error(`  ❌ ${data.error}`);
    // Enviar erro ao sistema para registro
    await sendToSystem(config, device.device_id, data, [{
      interface_name: 'connection',
      previous_status: 'up',
      current_status: 'down',
      device_name: device.name,
    }], []);
    return;
  }

  console.log(`  📊 ${data.interfaces.length} interfaces, ${data.ipAddresses.length} IPs, ${data.pppoeClients.length} PPPoE`);
  if (data.resource.version) {
    console.log(`  ℹ️  RouterOS ${data.resource.version}, Uptime: ${data.resource.uptime || 'N/A'}`);
  }

  // Detectar mudanças de status
  const changes = detectChanges(device.device_id, device.name, data.interfaces, device.watch_interfaces);
  if (changes.length > 0) {
    console.log(`  ⚠️  ${changes.length} mudança(s) de status detectada(s):`);
    changes.forEach(c => {
      const emoji = c.current_status === 'up' ? '🟢' : '🔴';
      console.log(`     ${emoji} ${c.interface_name}: ${c.previous_status} → ${c.current_status}`);
    });
  }

  // Detectar alertas nos logs
  const logAlerts = detectLogAlerts(data.logs);
  if (logAlerts.length > 0) {
    console.log(`  📋 ${logAlerts.length} alerta(s) nos logs`);
  }

  // Enviar ao sistema
  await sendToSystem(config, device.device_id, data, changes, logAlerts);
}

async function mainLoop() {
  const config = loadConfig();

  console.log('='.repeat(60));
  console.log('  MIKROTIK VPS COLLECTOR');
  console.log(`  Dispositivos: ${config.devices.length}`);
  console.log(`  Intervalo: ${config.poll_interval_seconds}s`);
  console.log('='.repeat(60));

  // Primeiro poll (preencher estados iniciais sem alertar)
  console.log('\n🚀 Coletando estado inicial...');
  for (const device of config.devices) {
    const data = await collectDeviceData(device);
    if (data.success) {
      detectChanges(device.device_id, device.name, data.interfaces, device.watch_interfaces);
      console.log(`  ✅ ${device.name}: ${data.interfaces.length} interfaces`);
      // Envia dados iniciais sem mudanças de status
      await sendToSystem(config, device.device_id, data, [], []);
    } else {
      console.error(`  ❌ ${device.name}: ${data.error}`);
    }
  }

  console.log('\n⏰ Monitoramento contínuo iniciado...');

  // Loop contínuo
  const poll = async () => {
    for (const device of config.devices) {
      await pollDevice(config, device);
    }
  };

  setInterval(poll, config.poll_interval_seconds * 1000);
}

mainLoop().catch(err => {
  console.error('Erro fatal:', err);
  process.exit(1);
});
