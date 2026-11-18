// Gera o pacote do coletor (SNMP ou API MikroTik) já configurado para um dispositivo.
// Fica num arquivo próprio para ser baixado só quando alguém pede o pacote.
import { toast } from "sonner";
import { downloadAgentBundle } from "@/lib/agentBundle";
import type { MikrotikDevice } from "./types";

export const generateCollectorScript = async (device: MikrotikDevice) => {
  const isSNMP = device.device_type === 'snmp';

  const snmpScript = `#!/usr/bin/env node
/**
 * SNMP Collector - ${device.name}
 * Script pré-configurado para coleta via SNMP (ifTable + ifXTable 64-bit).
 *
 * Instalação na VPS:
 *   npm init -y
 *   npm install net-snmp
 *   node snmp-collector.js
 */

const snmp = require('net-snmp');
const http = require('http');
const https = require('https');

const CONFIG = {
  supabase_url: '${import.meta.env.VITE_SUPABASE_URL}',
  supabase_anon_key: '${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}',
  poll_interval_seconds: 60,
  devices: [{
    device_id: '${device.id}',
    name: '${device.name}',
    host: '${device.host}',
    port: ${device.port || 161},
    snmp_version: '${device.snmp_version || '2c'}',
    snmp_community: '${device.snmp_community || 'public'}',
    snmp_user: '${device.snmp_user || ''}',
    snmp_security_level: '${device.snmp_security_level || 'noAuthNoPriv'}',
    snmp_auth_protocol: '${device.snmp_auth_protocol || 'MD5'}',
    snmp_auth_passphrase: '${device.snmp_auth_passphrase || ''}',
    snmp_priv_protocol: '${device.snmp_priv_protocol || 'DES'}',
    snmp_priv_passphrase: '${device.snmp_priv_passphrase || ''}',
  }]
};

const previousStates = new Map();

function createSession(device) {
  const authMap = { 'MD5': snmp.AuthProtocols.md5, 'SHA': snmp.AuthProtocols.sha };
  const privMap = { 'DES': snmp.PrivProtocols.des, 'AES': snmp.PrivProtocols.aes };
  const secMap = { 'noAuthNoPriv': snmp.SecurityLevel.noAuthNoPriv, 'authNoPriv': snmp.SecurityLevel.authNoPriv, 'authPriv': snmp.SecurityLevel.authPriv };
  if (device.snmp_version === '3') {
    const user = { name: device.snmp_user, level: secMap[device.snmp_security_level] || snmp.SecurityLevel.noAuthNoPriv,
      authProtocol: authMap[device.snmp_auth_protocol] || snmp.AuthProtocols.md5, authKey: device.snmp_auth_passphrase,
      privProtocol: privMap[device.snmp_priv_protocol] || snmp.PrivProtocols.des, privKey: device.snmp_priv_passphrase };
    return snmp.createV3Session(device.host, user, { port: device.port || 161, timeout: 30000, retries: 2 });
  }
  return snmp.createSession(device.host, device.snmp_community || 'public', {
    port: device.port || 161, version: device.snmp_version === '1' ? snmp.Version1 : snmp.Version2c, timeout: 30000, retries: 2 });
}

function snmpGet(session, oids) {
  return new Promise((resolve, reject) => {
    session.get(oids, (err, vb) => { if (err) return reject(err);
      const r = {}; vb.forEach(v => { if (!snmp.isVarbindError(v)) r[v.oid] = v.value; }); resolve(r); });
  });
}
function snmpSubtree(session, oid) {
  return new Promise((resolve, reject) => {
    const res = [];
    session.subtree(oid, 20, (vb) => { vb.forEach(v => { if (!snmp.isVarbindError(v)) res.push(v); }); },
      (err) => { if (err && res.length === 0) reject(err); else resolve(res); });
  });
}

async function collectDeviceData(device) {
  let session;
  try {
    session = createSession(device);
    const sys = await snmpGet(session, ['1.3.6.1.2.1.1.1.0', '1.3.6.1.2.1.1.3.0', '1.3.6.1.2.1.1.5.0']);
    const sysDescr = (sys['1.3.6.1.2.1.1.1.0'] || '').toString();
    const sysName = (sys['1.3.6.1.2.1.1.5.0'] || '').toString();
    const uptimeCenti = Number(sys['1.3.6.1.2.1.1.3.0'] || 0);
    const totalSecs = Math.floor(uptimeCenti / 100);
    const dd = Math.floor(totalSecs / 86400), hh = Math.floor((totalSecs % 86400) / 3600), mm = Math.floor((totalSecs % 3600) / 60), ss = totalSecs % 60;
    const resource = { version: sysDescr, 'board-name': sysDescr.split('\\n')[0].substring(0, 60), uptime: dd + 'd' + hh + 'h' + mm + 'm' + ss + 's' };
    const identity = sysName || device.name;

    // Coletar ifTable completa
    const ifTableVbs = await snmpSubtree(session, '1.3.6.1.2.1.2.2.1');
    const ifMap = {};
    const getIf = (idx) => { if (!ifMap[idx]) ifMap[idx] = { name: 'if' + idx, running: false, disabled: false, type: 'unknown',
      'rx-byte': '0', 'tx-byte': '0', 'rx-packet': '0', 'tx-packet': '0', 'rx-error': '0', 'tx-error': '0', 'rx-drop': '0', 'tx-drop': '0' }; return ifMap[idx]; };

    for (const vb of ifTableVbs) {
      const parts = vb.oid.split('.'), col = parseInt(parts[9]), idx = parts[10];
      const iface = getIf(idx);
      switch (col) {
        case 2: iface.name = vb.value.toString(); break;
        case 3: { const t = Number(vb.value); const tn = { 6:'ether', 24:'loopback', 53:'vlan', 131:'tunnel', 161:'lag', 71:'wifi' };
          iface.type = tn[t] || 'snmp-type-' + t; iface._ifType = t; break; }
        case 5: iface.speed = String(Number(vb.value)); break;
        case 6: try { if (vb.value && vb.value.length >= 6) { const buf = Buffer.isBuffer(vb.value) ? vb.value : Buffer.from(vb.value);
          iface['mac-address'] = Array.from(buf.slice(0,6)).map(b => b.toString(16).padStart(2,'0')).join(':'); } } catch(_){} break;
        case 7: iface.disabled = (Number(vb.value) !== 1); break;
        case 8: iface.running = (Number(vb.value) === 1); break;
        case 10: iface['rx-byte'] = String(Number(vb.value)); break;
        case 11: iface['rx-packet'] = String(Number(vb.value)); break;
        case 13: iface['rx-drop'] = String(Number(vb.value)); break;
        case 14: iface['rx-error'] = String(Number(vb.value)); break;
        case 16: iface['tx-byte'] = String(Number(vb.value)); break;
        case 17: iface['tx-packet'] = String(Number(vb.value)); break;
        case 19: iface['tx-drop'] = String(Number(vb.value)); break;
        case 20: iface['tx-error'] = String(Number(vb.value)); break;
      }
    }

    // Tentar ifXTable (contadores 64-bit)
    try {
      const ifXVbs = await snmpSubtree(session, '1.3.6.1.2.1.31.1.1.1');
      for (const vb of ifXVbs) {
        const parts = vb.oid.split('.'), col = parseInt(parts[10]), idx = parts[11];
        const iface = getIf(idx);
        switch (col) {
          case 1: iface.name = vb.value.toString() || iface.name; break;
          case 6: iface['rx-byte'] = String(Number(vb.value)); break;
          case 10: iface['tx-byte'] = String(Number(vb.value)); break;
          case 15: { const hs = Number(vb.value); if (hs > 0) iface.speed = String(hs * 1000000); break; }
          case 18: { const alias = vb.value.toString(); if (alias) iface._alias = alias; break; }
        }
      }
      console.log('  📊 ifXTable (64-bit counters) coletado');
    } catch (_) { console.log('  ⚠️ ifXTable não suportado'); }

    // Montar interfaces finais
    const interfaces = [];
    for (const [idx, iface] of Object.entries(ifMap)) {
      if (iface._ifType === 24) continue;
      if (iface.name === 'if' + idx && iface._alias) iface.name = iface._alias;
      delete iface._ifType; delete iface._alias;
      iface.running = iface.running ? 'true' : 'false';
      interfaces.push(iface);
    }

    // Banda via delta
    const stateKey = device.device_id + '_bytes';
    const prev = previousStates.get(stateKey) || {};
    const now = Date.now(), elapsed = Math.max(1, (now - (prev._timestamp || now)) / 1000);
    const nb = { _timestamp: now };
    for (const iface of interfaces) {
      if (iface.running !== 'true') continue;
      const tx = parseInt(iface['tx-byte'] || '0') || 0, rx = parseInt(iface['rx-byte'] || '0') || 0;
      nb[iface.name] = { tx, rx };
      if (prev[iface.name]) {
        const txD = Math.max(0, tx - prev[iface.name].tx), rxD = Math.max(0, rx - prev[iface.name].rx);
        iface['tx-bits-per-second'] = Math.round((txD / elapsed) * 8);
        iface['rx-bits-per-second'] = Math.round((rxD / elapsed) * 8);
      }
    }
    previousStates.set(stateKey, nb);
    session.close();
    return { success: true, identity, resource, health: {}, interfaces, ipAddresses: [], pppoeClients: [], logs: [], dhcpLeases: [], dhcpPools: [], dhcpServers: [] };
  } catch (err) {
    if (session) try { session.close(); } catch (_) {}
    return { success: false, error: err.message };
  }
}

function detectChanges(deviceId, deviceName, ifaces) {
  const changes = [], prev = previousStates.get(deviceId + '_status') || {};
  for (const iface of ifaces) {
    if (!iface.name) continue;
    const isUp = iface.running === 'true', wasUp = prev[iface.name];
    if (wasUp !== undefined && wasUp !== isUp)
      changes.push({ interface_name: iface.name, previous_status: wasUp ? 'up' : 'down', current_status: isUp ? 'up' : 'down', device_name: deviceName });
    prev[iface.name] = isUp;
  }
  previousStates.set(deviceId + '_status', prev);
  return changes;
}

function postJSON(url, data, headers) {
  return new Promise((resolve, reject) => {
    const u = new URL(url), mod = u.protocol === 'https:' ? https : http, body = JSON.stringify(data);
    const req = mod.request(u, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body), ...headers }, timeout: 30000 }, (res) => {
      let rb = ''; res.on('data', c => rb += c);
      res.on('end', () => { try { resolve({ status: res.statusCode, data: JSON.parse(rb) }); } catch { resolve({ status: res.statusCode, data: rb }); } });
    });
    req.on('error', reject); req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
    req.write(body); req.end();
  });
}

async function sendToSystem(deviceId, data, changes, logAlerts, dhcp) {
  try {
    const result = await postJSON(CONFIG.supabase_url + '/functions/v1/mikrotik-vps-ingest',
      { device_id: deviceId, collected_data: data, status_changes: changes, log_alerts: logAlerts || [], dhcp_summary: dhcp || null },
      { 'Authorization': 'Bearer ' + CONFIG.supabase_anon_key, 'apikey': CONFIG.supabase_anon_key });
    if (result.status >= 200 && result.status < 300) console.log('  📤 Dados enviados (' + (data.interfaces?.length || 0) + ' interfaces, ' + changes.length + ' mudanças)');
    else console.error('  ❌ Erro: ' + result.status, result.data);
  } catch (err) { console.error('  ❌ Falha: ' + err.message); }
}

async function pollDevice(device) {
  console.log('\\n🔄 Coletando ' + device.name + '...');
  const data = await collectDeviceData(device);
  if (!data.success) {
    console.error('  ❌ ' + data.error);
    await sendToSystem(device.device_id, data, [{ interface_name: 'connection', previous_status: 'up', current_status: 'down', device_name: device.name }], []);
    return;
  }
  const upIfaces = data.interfaces.filter(i => i.running === 'true' && i['tx-bits-per-second'] !== undefined);
  console.log('  📊 ' + data.interfaces.length + ' interfaces (' + upIfaces.length + ' com banda)');
  if (upIfaces.length > 0) {
    for (const iface of upIfaces) {
      const fmt = (bps) => { if (bps >= 1000000) return (bps/1000000).toFixed(2) + ' Mbps'; if (bps >= 1000) return (bps/1000).toFixed(1) + ' Kbps'; return bps + ' bps'; };
      console.log('     📡 ' + iface.name + ': ↑ ' + fmt(iface['tx-bits-per-second']) + ' | ↓ ' + fmt(iface['rx-bits-per-second']));
    }
  }
  const changes = detectChanges(device.device_id, device.name, data.interfaces);
  if (changes.length > 0) {
    console.log('  ⚠️  ' + changes.length + ' mudança(s) de status:');
    changes.forEach(c => console.log('     ' + (c.current_status === 'up' ? '🟢' : '🔴') + ' ' + c.interface_name + ': ' + c.previous_status + ' → ' + c.current_status));
  }
  await sendToSystem(device.device_id, data, changes, []);
}

async function main() {
  console.log('='.repeat(50));
  console.log('  SNMP COLLECTOR - ${device.name}');
  console.log('='.repeat(50));
  console.log('\\n🚀 Coletando estado inicial...');
  for (const d of CONFIG.devices) {
    const data = await collectDeviceData(d);
    if (data.success) { detectChanges(d.device_id, d.name, data.interfaces);
      console.log('  ✅ ' + d.name + ': ' + data.interfaces.length + ' interfaces');
      await sendToSystem(d.device_id, data, [], []);
    } else console.error('  ❌ ' + d.name + ': ' + data.error);
  }
  console.log('\\n⏰ Monitoramento iniciado...');
  setInterval(async () => { for (const d of CONFIG.devices) await pollDevice(d); }, CONFIG.poll_interval_seconds * 1000);
}
main().catch(err => { console.error('Erro fatal:', err); process.exit(1); });
`;

  const mikrotikScript = `#!/usr/bin/env node
/**
 * Mikrotik VPS Collector - ${device.name}
 * Script pré-configurado para coleta de dados via API binária (porta 8728).
 *
 * Instalação na VPS:
 *   npm init -y
 *   npm install routeros-client
 *   node mikrotik-collector.js
 */

const { RouterOSClient } = require('routeros-client');
const http = require('http');
const https = require('https');

// ===== CONFIGURAÇÃO =====
const CONFIG = {
  supabase_url: '${import.meta.env.VITE_SUPABASE_URL}',
  supabase_anon_key: '${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}',
  poll_interval_seconds: 60,
  devices: [
    {
      device_id: '${device.id}',
      name: '${device.name}',
      host: '${device.host}',
      port: ${device.api_port || 8728},
      username: '${device.username}',
      password: '${device.password}',
      watch_interfaces: [],
    }
  ]
};

// ===== STATE =====
const previousStates = new Map();

// ===== MIKROTIK CONNECTION =====
async function connectToDevice(device) {
  const api = new RouterOSClient({
    host: device.host,
    port: device.port || 8728,
    user: device.username,
    password: device.password,
    timeout: 15,
  });
  const client = await api.connect();
  return { api, client };
}

async function collectDeviceData(device) {
  let api;
  try {
    const conn = await connectToDevice(device);
    api = conn.api;
    const client = conn.client;
    console.log(\`✅ Conectado a \${device.name} (\${device.host})\`);

    const interfaces = await client.menu('/interface').getAll();
    
    // Coletar taxa de banda em tempo real
    const runningIfaces = (interfaces || []).filter(i => 
      (i.running === 'true' || i.running === true) && 
      (i.disabled !== 'true' && i.disabled !== true)
    );
    const trafficRates = new Map();
    
    // Tentar monitor-traffic
    try {
      const allIfNames = runningIfaces.map(i => i.name).filter(Boolean).join(',');
      if (allIfNames) {
        const monitor = await client.menu('/interface/monitor-traffic')
          .where('interface', allIfNames).where('once', '').getAll();
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
        }
      }
    } catch (e1) {
      for (const iface of runningIfaces) {
        const ifName = iface.name;
        if (!ifName) continue;
        try {
          const monitor = await client.menu('/interface').exec('monitor-traffic', { interface: ifName, once: '' });
          if (monitor && Array.isArray(monitor) && monitor.length > 0) {
            trafficRates.set(ifName, {
              'tx-bits-per-second': parseInt(monitor[0]['tx-bits-per-second'] || monitor[0]['txBitsPerSecond'] || '0') || 0,
              'rx-bits-per-second': parseInt(monitor[0]['rx-bits-per-second'] || monitor[0]['rxBitsPerSecond'] || '0') || 0,
            });
          }
        } catch (_) {}
      }
    }
    // Fallback: estimativa via contadores
    if (trafficRates.size === 0) {
      const stateKey = device.device_id + '_bytes';
      const prevBytes = previousStates.get(stateKey) || {};
      const now = Date.now();
      const elapsed = Math.max(1, (now - (prevBytes._timestamp || now)) / 1000);
      const newBytes = {};
      for (const iface of runningIfaces) {
        const ifName = iface.name;
        if (!ifName) continue;
        const txB = parseInt(iface['tx-byte'] || '0') || 0;
        const rxB = parseInt(iface['rx-byte'] || '0') || 0;
        newBytes[ifName] = { tx: txB, rx: rxB };
        if (prevBytes[ifName]) {
          const txBps = Math.round((Math.max(0, txB - prevBytes[ifName].tx) / elapsed) * 8);
          const rxBps = Math.round((Math.max(0, rxB - prevBytes[ifName].rx) / elapsed) * 8);
          if (txBps > 0 || rxBps > 0) trafficRates.set(ifName, { 'tx-bits-per-second': txBps, 'rx-bits-per-second': rxBps });
        }
      }
      newBytes._timestamp = now;
      previousStates.set(stateKey, newBytes);
    }
    if (trafficRates.size > 0) console.log(\`  📊 Banda: \${trafficRates.size} interfaces\`);
    
    // Enriquecer interfaces com dados de banda
    for (const iface of (interfaces || [])) {
      const rates = trafficRates.get(iface.name);
      if (rates) {
        iface['tx-bits-per-second'] = rates['tx-bits-per-second'];
        iface['rx-bits-per-second'] = rates['rx-bits-per-second'];
      }
    }

    let ipAddresses = []; try { ipAddresses = await client.menu('/ip/address').getAll(); } catch (_) {}
    let pppoeClients = []; try { pppoeClients = await client.menu('/interface/pppoe-client').getAll(); } catch (_) {}
    let identity = ''; try { const r = await client.menu('/system/identity').getAll(); identity = r?.[0]?.name || ''; } catch (_) {}
    let resource = {}; try { const r = await client.menu('/system/resource').getAll(); resource = r?.[0] || {}; } catch (_) {}
    let health = {}; try {
      const h = await client.menu('/system/health').getAll();
      if (h && h.length > 0) {
        if (h[0]?.name && h[0]?.value !== undefined) {
          for (const item of h) health[item.name] = item.value;
        } else { health = h[0] || {}; }
      }
    } catch (_) {}
    let logs = []; try { const r = await client.menu('/log').getAll(); logs = (r || []).slice(-200); } catch (_) {}
    let dhcpLeases = []; try { dhcpLeases = await client.menu('/ip/dhcp-server/lease').getAll(); } catch (_) {}
    let dhcpPools = []; try { dhcpPools = await client.menu('/ip/pool').getAll(); } catch (_) {}
    let dhcpServers = []; try { dhcpServers = await client.menu('/ip/dhcp-server').getAll(); } catch (_) {}

    await api.disconnect();
    return { success: true, identity, resource, health, interfaces: interfaces || [], ipAddresses: ipAddresses || [], pppoeClients: pppoeClients || [], logs, dhcpLeases: dhcpLeases || [], dhcpPools: dhcpPools || [], dhcpServers: dhcpServers || [] };
  } catch (err) {
    if (api) { try { await api.disconnect(); } catch (_) {} }
    return { success: false, error: err.message };
  }
}

// ===== CHANGE DETECTION =====
function detectChanges(deviceId, deviceName, currentInterfaces, watchInterfaces) {
  const changes = [];
  const prevState = previousStates.get(deviceId) || {};
  for (const iface of currentInterfaces) {
    const ifName = iface.name || iface['.id'];
    if (!ifName) continue;
    if (watchInterfaces?.length > 0 && !watchInterfaces.includes(ifName)) continue;
    const isRunning = iface.running === 'true' || iface.running === true;
    const wasRunning = prevState[ifName];
    if (wasRunning !== undefined && wasRunning !== isRunning) {
      changes.push({ interface_name: ifName, previous_status: wasRunning ? 'up' : 'down', current_status: isRunning ? 'up' : 'down', device_name: deviceName });
    }
    prevState[ifName] = isRunning;
  }
  previousStates.set(deviceId, prevState);
  return changes;
}

function detectLogAlerts(logs) {
  const alerts = [];
  const loginKw = ['login failure', 'denied', 'invalid user', 'wrong password', 'authentication failed'];
  const ifaceKw = ['link down', 'disconnected', 'down', 'lost connection'];
  const systemKw = ['error', 'fail', 'critical', 'kernel', 'out of memory', 'watchdog', 'reboot', 'unreachable'];
  for (const log of logs) {
    const msg = (log.message || '').toLowerCase();
    const topic = (log.topics || '').toLowerCase();
    let category = null;
    if (loginKw.some(kw => msg.includes(kw))) category = 'login';
    else if (ifaceKw.some(kw => msg.includes(kw)) || (topic.includes('interface') && msg.includes('down'))) category = 'interface';
    else if (systemKw.some(kw => msg.includes(kw)) || topic.includes('error') || topic.includes('critical') || topic.includes('warning')) category = 'system';
    if (category) alerts.push({ time: log.time || '', topics: log.topics || '', message: log.message || '', category });
  }
  return alerts;
}

function ipToNumber(ip) {
  const parts = ip.trim().split('.');
  return ((parseInt(parts[0]) << 24) + (parseInt(parts[1]) << 16) + (parseInt(parts[2]) << 8) + parseInt(parts[3])) >>> 0;
}

function countPoolCapacity(ranges) {
  if (!ranges) return 0;
  let total = 0;
  for (const part of ranges.split(',')) {
    const t = part.trim();
    if (t.includes('-')) {
      const [s, e] = t.split('-');
      const sn = ipToNumber(s), en = ipToNumber(e);
      if (en >= sn) total += (en - sn + 1);
    }
  }
  return total;
}

function analyzeDhcpLeases(dhcpLeases, dhcpPools, dhcpServers) {
  const totalLeases = dhcpLeases.length;
  const activeLeases = dhcpLeases.filter(l => l.status === 'bound' || l.dynamic === 'true' || l.dynamic === true).length;
  const staticLeases = dhcpLeases.filter(l => l.dynamic === 'false' || l.dynamic === false).length;
  const poolCap = {};
  for (const p of (dhcpPools || [])) { poolCap[p.name || p['.id']] = countPoolCapacity(p.ranges || ''); }
  const srvPool = {};
  for (const s of (dhcpServers || [])) { srvPool[s.name || s['.id']] = s['address-pool'] || s.addressPool || ''; }
  const byServer = {};
  let totalCap = 0;
  for (const s of (dhcpServers || [])) {
    const n = s.name || s['.id'], pn = srvPool[n] || '', cap = poolCap[pn] || 0;
    totalCap += cap;
    byServer[n] = { total: 0, active: 0, capacity: cap, pool: pn };
  }
  for (const l of dhcpLeases) {
    const srv = l.server || l['dhcp-server'] || 'default';
    if (!byServer[srv]) byServer[srv] = { total: 0, active: 0, capacity: 0, pool: '' };
    byServer[srv].total++;
    if (l.status === 'bound') byServer[srv].active++;
  }
  for (const [, info] of Object.entries(byServer)) {
    info.usage_pct = info.capacity > 0 ? Math.round((info.active / info.capacity) * 1000) / 10 : null;
  }
  return { total_leases: totalLeases, active_leases: activeLeases, static_leases: staticLeases, dynamic_leases: totalLeases - staticLeases, total_capacity: totalCap, usage_pct: totalCap > 0 ? Math.round((activeLeases / totalCap) * 1000) / 10 : null, by_server: byServer };
}

// ===== HTTP POST =====
function postJSON(url, data, headers) {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const mod = parsedUrl.protocol === 'https:' ? https : http;
    const body = JSON.stringify(data);
    const req = mod.request(parsedUrl, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body), ...headers }, timeout: 30000 }, (res) => {
      let rb = ''; res.on('data', c => rb += c);
      res.on('end', () => { try { resolve({ status: res.statusCode, data: JSON.parse(rb) }); } catch { resolve({ status: res.statusCode, data: rb }); } });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
    req.write(body); req.end();
  });
}

async function sendToSystem(deviceId, data, changes, logAlerts, dhcpSummary) {
  const url = \`\${CONFIG.supabase_url}/functions/v1/mikrotik-vps-ingest\`;
  try {
    const result = await postJSON(url, { device_id: deviceId, collected_data: data, status_changes: changes, log_alerts: logAlerts, dhcp_summary: dhcpSummary || null }, {
      'Authorization': \`Bearer \${CONFIG.supabase_anon_key}\`, 'apikey': CONFIG.supabase_anon_key
    });
    if (result.status >= 200 && result.status < 300) {
      console.log(\`  📤 Dados enviados (\${data.interfaces?.length || 0} interfaces, \${changes.length} mudanças)\`);
    } else {
      console.error(\`  ❌ Erro: \${result.status}\`, result.data);
    }
  } catch (err) {
    console.error(\`  ❌ Falha: \${err.message}\`);
  }
}

// ===== MAIN =====
async function pollDevice(device) {
  console.log(\`\\n🔄 Coletando \${device.name}...\`);
  const data = await collectDeviceData(device);
  if (!data.success) {
    console.error(\`  ❌ \${data.error}\`);
    await sendToSystem(device.device_id, data, [{ interface_name: 'connection', previous_status: 'up', current_status: 'down', device_name: device.name }], []);
    return;
  }
  const dhcp = analyzeDhcpLeases(data.dhcpLeases, data.dhcpPools, data.dhcpServers);
  const capInfo = dhcp.total_capacity > 0 ? \` | Capacidade: \${dhcp.total_capacity} IPs (\${dhcp.usage_pct}% uso)\` : '';
  console.log(\`  📊 \${data.interfaces.length} interfaces, \${dhcp.total_leases} DHCP leases\${capInfo}\`);
  const changes = detectChanges(device.device_id, device.name, data.interfaces, device.watch_interfaces);
  if (changes.length > 0) {
    console.log(\`  ⚠️  \${changes.length} mudança(s)\`);
    changes.forEach(c => console.log(\`     \${c.current_status === 'up' ? '🟢' : '🔴'} \${c.interface_name}: \${c.previous_status} → \${c.current_status}\`));
  }
  const logAlerts = detectLogAlerts(data.logs);
  await sendToSystem(device.device_id, data, changes, logAlerts, dhcp);
}

async function main() {
  console.log('=' .repeat(50));
  console.log('  MIKROTIK COLLECTOR - ${device.name}');
  console.log('=' .repeat(50));
  console.log('\\n🚀 Coletando estado inicial...');
  for (const d of CONFIG.devices) {
    const data = await collectDeviceData(d);
    if (data.success) {
      detectChanges(d.device_id, d.name, data.interfaces, d.watch_interfaces);
      const dhcp = analyzeDhcpLeases(data.dhcpLeases, data.dhcpPools, data.dhcpServers);
      console.log(\`  ✅ \${d.name}: \${data.interfaces.length} interfaces, \${dhcp.total_leases} DHCP leases\`);
      await sendToSystem(d.device_id, data, [], [], dhcp);
    } else {
      console.error(\`  ❌ \${d.name}: \${data.error}\`);
    }
  }
  console.log('\\n⏰ Monitoramento iniciado...');
  setInterval(async () => { for (const d of CONFIG.devices) await pollDevice(d); }, CONFIG.poll_interval_seconds * 1000);
}

main().catch(err => { console.error('Erro fatal:', err); process.exit(1); });
`;

  const script = isSNMP ? snmpScript : mikrotikScript;
  const slug = device.name.toLowerCase().replace(/[^a-z0-9]/g, '-');
  const fileName = `${isSNMP ? 'snmp' : 'mikrotik'}-collector-${slug}.js`;

  try {
    // Empacota o coletor gerado + instalador de serviço + LEIA-ME em um ZIP.
    await downloadAgentBundle(
      {
        id: 'mikrotik',
        label: `Coletor ${isSNMP ? 'SNMP' : 'MikroTik'} - ${device.name}`,
        zipName: `agente-${isSNMP ? 'snmp' : 'mikrotik'}-${slug}`,
        files: [],
        mainScript: fileName,
        runtime: 'node',
        notes: [
          'O coletor já vem configurado com o dispositivo selecionado.',
          isSNMP ? 'Requer o pacote net-snmp: npm install net-snmp' : 'Requer acesso à API REST do MikroTik (porta 80/443).',
        ],
      },
      {
        url: import.meta.env.VITE_SUPABASE_URL,
        key: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        extraFiles: { [fileName]: script },
      },
    );
    toast.success(`Pacote ${isSNMP ? 'SNMP' : 'MikroTik'} baixado com sucesso!`);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Falha desconhecida';
    toast.error('Erro ao gerar o pacote', { description: message });
  }
};

