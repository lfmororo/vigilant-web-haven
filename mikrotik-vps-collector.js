#!/usr/bin/env node
/**
 * Mikrotik & SNMP VPS Collector
 * 
 * Script para rodar em uma VPS que coleta dados de dispositivos Mikrotik
 * (RouterOS 6.x ou 7.x) via API binária e dispositivos SNMP (ex: TP-Link ER605)
 * e envia para o sistema via Edge Function.
 * 
 * Instalação:
 *   npm init -y
 *   npm install routeros-client net-snmp node-cron
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
 *   Description=Mikrotik & SNMP VPS Collector
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
const snmp = require('net-snmp');
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
      device_type: 'mikrotik', // 'mikrotik' ou 'snmp'
      name: 'Mikrotik Principal',
      host: '192.168.0.1',
      port: 8728,
      username: 'admin',
      password: 'senha',
      // Interfaces para monitorar mudanças de status (vazio = todas)
      watch_interfaces: [],
    },
    {
      device_id: 'UUID_DO_ER605_NO_SISTEMA',
      device_type: 'snmp',
      name: 'TP-Link ER605',
      host: '192.168.0.2',
      snmp_community: 'public',
      snmp_version: '2c', // '1' ou '2c'
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

    // Coletar taxa de banda em tempo real (tx-rate/rx-rate) das interfaces UP
    const runningIfaces = (interfaces || []).filter(i => 
      (i.running === 'true' || i.running === true) && 
      (i.disabled !== 'true' && i.disabled !== true)
    );
    const trafficRates = new Map();
    
    // Tentar coletar banda via monitor-traffic (múltiplas abordagens)
    // Abordagem 1: Todas as interfaces de uma vez
    try {
      const allIfNames = runningIfaces.map(i => i.name).filter(Boolean).join(',');
      if (allIfNames) {
        const monitor = await client.menu('/interface/monitor-traffic')
          .where('interface', allIfNames)
          .where('once', '')
          .getAll();
        if (monitor && monitor.length > 0) {
          for (const entry of monitor) {
            const name = entry.name || entry.interface;
            if (name) {
              trafficRates.set(name, {
                'tx-bits-per-second': parseInt(entry['tx-bits-per-second'] || '0') || 0,
                'rx-bits-per-second': parseInt(entry['rx-bits-per-second'] || '0') || 0,
              });
            }
          }
          console.log(`  📊 Banda coletada para ${trafficRates.size} interfaces`);
        }
      }
    } catch (e1) {
      // Abordagem 2: Uma interface por vez via exec
      for (const iface of runningIfaces) {
        const ifName = iface.name;
        if (!ifName) continue;
        try {
          const monitor = await client.menu('/interface').exec('monitor-traffic', {
            interface: ifName,
            once: '',
          });
          if (monitor && Array.isArray(monitor) && monitor.length > 0) {
            trafficRates.set(ifName, {
              'tx-bits-per-second': parseInt(monitor[0]['tx-bits-per-second'] || monitor[0]['txBitsPerSecond'] || '0') || 0,
              'rx-bits-per-second': parseInt(monitor[0]['rx-bits-per-second'] || monitor[0]['rxBitsPerSecond'] || '0') || 0,
            });
          }
        } catch (_) {}
      }
      if (trafficRates.size > 0) {
        console.log(`  📊 Banda coletada (fallback) para ${trafficRates.size} interfaces`);
      }
    }
    
    // Abordagem 3: Se nenhuma funcionou, usar tx-byte/rx-byte delta como estimativa
    if (trafficRates.size === 0) {
      console.log(`  ⚠️ monitor-traffic não suportado, usando estimativa via contadores`);
      const stateKey = device.device_id + '_bytes';
      const prevBytes = previousStates.get(stateKey) || {};
      const now = Date.now();
      const prevTime = prevBytes._timestamp || now;
      const elapsed = Math.max(1, (now - prevTime) / 1000); // segundos
      
      const newBytes = {};
      for (const iface of runningIfaces) {
        const ifName = iface.name;
        if (!ifName) continue;
        const txBytes = parseInt(iface['tx-byte'] || '0') || 0;
        const rxBytes = parseInt(iface['rx-byte'] || '0') || 0;
        newBytes[ifName] = { tx: txBytes, rx: rxBytes };
        
        if (prevBytes[ifName]) {
          const txDelta = Math.max(0, txBytes - prevBytes[ifName].tx);
          const rxDelta = Math.max(0, rxBytes - prevBytes[ifName].rx);
          // Converter bytes/s para bits/s
          const txBps = Math.round((txDelta / elapsed) * 8);
          const rxBps = Math.round((rxDelta / elapsed) * 8);
          if (txBps > 0 || rxBps > 0) {
            trafficRates.set(ifName, {
              'tx-bits-per-second': txBps,
              'rx-bits-per-second': rxBps,
            });
          }
        }
      }
      newBytes._timestamp = now;
      previousStates.set(stateKey, newBytes);
      if (trafficRates.size > 0) {
        console.log(`  📊 Banda estimada para ${trafficRates.size} interfaces`);
      }
    }

    // Coletar endereços IP
    let ipAddresses = [];
    try { ipAddresses = await client.menu('/ip/address').getAll(); } catch (_) {}

    // Coletar clientes PPPoE
    let pppoeClients = [];
    try { pppoeClients = await client.menu('/interface/pppoe-client').getAll(); } catch (_) {}

    // Coletar identidade do sistema
    let identity = '';
    try {
      const identityRes = await client.menu('/system/identity').getAll();
      identity = identityRes?.[0]?.name || '';
    } catch (_) {}

    // Coletar resource (uptime, version, cpu)
    let resource = {};
    try {
      const resData = await client.menu('/system/resource').getAll();
      resource = resData?.[0] || {};
    } catch (_) {}

    // Coletar health (temperatura, voltagem, fan)
    let health = {};
    try {
      const healthData = await client.menu('/system/health').getAll();
      if (healthData && healthData.length > 0) {
        // RouterOS 7: array of {name, value, type}
        // RouterOS 6: single object with keys like temperature, voltage, etc.
        if (healthData[0]?.name && healthData[0]?.value !== undefined) {
          for (const item of healthData) {
            health[item.name] = item.value;
          }
        } else {
          health = healthData[0] || {};
        }
      }
    } catch (_) {}

    // Coletar logs recentes (últimos 200 para análise)
    let logs = [];
    try {
      const logData = await client.menu('/log').getAll();
      logs = (logData || []).slice(-200);
    } catch (_) {}

    // Coletar leases DHCP
    let dhcpLeases = [];
    try { dhcpLeases = await client.menu('/ip/dhcp-server/lease').getAll(); } catch (_) {}

    // Coletar pools DHCP (ranges de IPs disponíveis)
    let dhcpPools = [];
    try { dhcpPools = await client.menu('/ip/pool').getAll(); } catch (_) {}

    // Coletar redes DHCP (para mapear pool <-> server)
    let dhcpNetworks = [];
    try { dhcpNetworks = await client.menu('/ip/dhcp-server/network').getAll(); } catch (_) {}

    // Coletar servidores DHCP
    let dhcpServers = [];
    try { dhcpServers = await client.menu('/ip/dhcp-server').getAll(); } catch (_) {}

    await api.disconnect();

    // Enriquecer interfaces com dados de banda em tempo real
    for (const iface of (interfaces || [])) {
      const rates = trafficRates.get(iface.name);
      if (rates) {
        iface['tx-bits-per-second'] = rates['tx-bits-per-second'];
        iface['rx-bits-per-second'] = rates['rx-bits-per-second'];
      }
    }

    return {
      success: true,
      identity,
      resource,
      health,
      interfaces: interfaces || [],
      ipAddresses: ipAddresses || [],
      pppoeClients: pppoeClients || [],
      logs,
      dhcpLeases: dhcpLeases || [],
      dhcpPools: dhcpPools || [],
      dhcpNetworks: dhcpNetworks || [],
      dhcpServers: dhcpServers || [],
    };
  } catch (err) {
    if (api) {
      try { await api.disconnect(); } catch (_) {}
    }
    return { success: false, error: err.message };
  }
}

// ==================== SNMP COLLECTION ====================

/**
 * Coleta dados de um dispositivo via SNMP (ex: TP-Link ER605)
 * OIDs padrão do IF-MIB e HOST-RESOURCES-MIB
 */
async function collectSnmpData(device) {
  const version = device.snmp_version === '1' ? snmp.Version1 : snmp.Version2c;
  const session = snmp.createSession(device.host, device.snmp_community || 'public', { version, timeout: 10000 });

  return new Promise((resolve) => {
    const result = {
      success: true,
      identity: device.name,
      resource: {},
      health: {},
      interfaces: [],
      ipAddresses: [],
      pppoeClients: [],
      logs: [],
      dhcpLeases: [],
      dhcpPools: [],
      dhcpNetworks: [],
      dhcpServers: [],
    };

    // Coletar uptime do sistema
    const sysOids = [
      '1.3.6.1.2.1.1.1.0',  // sysDescr
      '1.3.6.1.2.1.1.3.0',  // sysUpTime (em centésimos de segundo)
      '1.3.6.1.2.1.1.5.0',  // sysName
    ];

    session.get(sysOids, (error, varbinds) => {
      if (error) {
        session.close();
        resolve({ success: false, error: `SNMP error: ${error.message}` });
        return;
      }

      for (const vb of varbinds) {
        if (snmp.isVarbindError(vb)) continue;
        const oidStr = vb.oid;
        if (oidStr === '1.3.6.1.2.1.1.1.0') {
          result.resource.version = vb.value.toString();
        } else if (oidStr === '1.3.6.1.2.1.1.3.0') {
          // sysUpTime em centésimos de segundo → converter para formato legível
          const centiseconds = Number(vb.value);
          const totalSecs = Math.floor(centiseconds / 100);
          const days = Math.floor(totalSecs / 86400);
          const hours = Math.floor((totalSecs % 86400) / 3600);
          const mins = Math.floor((totalSecs % 3600) / 60);
          result.resource.uptime = `${days}d${hours}h${mins}m`;
        } else if (oidStr === '1.3.6.1.2.1.1.5.0') {
          result.identity = vb.value.toString() || device.name;
        }
      }

      // Coletar tabela de interfaces via subtree
      const ifTableOid = '1.3.6.1.2.1.2.2.1';
      session.subtree(ifTableOid, 20, (varbinds2) => {
        for (const vb of varbinds2) {
          if (snmp.isVarbindError(vb)) continue;
          const parts = vb.oid.split('.');
          const column = parseInt(parts[9]); // coluna na tabela
          const ifIndex = parts[10]; // índice da interface

          // Encontrar ou criar entrada da interface
          let iface = result.interfaces.find(i => i._ifIndex === ifIndex);
          if (!iface) {
            iface = { _ifIndex: ifIndex, name: `if${ifIndex}`, running: false, disabled: false, type: 'unknown' };
            result.interfaces.push(iface);
          }

          switch (column) {
            case 2: // ifDescr
              iface.name = vb.value.toString();
              break;
            case 3: // ifType
              iface.type = `snmp-type-${vb.value}`;
              break;
            case 5: // ifSpeed (bps)
              iface.speed = String(Number(vb.value));
              break;
            case 6: // ifPhysAddress (MAC)
              if (vb.value && vb.value.length >= 6) {
                iface['mac-address'] = Buffer.from(vb.value).toString('hex').match(/.{2}/g)?.join(':') || '';
              }
              break;
            case 8: // ifOperStatus: 1=up, 2=down
              iface.running = (Number(vb.value) === 1);
              break;
            case 10: // ifInOctets
              iface['rx-byte'] = String(Number(vb.value));
              break;
            case 14: // ifInErrors
              iface['rx-error'] = String(Number(vb.value));
              break;
            case 16: // ifOutOctets
              iface['tx-byte'] = String(Number(vb.value));
              break;
            case 20: // ifOutErrors
              iface['tx-error'] = String(Number(vb.value));
              break;
          }
        }
      }, (error2) => {
        session.close();

        // Limpar campos internos
        for (const iface of result.interfaces) {
          delete iface._ifIndex;
          iface.running = iface.running ? 'true' : 'false';
        }

        if (error2) {
          console.log(`  ⚠️ SNMP subtree warning: ${error2.message}`);
        }

        resolve(result);
      });
    });
  });
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
  const loginKeywords = ['login failure', 'denied', 'invalid user', 'wrong password', 'authentication failed'];
  const interfaceKeywords = ['link down', 'disconnected', 'down', 'lost connection'];
  const systemKeywords = ['error', 'fail', 'critical', 'kernel', 'out of memory', 'watchdog', 'reboot', 'unreachable', 'duplicate'];
  
  for (const log of logs) {
    const msg = (log.message || '').toLowerCase();
    const topic = (log.topics || '').toLowerCase();
    
    let category = null;
    if (loginKeywords.some(kw => msg.includes(kw))) {
      category = 'login';
    } else if (interfaceKeywords.some(kw => msg.includes(kw)) || (topic.includes('interface') && msg.includes('down'))) {
      category = 'interface';
    } else if (systemKeywords.some(kw => msg.includes(kw)) || topic.includes('error') || topic.includes('critical') || topic.includes('warning')) {
      category = 'system';
    }
    
    if (category) {
      alerts.push({
        time: log.time || '',
        topics: log.topics || '',
        message: log.message || '',
        category,
      });
    }
  }

  return alerts;
}

// ==================== DHCP ANALYSIS ====================

/**
 * Calcula quantos IPs um range pode gerar.
 * Formato: "192.168.1.10-192.168.1.254" ou "10.0.0.2-10.0.0.100"
 * Pode ter múltiplos ranges separados por vírgula.
 */
function ipToNumber(ip) {
  const parts = ip.trim().split('.');
  return ((parseInt(parts[0]) << 24) + (parseInt(parts[1]) << 16) + (parseInt(parts[2]) << 8) + parseInt(parts[3])) >>> 0;
}

function countPoolCapacity(ranges) {
  if (!ranges) return 0;
  let total = 0;
  // Ranges podem ser separados por vírgula: "10.0.0.2-10.0.0.50,10.0.0.100-10.0.0.200"
  const parts = ranges.split(',');
  for (const part of parts) {
    const trimmed = part.trim();
    if (trimmed.includes('-')) {
      const [start, end] = trimmed.split('-');
      const startNum = ipToNumber(start);
      const endNum = ipToNumber(end);
      if (endNum >= startNum) {
        total += (endNum - startNum + 1);
      }
    }
  }
  return total;
}

function analyzeDhcpLeases(dhcpLeases, dhcpPools, dhcpServers) {
  const totalLeases = dhcpLeases.length;
  const activeLeases = dhcpLeases.filter(l => 
    l.status === 'bound' || l.dynamic === 'true' || l.dynamic === true
  ).length;
  const staticLeases = dhcpLeases.filter(l => 
    l.dynamic === 'false' || l.dynamic === false
  ).length;

  // Mapear pool name -> capacity
  const poolCapacity = {};
  for (const pool of (dhcpPools || [])) {
    const poolName = pool.name || pool['.id'];
    const ranges = pool.ranges || '';
    poolCapacity[poolName] = countPoolCapacity(ranges);
  }

  // Mapear server -> pool name
  const serverToPool = {};
  for (const srv of (dhcpServers || [])) {
    const srvName = srv.name || srv['.id'];
    const poolName = srv['address-pool'] || srv.addressPool || '';
    serverToPool[srvName] = poolName;
  }

  // Agrupar por servidor DHCP com capacidade
  const byServer = {};
  let totalCapacity = 0;

  // Primeiro, registrar todos os servidores conhecidos
  for (const srv of (dhcpServers || [])) {
    const srvName = srv.name || srv['.id'];
    const poolName = serverToPool[srvName] || '';
    const capacity = poolCapacity[poolName] || 0;
    totalCapacity += capacity;
    byServer[srvName] = { total: 0, active: 0, capacity, pool: poolName };
  }

  // Contar leases por servidor
  for (const lease of dhcpLeases) {
    const server = lease.server || lease['dhcp-server'] || 'default';
    if (!byServer[server]) {
      byServer[server] = { total: 0, active: 0, capacity: 0, pool: '' };
    }
    byServer[server].total++;
    if (lease.status === 'bound') byServer[server].active++;
  }

  // Calcular utilização por servidor
  for (const [name, info] of Object.entries(byServer)) {
    if (info.capacity > 0) {
      info.usage_pct = Math.round((info.active / info.capacity) * 100 * 10) / 10;
    } else {
      info.usage_pct = null;
    }
  }

  const overallUsagePct = totalCapacity > 0 
    ? Math.round((activeLeases / totalCapacity) * 100 * 10) / 10 
    : null;

  return {
    total_leases: totalLeases,
    active_leases: activeLeases,
    static_leases: staticLeases,
    dynamic_leases: totalLeases - staticLeases,
    total_capacity: totalCapacity,
    usage_pct: overallUsagePct,
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
  const devType = device.device_type || 'mikrotik';
  const typeLabel = devType === 'snmp' ? 'SNMP' : 'Mikrotik';
  console.log(`\n🔄 [${typeLabel}] Coletando dados de ${device.name} (${device.host})...`);

  const data = devType === 'snmp' ? await collectSnmpData(device) : await collectDeviceData(device);

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

  console.log(`  📊 ${data.interfaces.length} interfaces`);
  if (data.resource.version) {
    console.log(`  ℹ️  ${devType === 'snmp' ? data.resource.version : 'RouterOS ' + data.resource.version}, Uptime: ${data.resource.uptime || 'N/A'}`);
  }

  // Mostrar consumo de banda das interfaces UP
  const upIfaces = data.interfaces.filter(i => (i.running === 'true' || i.running === true) && i['tx-bits-per-second'] !== undefined);
  if (upIfaces.length > 0) {
    console.log(`  📶 Banda em tempo real:`);
    for (const iface of upIfaces) {
      const txBps = iface['tx-bits-per-second'] || 0;
      const rxBps = iface['rx-bits-per-second'] || 0;
      const fmtRate = (bps) => {
        if (bps >= 1000000000) return `${(bps / 1000000000).toFixed(2)} Gbps`;
        if (bps >= 1000000) return `${(bps / 1000000).toFixed(2)} Mbps`;
        if (bps >= 1000) return `${(bps / 1000).toFixed(1)} Kbps`;
        return `${bps} bps`;
      };
      console.log(`     📡 ${iface.name}: ↑ ${fmtRate(txBps)} | ↓ ${fmtRate(rxBps)}`);
    }
  }

  // Analisar DHCP leases com capacidade dos pools
  const dhcpSummary = analyzeDhcpLeases(data.dhcpLeases, data.dhcpPools, data.dhcpServers);
  const usageStr = dhcpSummary.usage_pct !== null ? ` | Utilização: ${dhcpSummary.usage_pct}%` : '';
  const capStr = dhcpSummary.total_capacity > 0 ? ` | Capacidade: ${dhcpSummary.total_capacity} IPs` : '';
  console.log(`  🌐 DHCP: ${dhcpSummary.active_leases} ativos / ${dhcpSummary.total_leases} total (${dhcpSummary.dynamic_leases} dinâmicos, ${dhcpSummary.static_leases} estáticos)${capStr}${usageStr}`);
  if (Object.keys(dhcpSummary.by_server).length > 0) {
    for (const [server, info] of Object.entries(dhcpSummary.by_server)) {
      const srvUsage = info.usage_pct !== null ? ` (${info.usage_pct}% de ${info.capacity} IPs)` : '';
      console.log(`     📡 ${server}: ${info.active}/${info.total} leases${srvUsage}`);
    }
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
  await sendToSystem(config, device.device_id, data, changes, logAlerts, dhcpSummary);
}

async function mainLoop() {
  const config = loadConfig();

  console.log('='.repeat(60));
  console.log('  MIKROTIK & SNMP VPS COLLECTOR');
  console.log(`  Dispositivos: ${config.devices.length}`);
  console.log(`  Intervalo: ${config.poll_interval_seconds}s`);
  console.log('='.repeat(60));

  // Primeiro poll (preencher estados iniciais sem alertar)
  console.log('\n🚀 Coletando estado inicial...');
  for (const device of config.devices) {
    const devType = device.device_type || 'mikrotik';
    const data = devType === 'snmp' ? await collectSnmpData(device) : await collectDeviceData(device);
    if (data.success) {
      detectChanges(device.device_id, device.name, data.interfaces, device.watch_interfaces);
      const dhcp = analyzeDhcpLeases(data.dhcpLeases || [], data.dhcpPools || [], data.dhcpServers || []);
      const capInfo = dhcp.total_capacity > 0 ? `, ${dhcp.total_capacity} IPs no pool (${dhcp.usage_pct}% uso)` : '';
      console.log(`  ✅ [${devType.toUpperCase()}] ${device.name}: ${data.interfaces.length} interfaces${dhcp.total_leases > 0 ? `, ${dhcp.total_leases} DHCP leases` : ''}${capInfo}`);
      await sendToSystem(config, device.device_id, data, [], [], dhcp);
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
