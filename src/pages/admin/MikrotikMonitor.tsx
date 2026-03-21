import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import AdminLayout from "@/components/admin/AdminLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { Loader2, Plus, RefreshCw, Trash2, Edit, Wifi, WifiOff, Activity, ArrowUpDown, Network, Target, AlertTriangle, Download, Server, ScrollText, Globe, TrendingUp, Thermometer, Cpu, CalendarDays, Clock, MoreHorizontal, Zap, MemoryStick } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, Legend, PieChart, Pie, Cell } from "recharts";

interface MikrotikDevice {
  id: string;
  client_id: string;
  name: string;
  host: string;
  port: number;
  username: string;
  password: string;
  use_ssl: boolean;
  is_active: boolean;
  last_polled_at: string | null;
  last_error: string | null;
  created_at: string;
  proxy_url: string | null;
  api_port: number | null;
  device_type: string;
  snmp_community: string | null;
  snmp_version: string | null;
  client?: { full_name: string };
  last_dhcp_summary?: any;
  last_log_alerts?: any[];
  last_system_info?: any;
}

interface MikrotikInterface {
  id: string;
  device_id: string;
  interface_name: string;
  interface_type: string | null;
  status: string;
  running: boolean;
  disabled: boolean;
  mac_address: string | null;
  tx_rate: number;
  rx_rate: number;
  tx_bytes: number;
  rx_bytes: number;
  tx_packets: number;
  rx_packets: number;
  tx_errors: number;
  rx_errors: number;
  tx_drops: number;
  rx_drops: number;
  speed: string | null;
  ip_address: string | null;
  uptime: string | null;
  pppoe_user: string | null;
  pppoe_service: string | null;
  updated_at: string;
}

interface PingTarget {
  id: string;
  device_id: string;
  target_ip: string;
  label: string;
  is_active: boolean;
  latency_ms: number | null;
  packet_loss_pct: number | null;
  last_checked_at: string | null;
}

interface Client {
  id: string;
  full_name: string;
}

const emptyDevice = {
  name: "", host: "", port: 443, username: "admin", password: "", use_ssl: true, client_id: "", proxy_url: "", api_port: 8728, device_type: "mikrotik", snmp_community: "public", snmp_version: "2c",
  snmp_security_level: "noAuthNoPriv", snmp_user: "", snmp_auth_protocol: "MD5", snmp_auth_passphrase: "", snmp_priv_protocol: "DES", snmp_priv_passphrase: "",
};

const formatBytes = (bytes: number) => {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
};

const formatBitsPerSec = (bps: number) => {
  if (!bps || bps === 0) return "0 bps";
  if (bps >= 1_000_000_000) return (bps / 1_000_000_000).toFixed(2) + " Gbps";
  if (bps >= 1_000_000) return (bps / 1_000_000).toFixed(2) + " Mbps";
  if (bps >= 1_000) return (bps / 1_000).toFixed(1) + " Kbps";
  return bps + " bps";
};

const generateCollectorScript = (device: MikrotikDevice) => {
  const script = `#!/usr/bin/env node
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

  const blob = new Blob([script], { type: 'text/javascript' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `mikrotik-collector-${device.name.toLowerCase().replace(/[^a-z0-9]/g, '-')}.js`;
  a.click();
  URL.revokeObjectURL(url);
  toast.success('Script baixado com sucesso!');
};

const MikrotikMonitor = () => {
  const [devices, setDevices] = useState<MikrotikDevice[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [selectedDevice, setSelectedDevice] = useState<MikrotikDevice | null>(null);
  const [interfaces, setInterfaces] = useState<MikrotikInterface[]>([]);
  const [pingTargets, setPingTargets] = useState<PingTarget[]>([]);
  const [loading, setLoading] = useState(true);
  const [polling, setPolling] = useState<string | null>(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showPingDialog, setShowPingDialog] = useState(false);
  const [deviceForm, setDeviceForm] = useState(emptyDevice);
  const [editDevice, setEditDevice] = useState<MikrotikDevice | null>(null);
  const [deleteDevice, setDeleteDevice] = useState<MikrotikDevice | null>(null);
  const [pingForm, setPingForm] = useState({ target_ip: "", label: "" });
  const [showPassword, setShowPassword] = useState(false);
  const [dhcpHistory, setDhcpHistory] = useState<any[]>([]);
  const [trafficHistory, setTrafficHistory] = useState<any[]>([]);
  const [selectedTrafficIface, setSelectedTrafficIface] = useState<string>("");
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [systemHistory, setSystemHistory] = useState<any[]>([]);
  const [interfaceEvents, setInterfaceEvents] = useState<any[]>([]);

  const fetchDevices = useCallback(async () => {
    const { data } = await supabase
      .from("mikrotik_devices")
      .select("*, client:clients(full_name)")
      .order("name");
    setDevices((data as any) || []);
    setLoading(false);
  }, []);

  const fetchClients = async () => {
    const { data } = await supabase.from("clients").select("id, full_name").order("full_name");
    setClients(data || []);
  };

  const fetchInterfaces = async (deviceId: string) => {
    const { data } = await supabase
      .from("mikrotik_interfaces")
      .select("*")
      .eq("device_id", deviceId)
      .order("interface_name");
    setInterfaces((data as any) || []);
  };

  const fetchInterfaceEvents = async (deviceId: string) => {
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { data } = await supabase
      .from("mikrotik_interface_events")
      .select("*")
      .eq("device_id", deviceId)
      .gte("recorded_at", since)
      .order("recorded_at", { ascending: false })
      .limit(200);
    setInterfaceEvents((data as any) || []);
  };

  const fetchPingTargets = async (deviceId: string) => {
    const { data } = await supabase
      .from("mikrotik_ping_targets")
      .select("*")
      .eq("device_id", deviceId)
      .order("label");
    setPingTargets((data as any) || []);
  };

  useEffect(() => {
    fetchDevices();
    fetchClients();
  }, [fetchDevices]);

  // Auto-refresh a cada 30 segundos
  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(() => {
      fetchDevices();
      if (selectedDevice) {
        fetchInterfaces(selectedDevice.id);
        fetchInterfaceEvents(selectedDevice.id);
        fetchDhcpHistory(selectedDevice.id);
        fetchTrafficHistory(selectedDevice.id);
        fetchSystemHistory(selectedDevice.id);
      }
    }, 30000);
    return () => clearInterval(interval);
  }, [autoRefresh, selectedDevice]);

  // Keep selectedDevice in sync with devices array
  useEffect(() => {
    if (selectedDevice) {
      const updated = devices.find(d => d.id === selectedDevice.id);
      if (updated && JSON.stringify(updated) !== JSON.stringify(selectedDevice)) {
        setSelectedDevice(updated);
      }
    }
  }, [devices]);

  const fetchDhcpHistory = async (deviceId: string) => {
    const { data } = await supabase
      .from("mikrotik_dhcp_history")
      .select("*")
      .eq("device_id", deviceId)
      .order("recorded_at", { ascending: true })
      .limit(100);
    setDhcpHistory((data || []).map((d: any) => ({
      ...d,
      time: new Date(d.recorded_at).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }),
    })));
  };

  const fetchTrafficHistory = async (deviceId: string) => {
    const { data } = await supabase
      .from("mikrotik_traffic_history")
      .select("*")
      .eq("device_id", deviceId)
      .order("recorded_at", { ascending: true })
      .limit(500);
    const records = data || [];
    // Get unique interface names
    const ifaceNames = [...new Set(records.map((r: any) => r.interface_name))];
    if (ifaceNames.length > 0 && !selectedTrafficIface) {
      setSelectedTrafficIface(ifaceNames[0]);
    }
    // Calculate deltas between consecutive records per interface
    const prevByIface: Record<string, { tx: number; rx: number }> = {};
    const processed = records.map((d: any) => {
      const prev = prevByIface[d.interface_name];
      let tx_mb = 0;
      let rx_mb = 0;
      if (prev) {
        const txDelta = d.tx_bytes - prev.tx;
        const rxDelta = d.rx_bytes - prev.rx;
        // Only use positive deltas (counter resets on reboot)
        tx_mb = txDelta > 0 ? Number((txDelta / (1024 * 1024)).toFixed(2)) : 0;
        rx_mb = rxDelta > 0 ? Number((rxDelta / (1024 * 1024)).toFixed(2)) : 0;
      }
      prevByIface[d.interface_name] = { tx: d.tx_bytes, rx: d.rx_bytes };
      return {
        ...d,
        time: new Date(d.recorded_at).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }),
        tx_mb,
        rx_mb,
      };
    });
    setTrafficHistory(processed);
  };

  const fetchSystemHistory = async (deviceId: string) => {
    const { data } = await supabase
      .from("mikrotik_system_history")
      .select("*")
      .eq("device_id", deviceId)
      .order("recorded_at", { ascending: true })
      .limit(200);
    setSystemHistory((data || []).map((d: any) => ({
      ...d,
      time: new Date(d.recorded_at).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }),
    })));
  };

  useEffect(() => {
    if (selectedDevice) {
      fetchInterfaces(selectedDevice.id);
      fetchInterfaceEvents(selectedDevice.id);
      fetchPingTargets(selectedDevice.id);
      fetchDhcpHistory(selectedDevice.id);
      fetchTrafficHistory(selectedDevice.id);
      fetchSystemHistory(selectedDevice.id);
      setSelectedTrafficIface("");
    }
  }, [selectedDevice]);

  const handleCreateDevice = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!deviceForm.client_id || !deviceForm.name || !deviceForm.host) {
      toast.error("Preencha todos os campos obrigatórios");
      return;
    }
    const insertData = { 
      ...deviceForm, 
      proxy_url: deviceForm.proxy_url || null, 
      api_port: deviceForm.api_port || 8728,
      device_type: deviceForm.device_type || 'mikrotik',
      snmp_community: deviceForm.snmp_community || 'public',
      snmp_version: deviceForm.snmp_version || '2c',
      snmp_security_level: deviceForm.snmp_security_level || 'noAuthNoPriv',
      snmp_user: deviceForm.snmp_user || null,
      snmp_auth_protocol: deviceForm.snmp_auth_protocol || 'MD5',
      snmp_auth_passphrase: deviceForm.snmp_auth_passphrase || null,
      snmp_priv_protocol: deviceForm.snmp_priv_protocol || 'DES',
      snmp_priv_passphrase: deviceForm.snmp_priv_passphrase || null,
    };
    const { error } = await supabase.from("mikrotik_devices").insert(insertData);
    if (error) { toast.error(error.message); return; }
    toast.success("Dispositivo adicionado");
    setShowCreateDialog(false);
    setDeviceForm(emptyDevice);
    fetchDevices();
  };

  const handleEditDevice = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editDevice) return;
    const { error } = await supabase.from("mikrotik_devices").update({
      name: editDevice.name,
      host: editDevice.host,
      port: editDevice.port,
      username: editDevice.username,
      password: editDevice.password,
      use_ssl: editDevice.use_ssl,
      client_id: editDevice.client_id,
      is_active: editDevice.is_active,
      proxy_url: editDevice.proxy_url || null,
      api_port: editDevice.api_port || 8728,
      device_type: editDevice.device_type || 'mikrotik',
      snmp_community: editDevice.snmp_community || 'public',
      snmp_version: editDevice.snmp_version || '2c',
    }).eq("id", editDevice.id);
    if (error) { toast.error(error.message); return; }
    toast.success("Dispositivo atualizado");
    setShowEditDialog(false);
    fetchDevices();
  };

  const handleDeleteDevice = async () => {
    if (!deleteDevice) return;
    const { error } = await supabase.from("mikrotik_devices").delete().eq("id", deleteDevice.id);
    if (error) { toast.error(error.message); return; }
    toast.success("Dispositivo removido");
    setShowDeleteDialog(false);
    if (selectedDevice?.id === deleteDevice.id) setSelectedDevice(null);
    fetchDevices();
  };

  const handlePollDevice = async (deviceId: string) => {
    setPolling(deviceId);
    try {
      const { data, error } = await supabase.functions.invoke("mikrotik-monitor", {
        body: { action: "poll", device_id: deviceId },
      });
      if (error) throw error;
      if (data?.success) {
        toast.success(`Coletado: ${data.interfaces} interfaces`);
        if (selectedDevice?.id === deviceId) {
          fetchInterfaces(deviceId);
          fetchPingTargets(deviceId);
        }
        fetchDevices();
      } else {
        toast.error(data?.error || "Erro ao coletar dados");
      }
    } catch (err: any) {
      toast.error(err.message || "Erro de conexão");
    }
    setPolling(null);
  };

  const handleSendSummary = async (deviceId: string) => {
    setPolling(deviceId);
    try {
      const { data, error } = await supabase.functions.invoke("mikrotik-daily-summary", {
        body: { device_id: deviceId },
      });
      if (error) throw error;
      if (data?.whatsapp_sent) {
        toast.success("Resumo enviado via WhatsApp!");
      } else {
        toast.info(data?.error || "Resumo processado, mas WhatsApp não foi enviado");
      }
    } catch (err: any) {
      toast.error(err.message || "Erro ao enviar resumo");
    }
    setPolling(null);
  };

  const handleSendWeeklyReport = async () => {
    setPolling("weekly");
    try {
      const { data, error } = await supabase.functions.invoke("mikrotik-weekly-report");
      if (error) throw error;
      if (data?.whatsapp_sent) {
        toast.success("Relatório semanal enviado via WhatsApp!");
      } else {
        toast.info(data?.error || "Relatório processado, mas WhatsApp não foi enviado");
      }
    } catch (err: any) {
      toast.error(err.message || "Erro ao enviar relatório semanal");
    }
    setPolling(null);
  };

  const handleAddPingTarget = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDevice || !pingForm.target_ip) return;
    const { error } = await supabase.from("mikrotik_ping_targets").insert({
      device_id: selectedDevice.id,
      target_ip: pingForm.target_ip,
      label: pingForm.label || pingForm.target_ip,
    });
    if (error) { toast.error(error.message); return; }
    toast.success("Alvo de ping adicionado");
    setShowPingDialog(false);
    setPingForm({ target_ip: "", label: "" });
    fetchPingTargets(selectedDevice.id);
  };

  const handleDeletePingTarget = async (id: string) => {
    await supabase.from("mikrotik_ping_targets").delete().eq("id", id);
    if (selectedDevice) fetchPingTargets(selectedDevice.id);
  };

  const renderDeviceForm = (form: any, setForm: any, isEdit = false) => (
    <div className="space-y-4">
      <div>
        <Label>Cliente *</Label>
        <Select value={form.client_id} onValueChange={(v) => setForm({ ...form, client_id: v })}>
          <SelectTrigger><SelectValue placeholder="Selecione o cliente" /></SelectTrigger>
          <SelectContent>
            {clients.map((c) => (
              <SelectItem key={c.id} value={c.id}>{c.full_name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label>Tipo de Dispositivo *</Label>
        <Select value={form.device_type || 'mikrotik'} onValueChange={(v) => setForm({ ...form, device_type: v })}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="mikrotik">Mikrotik (RouterOS)</SelectItem>
            <SelectItem value="snmp">SNMP (TP-Link, Ubiquiti, etc.)</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label>Nome do dispositivo *</Label>
        <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder={form.device_type === 'snmp' ? 'TP-Link ER605 - Matriz' : 'RB 750 - Matriz'} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>Host/IP *</Label>
          <Input value={form.host} onChange={(e) => setForm({ ...form, host: e.target.value })} placeholder="192.168.1.1 ou ddns.exemplo.com" />
        </div>
        <div>
          <Label>Porta</Label>
          <Input type="number" value={form.port} onChange={(e) => setForm({ ...form, port: parseInt(e.target.value) || 443 })} />
        </div>
      </div>

      {form.device_type === 'snmp' ? (
        <>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Comunidade SNMP</Label>
              <Input value={form.snmp_community || 'public'} onChange={(e) => setForm({ ...form, snmp_community: e.target.value })} placeholder="public" />
            </div>
            <div>
              <Label>Versão SNMP</Label>
              <Select value={form.snmp_version || '2c'} onValueChange={(v) => setForm({ ...form, snmp_version: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">v1</SelectItem>
                  <SelectItem value="2c">v2c</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">Coleta via SNMP (IF-MIB). Certifique-se de que o SNMP está habilitado no dispositivo.</p>
        </>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Usuário</Label>
              <Input value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} />
            </div>
            <div>
              <Label>Senha</Label>
              <Input type={showPassword ? "text" : "password"} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Switch checked={form.use_ssl} onCheckedChange={(v) => setForm({ ...form, use_ssl: v })} />
              <Label>Usar SSL (HTTPS)</Label>
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={showPassword} onCheckedChange={setShowPassword} />
              <Label>Mostrar senha</Label>
            </div>
          </div>
          <div className="border-t pt-4 mt-2">
            <p className="text-sm font-medium mb-2 text-muted-foreground">Proxy (para RouterOS 6.x sem API REST)</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>URL do Proxy</Label>
                <Input value={form.proxy_url || ""} onChange={(e) => setForm({ ...form, proxy_url: e.target.value })} placeholder="http://seu-vps:3700" />
              </div>
              <div>
                <Label>Porta API (8728)</Label>
                <Input type="number" value={form.api_port || 8728} onChange={(e) => setForm({ ...form, api_port: parseInt(e.target.value) || 8728 })} />
              </div>
            </div>
            <p className="text-xs text-muted-foreground mt-1">Preencha apenas se o equipamento não suporta API REST (RouterOS &lt; 7.1)</p>
          </div>
        </>
      )}
      {isEdit && (
        <div className="flex items-center gap-2">
          <Switch checked={form.is_active} onCheckedChange={(v) => setForm({ ...form, is_active: v })} />
          <Label>Ativo</Label>
        </div>
      )}
    </div>
  );

  const getDeviceHealthColor = (device: MikrotikDevice) => {
    if (device.last_error) return "border-destructive/50";
    if (!device.last_polled_at) return "border-border";
    const info = device.last_system_info;
    if (info) {
      const health = info.health || {};
      const temp = health['cpu-temperature'] || health.temperature || 0;
      if (Number(temp) > 70) return "border-destructive/50";
      if (Number(temp) > 55) return "border-yellow-500/50";
    }
    return "border-primary/30";
  };

  const formatUptime = (uptime: string | undefined) => {
    if (!uptime) return null;
    return uptime.replace(/(\d+)w/, '$1sem ').replace(/(\d+)d/, '$1d ').replace(/(\d+)h/, '$1h').replace(/(\d+)m.*/, '$1m');
  };

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Server className="w-6 h-6 text-primary" />
              Monitoramento de Rede
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              {devices.length} dispositivo{devices.length !== 1 ? "s" : ""} cadastrado{devices.length !== 1 ? "s" : ""}
              {devices.filter(d => d.is_active && !d.last_error && d.last_polled_at).length > 0 && (
                <span className="ml-2 text-primary">• {devices.filter(d => d.is_active && !d.last_error && d.last_polled_at).length} online</span>
              )}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg border bg-card">
              <Switch checked={autoRefresh} onCheckedChange={setAutoRefresh} id="auto-refresh" />
              <Label htmlFor="auto-refresh" className="text-xs text-muted-foreground whitespace-nowrap cursor-pointer">
                Auto-refresh 30s
              </Label>
            </div>
            <Button onClick={() => { setDeviceForm(emptyDevice); setShowCreateDialog(true); }}>
              <Plus className="w-4 h-4 mr-2" /> Novo Dispositivo
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Device List */}
          <div className="space-y-3">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Dispositivos</h2>
            {loading ? (
              <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin" /></div>
            ) : devices.length === 0 ? (
              <Card><CardContent className="py-8 text-center text-muted-foreground">Nenhum dispositivo cadastrado</CardContent></Card>
            ) : (
              devices.map((device) => {
                const isSelected = selectedDevice?.id === device.id;
                const sysInfo = device.last_system_info || {};
                const health = sysInfo.health || {};
                const cpuTemp = health['cpu-temperature'] || health.temperature || health['board-temperature1'] || null;
                const cpuLoad = sysInfo['cpu-load'] || null;
                const memTotal = sysInfo['total-memory'] ? parseInt(sysInfo['total-memory']) : 0;
                const memFree = sysInfo['free-memory'] ? parseInt(sysInfo['free-memory']) : 0;
                const memPct = memTotal > 0 ? Math.round(((memTotal - memFree) / memTotal) * 100) : null;
                const uptime = formatUptime(sysInfo.uptime);
                const isOnline = device.is_active && !device.last_error && device.last_polled_at;
                const timeSincePoll = device.last_polled_at ? Math.round((Date.now() - new Date(device.last_polled_at).getTime()) / 60000) : null;

                return (
                  <Card
                    key={device.id}
                    className={`cursor-pointer transition-all duration-200 hover:shadow-md ${isSelected ? "border-primary bg-accent/30 shadow-md ring-1 ring-primary/20" : getDeviceHealthColor(device)}`}
                    onClick={() => setSelectedDevice(device)}
                  >
                    <CardContent className="p-4">
                      {/* Top row: name + status */}
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${isOnline ? "bg-green-500 shadow-[0_0_6px_rgba(34,197,94,0.5)]" : device.last_error ? "bg-destructive" : "bg-muted-foreground/40"}`} />
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <p className="font-semibold text-sm truncate">{device.name}</p>
                              {(device as any).device_type === 'snmp' && (
                                <Badge variant="outline" className="text-[9px] px-1 py-0 h-4 shrink-0">SNMP</Badge>
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground truncate">{device.client?.full_name}</p>
                          </div>
                        </div>
                        <Badge variant={device.is_active ? (isOnline ? "default" : "destructive") : "secondary"} className="text-[10px] shrink-0">
                          {!device.is_active ? "Inativo" : isOnline ? "Online" : "Offline"}
                        </Badge>
                      </div>

                      {/* System metrics row */}
                      {(cpuTemp || cpuLoad !== null || memPct !== null || uptime) && (
                        <div className="flex items-center gap-3 mt-3 flex-wrap">
                          {cpuTemp && (
                            <div className="flex items-center gap-1 text-xs" title="Temperatura CPU">
                              <Thermometer className={`w-3 h-3 ${Number(cpuTemp) > 70 ? "text-destructive" : Number(cpuTemp) > 55 ? "text-yellow-500" : "text-muted-foreground"}`} />
                              <span className="font-medium">{cpuTemp}°C</span>
                            </div>
                          )}
                          {cpuLoad !== null && (
                            <div className="flex items-center gap-1 text-xs" title="CPU Load">
                              <Cpu className={`w-3 h-3 ${Number(cpuLoad) > 80 ? "text-destructive" : "text-muted-foreground"}`} />
                              <span className="font-medium">{cpuLoad}%</span>
                            </div>
                          )}
                          {memPct !== null && (
                            <div className="flex items-center gap-1 text-xs" title="Memória">
                              <MemoryStick className={`w-3 h-3 ${memPct > 80 ? "text-destructive" : "text-muted-foreground"}`} />
                              <span className="font-medium">{memPct}%</span>
                            </div>
                          )}
                          {uptime && (
                            <div className="flex items-center gap-1 text-xs text-muted-foreground" title="Uptime">
                              <Clock className="w-3 h-3" />
                              <span>{uptime}</span>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Host + last poll */}
                      <div className="flex items-center justify-between mt-2">
                        <span className="text-xs text-muted-foreground font-mono">{device.host}:{device.port}</span>
                        {timeSincePoll !== null && (
                          <span className="text-[10px] text-muted-foreground">
                            {timeSincePoll < 1 ? "agora" : timeSincePoll < 60 ? `${timeSincePoll}min atrás` : `${Math.floor(timeSincePoll / 60)}h atrás`}
                          </span>
                        )}
                      </div>

                      {/* Error message */}
                      {device.last_error && (
                        device.last_error.includes("ROUTEROS 6.x DETECTADO") ? (
                          <div className="mt-2 p-2 rounded bg-accent border border-border">
                            <div className="flex items-start gap-1.5">
                              <AlertTriangle className="w-3.5 h-3.5 text-yellow-500 mt-0.5 shrink-0" />
                              <div>
                                <p className="text-xs font-medium text-yellow-600 dark:text-yellow-400">RouterOS 6.x detectado</p>
                                <p className="text-xs text-muted-foreground mt-0.5">Sem API REST. Configure um proxy.</p>
                                {!device.proxy_url && (
                                  <Button size="sm" variant="outline" className="mt-1.5 h-6 text-xs" onClick={(e) => { e.stopPropagation(); setEditDevice({ ...device }); setShowEditDialog(true); }}>
                                    Configurar Proxy
                                  </Button>
                                )}
                              </div>
                            </div>
                          </div>
                        ) : (
                          <p className="mt-2 text-xs text-destructive truncate">{device.last_error}</p>
                        )
                      )}

                      {/* Action buttons */}
                      <div className="flex items-center gap-0.5 mt-3 pt-2 border-t border-border">
                        <TooltipProvider delayDuration={300}>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={(e) => { e.stopPropagation(); handlePollDevice(device.id); }} disabled={polling === device.id}>
                                {polling === device.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Coletar dados</TooltipContent>
                          </Tooltip>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={(e) => { e.stopPropagation(); handleSendSummary(device.id); }} disabled={!!polling}>
                                <ScrollText className="w-3.5 h-3.5 text-primary" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Resumo diário WhatsApp</TooltipContent>
                          </Tooltip>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={(e) => { e.stopPropagation(); handleSendWeeklyReport(); }} disabled={!!polling}>
                                {polling === "weekly" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CalendarDays className="w-3.5 h-3.5" />}
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Relatório semanal</TooltipContent>
                          </Tooltip>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={(e) => { e.stopPropagation(); generateCollectorScript(device); }}>
                                <Download className="w-3.5 h-3.5" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Baixar collector</TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                        <div className="flex-1" />
                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={(e) => { e.stopPropagation(); setEditDevice({ ...device }); setShowEditDialog(true); }}>
                          <Edit className="w-3.5 h-3.5" />
                        </Button>
                        <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive" onClick={(e) => { e.stopPropagation(); setDeleteDevice(device); setShowDeleteDialog(true); }}>
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })
            )}
          </div>

          {/* Device Detail */}
          <div className="lg:col-span-2">
            {selectedDevice ? (
              <>
                {/* Device detail header */}
                <Card className="mb-4">
                  <CardContent className="py-3 px-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className={`w-3 h-3 rounded-full ${!selectedDevice.last_error && selectedDevice.last_polled_at ? "bg-green-500" : "bg-destructive"}`} />
                        <div>
                          <h2 className="font-bold text-lg">{selectedDevice.name}</h2>
                          <p className="text-xs text-muted-foreground">{selectedDevice.client?.full_name} • {selectedDevice.host}:{selectedDevice.port}</p>
                        </div>
                      </div>
                      <Button size="sm" variant="outline" onClick={() => handlePollDevice(selectedDevice.id)} disabled={polling === selectedDevice.id}>
                        {polling === selectedDevice.id ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <RefreshCw className="w-4 h-4 mr-1" />}
                        Atualizar
                      </Button>
                    </div>
                  </CardContent>
                </Card>

                <Tabs defaultValue="interfaces">
                  <TabsList className="flex-wrap h-auto gap-1 w-full justify-start">
                    <TabsTrigger value="interfaces"><Activity className="w-4 h-4 mr-1" /> Interfaces</TabsTrigger>
                    <TabsTrigger value="bandwidth"><Zap className="w-4 h-4 mr-1" /> Banda</TabsTrigger>
                    <TabsTrigger value="traffic"><ArrowUpDown className="w-4 h-4 mr-1" /> Tráfego</TabsTrigger>
                    <TabsTrigger value="dhcp"><Globe className="w-4 h-4 mr-1" /> DHCP</TabsTrigger>
                    <TabsTrigger value="logs"><ScrollText className="w-4 h-4 mr-1" /> Logs</TabsTrigger>
                    <TabsTrigger value="system"><Server className="w-4 h-4 mr-1" /> Sistema</TabsTrigger>
                    <TabsTrigger value="ping"><Target className="w-4 h-4 mr-1" /> Ping</TabsTrigger>
                  </TabsList>

                <TabsContent value="interfaces" className="mt-4">
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base">Interfaces</CardTitle>
                    </CardHeader>
                    <CardContent>
                      {interfaces.length === 0 ? (
                        <p className="text-center text-muted-foreground py-4">Nenhuma interface. Clique em Atualizar para coletar.</p>
                      ) : (
                        <div className="overflow-x-auto">
                          <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Interface</TableHead>
                              <TableHead>Tipo</TableHead>
                              <TableHead>Status</TableHead>
                              <TableHead>IP</TableHead>
                              <TableHead>MAC</TableHead>
                              <TableHead>PPPoE</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {interfaces.map((iface) => (
                              <TableRow key={iface.id} className={iface.disabled ? "opacity-50" : ""}>
                                <TableCell className="font-medium text-sm">{iface.interface_name}</TableCell>
                                <TableCell className="text-xs">{iface.interface_type || "-"}</TableCell>
                                <TableCell>
                                  <Badge variant={iface.running ? "default" : "destructive"} className="text-xs">
                                    {iface.running ? "UP" : "DOWN"}
                                  </Badge>
                                </TableCell>
                                <TableCell className="text-xs">{iface.ip_address || "-"}</TableCell>
                                <TableCell className="text-xs font-mono">{iface.mac_address || "-"}</TableCell>
                                <TableCell className="text-xs">
                                  {iface.pppoe_user ? (
                                    <span>{iface.pppoe_user}{iface.uptime ? ` (${iface.uptime})` : ""}</span>
                                  ) : "-"}
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  {/* Timeline de eventos de interface */}
                  {interfaceEvents.length > 0 && (
                    <Card className="mt-4">
                      <CardHeader className="pb-3">
                        <CardTitle className="text-base flex items-center gap-2">
                          <Clock className="w-4 h-4" />
                          Histórico de Eventos (últimos 7 dias)
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        {(() => {
                          const groupedByIface: Record<string, any[]> = {};
                          for (const evt of interfaceEvents) {
                            if (!groupedByIface[evt.interface_name]) groupedByIface[evt.interface_name] = [];
                            groupedByIface[evt.interface_name].push(evt);
                          }
                          return (
                            <div className="space-y-4">
                              {Object.entries(groupedByIface).map(([ifaceName, events]) => (
                                <div key={ifaceName}>
                                  <h4 className="text-sm font-semibold mb-2 flex items-center gap-2">
                                    <Activity className="w-3.5 h-3.5" />
                                    {ifaceName}
                                    <Badge variant="outline" className="text-xs">{events.length} eventos</Badge>
                                  </h4>
                                  <div className="relative border-l-2 border-border ml-2 pl-4 space-y-2">
                                    {events.slice(0, 20).map((evt: any) => {
                                      const isDown = evt.event_type === "down";
                                      const time = new Date(evt.recorded_at);
                                      const timeStr = time.toLocaleString("pt-BR", {
                                        day: "2-digit", month: "2-digit",
                                        hour: "2-digit", minute: "2-digit", second: "2-digit",
                                        timeZone: "America/Sao_Paulo",
                                      });
                                      return (
                                        <div key={evt.id} className="relative flex items-start gap-3">
                                          <div className={`absolute -left-[1.35rem] top-1 w-3 h-3 rounded-full border-2 border-background ${isDown ? "bg-destructive" : "bg-green-500"}`} />
                                          <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2">
                                              <Badge variant={isDown ? "destructive" : "default"} className="text-xs">
                                                {isDown ? (
                                                  <><WifiOff className="w-3 h-3 mr-1" /> DOWN</>
                                                ) : (
                                                  <><Wifi className="w-3 h-3 mr-1" /> UP</>
                                                )}
                                              </Badge>
                                              <span className="text-xs text-muted-foreground">{timeStr}</span>
                                            </div>
                                          </div>
                                        </div>
                                      );
                                    })}
                                    {events.length > 20 && (
                                      <p className="text-xs text-muted-foreground">... e mais {events.length - 20} eventos</p>
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>
                          );
                        })()}
                      </CardContent>
                    </Card>
                  )}
                </TabsContent>

                <TabsContent value="bandwidth" className="mt-4">
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base flex items-center gap-2">
                        <Zap className="w-4 h-4" />
                        Consumo de Banda em Tempo Real
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      {(() => {
                        const runningIfaces = interfaces.filter(i => i.running && !i.disabled);
                        if (runningIfaces.length === 0) return (
                          <p className="text-center text-muted-foreground py-4">Nenhuma interface ativa. Clique em Atualizar para coletar.</p>
                        );
                        return (
                          <div className="space-y-4">
                            {/* Summary cards */}
                            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                              {runningIfaces.map((iface) => (
                                <div key={iface.id} className="p-3 rounded-lg border bg-card space-y-2">
                                  <div className="flex items-center justify-between">
                                    <p className="text-sm font-semibold truncate">{iface.interface_name}</p>
                                    <Badge variant="default" className="text-[10px]">UP</Badge>
                                  </div>
                                  <div className="space-y-1">
                                    <div className="flex items-center justify-between text-xs">
                                      <span className="text-muted-foreground">↑ TX</span>
                                      <span className="font-mono font-medium text-primary">{formatBitsPerSec(iface.tx_rate)}</span>
                                    </div>
                                    <div className="flex items-center justify-between text-xs">
                                      <span className="text-muted-foreground">↓ RX</span>
                                      <span className="font-mono font-medium text-chart-2">{formatBitsPerSec(iface.rx_rate)}</span>
                                    </div>
                                  </div>
                                  {iface.speed && (
                                    <p className="text-[10px] text-muted-foreground">Link: {iface.speed}</p>
                                  )}
                                </div>
                              ))}
                            </div>

                            {/* Table view */}
                            <div className="overflow-x-auto">
                              <Table>
                                <TableHeader>
                                  <TableRow>
                                    <TableHead>Interface</TableHead>
                                    <TableHead>Tipo</TableHead>
                                    <TableHead>↑ TX Rate</TableHead>
                                    <TableHead>↓ RX Rate</TableHead>
                                    <TableHead>TX Total</TableHead>
                                    <TableHead>RX Total</TableHead>
                                    <TableHead>Velocidade</TableHead>
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {runningIfaces.map((iface) => (
                                    <TableRow key={iface.id}>
                                      <TableCell className="font-medium text-sm">{iface.interface_name}</TableCell>
                                      <TableCell className="text-xs">{iface.interface_type || "-"}</TableCell>
                                      <TableCell className="text-xs font-mono text-primary">{formatBitsPerSec(iface.tx_rate)}</TableCell>
                                      <TableCell className="text-xs font-mono text-chart-2">{formatBitsPerSec(iface.rx_rate)}</TableCell>
                                      <TableCell className="text-xs">{formatBytes(iface.tx_bytes)}</TableCell>
                                      <TableCell className="text-xs">{formatBytes(iface.rx_bytes)}</TableCell>
                                      <TableCell className="text-xs">{iface.speed || "-"}</TableCell>
                                    </TableRow>
                                  ))}
                                </TableBody>
                              </Table>
                            </div>
                          </div>
                        );
                      })()}
                    </CardContent>
                  </Card>

                  {/* Gráficos de banda por interface */}
                  {trafficHistory.length > 1 && (() => {
                    const ifaceNames = [...new Set(trafficHistory.map(r => r.interface_name))];
                    return (
                      <div className="space-y-4 mt-4">
                        {ifaceNames.map((ifaceName) => {
                          const filtered = trafficHistory.filter(r => r.interface_name === ifaceName);
                          if (filtered.length < 2) return null;
                          return (
                            <Card key={ifaceName}>
                              <CardHeader className="pb-3">
                                <CardTitle className="text-sm flex items-center gap-2">
                                  <TrendingUp className="w-4 h-4" />
                                  Histórico de Banda - {ifaceName}
                                </CardTitle>
                              </CardHeader>
                              <CardContent>
                                <ResponsiveContainer width="100%" height={220}>
                                  <LineChart data={filtered}>
                                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                                    <XAxis dataKey="time" tick={{ fontSize: 10 }} />
                                    <YAxis tick={{ fontSize: 10 }} unit=" MB" />
                                    <RechartsTooltip formatter={(value: number) => `${value} MB`} />
                                    <Legend />
                                    <Line type="monotone" dataKey="tx_mb" name="TX (MB)" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
                                    <Line type="monotone" dataKey="rx_mb" name="RX (MB)" stroke="hsl(var(--chart-2))" strokeWidth={2} dot={false} />
                                  </LineChart>
                                </ResponsiveContainer>
                              </CardContent>
                            </Card>
                          );
                        })}
                      </div>
                    );
                  })()}
                </TabsContent>

                <TabsContent value="traffic" className="mt-4">
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base">Tráfego e Erros</CardTitle>
                    </CardHeader>
                    <CardContent>
                      {interfaces.length === 0 ? (
                        <p className="text-center text-muted-foreground py-4">Nenhuma interface coletada.</p>
                      ) : (
                        <div className="overflow-x-auto">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>Interface</TableHead>
                                <TableHead>TX Bytes</TableHead>
                                <TableHead>RX Bytes</TableHead>
                                <TableHead>TX Pkts</TableHead>
                                <TableHead>RX Pkts</TableHead>
                                <TableHead>TX Erros</TableHead>
                                <TableHead>RX Erros</TableHead>
                                <TableHead>TX Drops</TableHead>
                                <TableHead>RX Drops</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {interfaces.filter(i => !i.disabled).map((iface) => (
                                <TableRow key={iface.id}>
                                  <TableCell className="font-medium text-sm">{iface.interface_name}</TableCell>
                                  <TableCell className="text-xs">{formatBytes(iface.tx_bytes)}</TableCell>
                                  <TableCell className="text-xs">{formatBytes(iface.rx_bytes)}</TableCell>
                                  <TableCell className="text-xs">{iface.tx_packets.toLocaleString()}</TableCell>
                                  <TableCell className="text-xs">{iface.rx_packets.toLocaleString()}</TableCell>
                                  <TableCell className={`text-xs ${iface.tx_errors > 0 ? "text-destructive font-bold" : ""}`}>{iface.tx_errors}</TableCell>
                                  <TableCell className={`text-xs ${iface.rx_errors > 0 ? "text-destructive font-bold" : ""}`}>{iface.rx_errors}</TableCell>
                                  <TableCell className={`text-xs ${iface.tx_drops > 0 ? "text-destructive font-bold" : ""}`}>{iface.tx_drops}</TableCell>
                                  <TableCell className={`text-xs ${iface.rx_drops > 0 ? "text-destructive font-bold" : ""}`}>{iface.rx_drops}</TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  {/* Gráfico de histórico de tráfego */}
                  {trafficHistory.length > 1 && (() => {
                    const ifaceNames = [...new Set(trafficHistory.map(r => r.interface_name))];
                    const activeIface = selectedTrafficIface || ifaceNames[0] || "";
                    const filtered = trafficHistory.filter(r => r.interface_name === activeIface);
                    return (
                      <Card className="mt-4">
                        <CardHeader className="pb-3">
                          <div className="flex items-center justify-between">
                            <CardTitle className="text-base flex items-center gap-2">
                              <TrendingUp className="w-4 h-4" />
                              Histórico de Tráfego
                            </CardTitle>
                            <Select value={activeIface} onValueChange={setSelectedTrafficIface}>
                              <SelectTrigger className="w-48">
                                <SelectValue placeholder="Interface" />
                              </SelectTrigger>
                              <SelectContent>
                                {ifaceNames.map(name => (
                                  <SelectItem key={name} value={name}>{name}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        </CardHeader>
                        <CardContent>
                          <ResponsiveContainer width="100%" height={300}>
                            <LineChart data={filtered}>
                              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                              <XAxis dataKey="time" tick={{ fontSize: 11 }} />
                              <YAxis tick={{ fontSize: 11 }} unit=" MB" />
                              <RechartsTooltip formatter={(value: number) => `${value} MB`} />
                              <Legend />
                              <Line type="monotone" dataKey="tx_mb" name="TX (MB)" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
                              <Line type="monotone" dataKey="rx_mb" name="RX (MB)" stroke="hsl(var(--chart-2))" strokeWidth={2} dot={false} />
                            </LineChart>
                          </ResponsiveContainer>
                        </CardContent>
                      </Card>
                    );
                  })()}
                </TabsContent>

                <TabsContent value="dhcp" className="mt-4">
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base">DHCP - {selectedDevice.name}</CardTitle>
                    </CardHeader>
                    <CardContent>
                      {selectedDevice.last_dhcp_summary ? (() => {
                        const ds = selectedDevice.last_dhcp_summary;
                        const servers = ds.by_server ? Object.entries(ds.by_server) : [];
                        const overallUsagePct = ds.usage_pct !== null && ds.usage_pct !== undefined
                          ? ds.usage_pct
                          : (ds.total_leases > 0 ? Math.round((ds.active_leases / ds.total_leases) * 100) : 0);
                        const PIE_COLORS = ["hsl(var(--primary))", "hsl(var(--chart-2))", "hsl(var(--chart-4))", "hsl(var(--chart-3))", "hsl(var(--muted))"];

                        return (
                          <div className="space-y-4">
                            {/* Resumo Geral */}
                            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                              <div className="p-3 rounded-lg border bg-card">
                                <p className="text-xs text-muted-foreground">Total Leases</p>
                                <p className="text-2xl font-bold">{ds.total_leases}</p>
                              </div>
                              <div className="p-3 rounded-lg border bg-card">
                                <p className="text-xs text-muted-foreground">Ativos</p>
                                <p className="text-2xl font-bold text-primary">{ds.active_leases}</p>
                              </div>
                              <div className="p-3 rounded-lg border bg-card">
                                <p className="text-xs text-muted-foreground">Dinâmicos</p>
                                <p className="text-2xl font-bold">{ds.dynamic_leases}</p>
                              </div>
                              <div className="p-3 rounded-lg border bg-card">
                                <p className="text-xs text-muted-foreground">Estáticos</p>
                                <p className="text-2xl font-bold">{ds.static_leases}</p>
                              </div>
                              {ds.total_capacity > 0 && (
                                <div className="p-3 rounded-lg border bg-card">
                                  <p className="text-xs text-muted-foreground">Capacidade Total</p>
                                  <p className="text-2xl font-bold">{ds.total_capacity} <span className="text-sm font-normal text-muted-foreground">IPs</span></p>
                                </div>
                              )}
                            </div>

                            {/* Barra de utilização geral */}
                            <div className="p-4 rounded-lg border bg-card space-y-2">
                              <div className="flex items-center justify-between">
                                <h4 className="text-sm font-semibold">Utilização Geral</h4>
                                <span className={`text-lg font-bold ${overallUsagePct > 80 ? "text-destructive" : overallUsagePct > 60 ? "text-chart-4" : "text-primary"}`}>
                                  {overallUsagePct}%
                                </span>
                              </div>
                              <Progress value={overallUsagePct} className="h-3" />
                              <p className="text-xs text-muted-foreground">
                                {ds.active_leases} ativos {ds.total_capacity > 0 ? `de ${ds.total_capacity} IPs disponíveis` : `de ${ds.total_leases} leases`}
                              </p>
                            </div>

                            {/* Sub-abas por Pool/Servidor */}
                            {servers.length > 0 && (
                              <Tabs defaultValue={servers[0]?.[0] || "all"} className="w-full">
                                <TabsList className="flex flex-wrap h-auto gap-1">
                                  {servers.map(([serverName, info]: [string, any]) => (
                                    <TabsTrigger key={serverName} value={serverName} className="text-xs gap-1">
                                      <Server className="w-3 h-3" />
                                      {serverName}
                                      {info.usage_pct !== null && info.usage_pct !== undefined && (
                                        <Badge variant={info.usage_pct > 80 ? "destructive" : "secondary"} className="text-[10px] px-1 py-0 ml-1">
                                          {info.usage_pct}%
                                        </Badge>
                                      )}
                                    </TabsTrigger>
                                  ))}
                                </TabsList>

                                {servers.map(([serverName, info]: [string, any]) => {
                                  const srvUsagePct = info.usage_pct !== null && info.usage_pct !== undefined ? info.usage_pct : (info.total > 0 ? Math.round((info.active / info.total) * 100) : 0);
                                  const srvPieData = [
                                    { name: "Ativos", value: info.active || 0 },
                                    { name: "Inativos", value: Math.max(0, (info.total || 0) - (info.active || 0)) },
                                    ...(info.capacity > 0 ? [{ name: "Livres", value: Math.max(0, info.capacity - (info.active || 0)) }] : []),
                                  ].filter(d => d.value > 0);

                                  return (
                                    <TabsContent key={serverName} value={serverName} className="mt-3">
                                      <div className="space-y-4">
                                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                                          <div className="p-3 rounded-lg border bg-card">
                                            <p className="text-xs text-muted-foreground">Pool</p>
                                            <p className="text-sm font-bold">{info.pool || "—"}</p>
                                          </div>
                                          <div className="p-3 rounded-lg border bg-card">
                                            <p className="text-xs text-muted-foreground">Capacidade</p>
                                            <p className="text-2xl font-bold">{info.capacity > 0 ? info.capacity : "—"}</p>
                                          </div>
                                          <div className="p-3 rounded-lg border bg-card">
                                            <p className="text-xs text-muted-foreground">Leases Ativos</p>
                                            <p className="text-2xl font-bold text-primary">{info.active}</p>
                                          </div>
                                          <div className="p-3 rounded-lg border bg-card">
                                            <p className="text-xs text-muted-foreground">Leases Totais</p>
                                            <p className="text-2xl font-bold">{info.total}</p>
                                          </div>
                                        </div>

                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                          <div className="p-4 rounded-lg border bg-card space-y-3">
                                            <h4 className="text-sm font-semibold">Utilização do Pool</h4>
                                            <div className="flex items-center gap-3">
                                              <Progress value={srvUsagePct} className="h-3 flex-1" />
                                              <span className={`text-lg font-bold ${srvUsagePct > 80 ? "text-destructive" : srvUsagePct > 60 ? "text-chart-4" : "text-primary"}`}>
                                                {srvUsagePct}%
                                              </span>
                                            </div>
                                            <p className="text-xs text-muted-foreground">
                                              {info.active} ativos {info.capacity > 0 ? `de ${info.capacity} IPs` : `de ${info.total} leases`}
                                            </p>
                                            {info.capacity > 0 && (info.capacity - info.active) < 10 && (
                                              <div className="flex items-center gap-1 text-destructive text-xs font-medium mt-1">
                                                <AlertTriangle className="w-3 h-3" />
                                                Apenas {Math.max(0, info.capacity - info.active)} IPs livres!
                                              </div>
                                            )}
                                          </div>
                                          {srvPieData.length > 0 && (
                                            <div className="p-4 rounded-lg border bg-card">
                                              <h4 className="text-sm font-semibold mb-2">Distribuição</h4>
                                              <ResponsiveContainer width="100%" height={150}>
                                                <PieChart>
                                                  <Pie data={srvPieData} cx="50%" cy="50%" innerRadius={35} outerRadius={60} dataKey="value" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                                                    {srvPieData.map((_, idx) => (
                                                      <Cell key={idx} fill={PIE_COLORS[idx % PIE_COLORS.length]} />
                                                    ))}
                                                  </Pie>
                                                  <RechartsTooltip />
                                                </PieChart>
                                              </ResponsiveContainer>
                                            </div>
                                          )}
                                        </div>

                                        {/* Gráfico de histórico por pool */}
                                        {(() => {
                                          const poolHistory = dhcpHistory.map((h: any) => {
                                            const srv = h.by_server?.[serverName];
                                            return srv ? { time: h.time, total: srv.total || 0, active: srv.active || 0, capacity: srv.capacity || 0 } : null;
                                          }).filter(Boolean);
                                          if (poolHistory.length < 2) return null;
                                          return (
                                            <Card>
                                              <CardHeader className="pb-3">
                                                <CardTitle className="text-sm flex items-center gap-2">
                                                  <TrendingUp className="w-4 h-4" />
                                                  Histórico - {serverName}
                                                </CardTitle>
                                              </CardHeader>
                                              <CardContent>
                                                <ResponsiveContainer width="100%" height={220}>
                                                  <LineChart data={poolHistory}>
                                                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                                                    <XAxis dataKey="time" tick={{ fontSize: 10 }} />
                                                    <YAxis tick={{ fontSize: 10 }} />
                                                    <RechartsTooltip />
                                                    <Legend />
                                                    <Line type="monotone" dataKey="active" name="Ativos" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
                                                    <Line type="monotone" dataKey="total" name="Total Leases" stroke="hsl(var(--chart-2))" strokeWidth={2} dot={false} />
                                                    <Line type="monotone" dataKey="capacity" name="Capacidade" stroke="hsl(var(--muted-foreground))" strokeWidth={1} strokeDasharray="5 5" dot={false} />
                                                  </LineChart>
                                                </ResponsiveContainer>
                                              </CardContent>
                                            </Card>
                                          );
                                        })()}
                                      </div>
                                    </TabsContent>
                                  );
                                })}
                              </Tabs>
                            )}
                          </div>
                        );
                      })() : (
                        <p className="text-center text-muted-foreground py-4">Dados DHCP não disponíveis. Execute o collector na VPS para coletar.</p>
                      )}

                      {/* Gráfico de histórico DHCP */}
                      {dhcpHistory.length > 1 && (
                        <Card className="mt-4">
                          <CardHeader className="pb-3">
                            <CardTitle className="text-base flex items-center gap-2">
                              <TrendingUp className="w-4 h-4" />
                              Histórico DHCP
                            </CardTitle>
                          </CardHeader>
                          <CardContent>
                            <ResponsiveContainer width="100%" height={300}>
                              <LineChart data={dhcpHistory}>
                                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                                <XAxis dataKey="time" tick={{ fontSize: 11 }} />
                                <YAxis tick={{ fontSize: 11 }} />
                                <RechartsTooltip />
                                <Legend />
                                <Line type="monotone" dataKey="total_leases" name="Total" stroke="hsl(var(--muted-foreground))" strokeWidth={2} dot={false} />
                                <Line type="monotone" dataKey="active_leases" name="Ativos" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
                                <Line type="monotone" dataKey="dynamic_leases" name="Dinâmicos" stroke="hsl(var(--chart-2))" strokeWidth={2} dot={false} />
                                <Line type="monotone" dataKey="static_leases" name="Estáticos" stroke="hsl(var(--chart-4))" strokeWidth={2} dot={false} />
                              </LineChart>
                            </ResponsiveContainer>
                          </CardContent>
                        </Card>
                      )}
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="logs" className="mt-4">
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base flex items-center gap-2">
                        Alertas nos Logs - {selectedDevice.name}
                        {selectedDevice.last_log_alerts && selectedDevice.last_log_alerts.length > 0 && (
                          <Badge variant="destructive" className="text-xs">{selectedDevice.last_log_alerts.length}</Badge>
                        )}
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      {selectedDevice.last_log_alerts && selectedDevice.last_log_alerts.length > 0 ? (() => {
                        const allLogs = selectedDevice.last_log_alerts || [];
                        const loginLogs = allLogs.filter((l: any) => l.category === 'login');
                        const ifaceLogs = allLogs.filter((l: any) => l.category === 'interface');
                        const systemLogs = allLogs.filter((l: any) => l.category === 'system');
                        const otherLogs = allLogs.filter((l: any) => !l.category);

                        const renderLogGroup = (title: string, icon: string, items: any[], color: string) => {
                          if (items.length === 0) return null;
                          return (
                            <div className="space-y-2">
                              <div className="flex items-center gap-2">
                                <span>{icon}</span>
                                <h4 className="text-sm font-semibold">{title}</h4>
                                <Badge variant="outline" className="text-xs">{items.length}</Badge>
                              </div>
                              {items.map((log: any, i: number) => (
                                <div key={i} className="flex items-start gap-2 p-2 rounded border text-sm ml-4">
                                  <AlertTriangle className={`w-4 h-4 shrink-0 mt-0.5 ${color}`} />
                                  <div className="min-w-0">
                                    <div className="flex items-center gap-2">
                                      {log.time && <span className="text-xs text-muted-foreground font-mono">{log.time}</span>}
                                      {log.topics && <Badge variant="outline" className="text-xs">{log.topics}</Badge>}
                                    </div>
                                    <p className="text-sm mt-0.5 break-words">{log.message}</p>
                                  </div>
                                </div>
                              ))}
                            </div>
                          );
                        };

                        return (
                          <div className="space-y-4 max-h-[500px] overflow-y-auto">
                            {renderLogGroup("Login Inválido / Tentativas de Invasão", "🔐", loginLogs, "text-destructive")}
                            {renderLogGroup("Interfaces Caindo", "🔌", ifaceLogs, "text-destructive")}
                            {renderLogGroup("Erros de Sistema", "⚙️", systemLogs, "text-muted-foreground")}
                            {renderLogGroup("Outros Alertas", "📋", otherLogs, "text-muted-foreground")}
                          </div>
                        );
                      })() : (
                        <p className="text-center text-muted-foreground py-4">Nenhum alerta nos logs. Execute o collector na VPS para monitorar.</p>
                      )}
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="system" className="mt-4">
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base">Informações do Sistema - {selectedDevice.name}</CardTitle>
                    </CardHeader>
                    <CardContent>
                      {selectedDevice.last_system_info ? (() => {
                        const info = selectedDevice.last_system_info;
                        const health = info.health || {};
                        const cpuTemp = health['cpu-temperature'] || health.temperature || health['board-temperature1'] || null;
                        const voltage = health.voltage || health['input-voltage'] || null;
                        const fanSpeed = health['fan1-speed'] || health['fan-speed'] || health.fan || null;
                        const powerConsumption = health['power-consumption'] || null;
                        const memUsedPct = info['total-memory'] && info['free-memory']
                          ? Math.round(((parseInt(info['total-memory']) - parseInt(info['free-memory'])) / parseInt(info['total-memory'])) * 100)
                          : null;

                        return (
                          <div className="space-y-6">
                            {info.reboot_detected && (
                              <div className="p-3 rounded-lg border border-destructive bg-destructive/10 flex items-center gap-3">
                                <AlertTriangle className="w-5 h-5 text-destructive" />
                                <div>
                                  <p className="text-sm font-semibold text-destructive">⚠️ Reinicialização Detectada!</p>
                                  <p className="text-xs text-muted-foreground">Uptime anterior: {info.previous_uptime} → Atual: {info.uptime}</p>
                                </div>
                              </div>
                            )}

                            {(cpuTemp || voltage || fanSpeed || powerConsumption) && (
                              <div>
                                <h4 className="text-sm font-semibold mb-3">🌡️ Temperatura & Hardware</h4>
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                                  {cpuTemp && (
                                    <div className="p-3 rounded-lg border bg-card">
                                      <p className="text-xs text-muted-foreground">Temp. CPU</p>
                                      <p className={`text-2xl font-bold ${Number(cpuTemp) > 70 ? "text-destructive" : Number(cpuTemp) > 55 ? "text-orange-500" : "text-primary"}`}>
                                        {cpuTemp}°C
                                      </p>
                                    </div>
                                  )}
                                  {voltage && (
                                    <div className="p-3 rounded-lg border bg-card">
                                      <p className="text-xs text-muted-foreground">Voltagem</p>
                                      <p className="text-2xl font-bold">{voltage}V</p>
                                    </div>
                                  )}
                                  {fanSpeed && (
                                    <div className="p-3 rounded-lg border bg-card">
                                      <p className="text-xs text-muted-foreground">Fan</p>
                                      <p className="text-2xl font-bold">{fanSpeed} RPM</p>
                                    </div>
                                  )}
                                  {powerConsumption && (
                                    <div className="p-3 rounded-lg border bg-card">
                                      <p className="text-xs text-muted-foreground">Consumo</p>
                                      <p className="text-2xl font-bold">{powerConsumption}W</p>
                                    </div>
                                  )}
                                </div>
                                {Object.keys(health).length > 0 && (
                                  <details className="mt-3">
                                    <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground">Ver todos os sensores ({Object.keys(health).length})</summary>
                                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-2">
                                      {Object.entries(health).map(([key, val]) => (
                                        <div key={key} className="p-2 rounded border text-xs">
                                          <span className="text-muted-foreground">{key}:</span> <span className="font-medium">{String(val)}</span>
                                        </div>
                                      ))}
                                    </div>
                                  </details>
                                )}
                              </div>
                            )}

                            <div>
                              <h4 className="text-sm font-semibold mb-3">⏱️ Uptime & Sistema</h4>
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                {[
                                  { label: "Identidade", value: info.identity },
                                  { label: "RouterOS", value: info.version },
                                  { label: "Uptime", value: info.uptime, highlight: true },
                                  { label: "Board", value: info['board-name'] },
                                  { label: "Arquitetura", value: info.architecture },
                                  { label: "CPU", value: info.cpu },
                                  { label: "CPU Cores", value: info['cpu-count'] },
                                  { label: "CPU Freq", value: info['cpu-frequency'] ? `${info['cpu-frequency']} MHz` : '' },
                                  { label: "Carga CPU", value: info['cpu-load'] ? `${info['cpu-load']}%` : '' },
                                  { label: "Memória Total", value: info['total-memory'] ? formatBytes(parseInt(info['total-memory']) || 0) : '' },
                                  { label: "Memória Livre", value: info['free-memory'] ? formatBytes(parseInt(info['free-memory']) || 0) : '' },
                                  { label: "Uso de Memória", value: memUsedPct !== null ? `${memUsedPct}%` : '' },
                                ].filter(item => item.value).map((item: any) => (
                                  <div key={item.label} className={`p-3 rounded-lg border bg-card ${item.highlight ? 'border-primary/30' : ''}`}>
                                    <p className="text-xs text-muted-foreground">{item.label}</p>
                                    <p className="text-sm font-medium mt-0.5">{item.value}</p>
                                  </div>
                                ))}
                              </div>
                            </div>
                          </div>
                        );
                      })() : (
                        <p className="text-center text-muted-foreground py-4">Dados do sistema não disponíveis. Execute o collector na VPS para coletar.</p>
                      )}
                    </CardContent>
                  </Card>

                  {/* Gráficos históricos de temperatura e CPU */}
                  {systemHistory.length > 1 && (
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4">
                      <Card>
                        <CardHeader className="pb-3">
                          <CardTitle className="text-base flex items-center gap-2">
                            <Thermometer className="w-4 h-4" />
                            Histórico de Temperatura
                          </CardTitle>
                        </CardHeader>
                        <CardContent>
                          <ResponsiveContainer width="100%" height={250}>
                            <LineChart data={systemHistory.filter(d => d.cpu_temp != null)}>
                              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                              <XAxis dataKey="time" tick={{ fontSize: 10 }} />
                              <YAxis tick={{ fontSize: 11 }} unit="°C" domain={['dataMin - 5', 'dataMax + 5']} />
                              <RechartsTooltip formatter={(value: number) => [`${value}°C`, 'Temperatura']} />
                              <Line type="monotone" dataKey="cpu_temp" name="Temp CPU" stroke="hsl(var(--destructive))" strokeWidth={2} dot={false} />
                              {/* Linha de referência 70°C */}
                              <Line type="monotone" dataKey={() => 70} name="Limite (70°C)" stroke="hsl(var(--muted-foreground))" strokeWidth={1} strokeDasharray="5 5" dot={false} />
                            </LineChart>
                          </ResponsiveContainer>
                        </CardContent>
                      </Card>

                      <Card>
                        <CardHeader className="pb-3">
                          <CardTitle className="text-base flex items-center gap-2">
                            <Cpu className="w-4 h-4" />
                            Histórico de CPU Load
                          </CardTitle>
                        </CardHeader>
                        <CardContent>
                          <ResponsiveContainer width="100%" height={250}>
                            <LineChart data={systemHistory.filter(d => d.cpu_load != null)}>
                              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                              <XAxis dataKey="time" tick={{ fontSize: 10 }} />
                              <YAxis tick={{ fontSize: 11 }} unit="%" domain={[0, 100]} />
                              <RechartsTooltip formatter={(value: number) => [`${value}%`, 'CPU Load']} />
                              <Legend />
                              <Line type="monotone" dataKey="cpu_load" name="CPU Load" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
                              {systemHistory.some(d => d.memory_used_pct != null) && (
                                <Line type="monotone" dataKey="memory_used_pct" name="Memória %" stroke="hsl(var(--chart-2))" strokeWidth={2} dot={false} />
                              )}
                            </LineChart>
                          </ResponsiveContainer>
                        </CardContent>
                      </Card>
                    </div>
                  )}
                </TabsContent>

                <TabsContent value="ping" className="mt-4">
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base flex items-center justify-between">
                        Alvos de Ping
                        <Button size="sm" onClick={() => { setPingForm({ target_ip: "", label: "" }); setShowPingDialog(true); }}>
                          <Plus className="w-4 h-4 mr-1" /> Adicionar
                        </Button>
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      {pingTargets.length === 0 ? (
                        <p className="text-center text-muted-foreground py-4">Nenhum alvo de ping configurado.</p>
                      ) : (
                        <div className="space-y-3">
                          {pingTargets.map((t) => (
                            <div key={t.id} className="flex items-center justify-between p-3 border rounded-lg">
                              <div>
                                <p className="font-medium text-sm">{t.label || t.target_ip}</p>
                                <p className="text-xs text-muted-foreground">{t.target_ip}</p>
                              </div>
                              <div className="flex items-center gap-4">
                                {t.latency_ms !== null && (
                                  <div className="text-right">
                                    <p className="text-sm font-mono">{t.latency_ms}ms</p>
                                    <p className={`text-xs ${(t.packet_loss_pct || 0) > 0 ? "text-destructive" : "text-primary"}`}>
                                      {t.packet_loss_pct}% perda
                                    </p>
                                  </div>
                                )}
                                <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => handleDeletePingTarget(t.id)}>
                                  <Trash2 className="w-3 h-3" />
                                </Button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </TabsContent>
              </Tabs>
              </>
            ) : (
              <Card>
                <CardContent className="py-16 text-center text-muted-foreground">
                  <Network className="w-12 h-12 mx-auto mb-4 opacity-30" />
                  <p className="text-lg font-medium mb-1">Selecione um dispositivo</p>
                  <p className="text-sm">Clique em um dispositivo na lista para ver detalhes</p>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>

      {/* Create Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>Novo Dispositivo de Rede</DialogTitle></DialogHeader>
          <form onSubmit={handleCreateDevice}>
            {renderDeviceForm(deviceForm, setDeviceForm)}
            <DialogFooter className="mt-4"><Button type="submit">Adicionar</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>Editar Dispositivo</DialogTitle></DialogHeader>
          {editDevice && (
            <form onSubmit={handleEditDevice}>
              {renderDeviceForm(editDevice, setEditDevice, true)}
              <DialogFooter className="mt-4"><Button type="submit">Salvar</Button></DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover dispositivo?</AlertDialogTitle>
            <AlertDialogDescription>
              Isso removerá "{deleteDevice?.name}" e todos os dados de interfaces e ping associados.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteDevice}>Remover</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Ping Target Dialog */}
      <Dialog open={showPingDialog} onOpenChange={setShowPingDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>Novo Alvo de Ping</DialogTitle></DialogHeader>
          <form onSubmit={handleAddPingTarget}>
            <div className="space-y-4">
              <div>
                <Label>IP do destino *</Label>
                <Input value={pingForm.target_ip} onChange={(e) => setPingForm({ ...pingForm, target_ip: e.target.value })} placeholder="8.8.8.8" />
              </div>
              <div>
                <Label>Rótulo</Label>
                <Input value={pingForm.label} onChange={(e) => setPingForm({ ...pingForm, label: e.target.value })} placeholder="Google DNS" />
              </div>
            </div>
            <DialogFooter className="mt-4"><Button type="submit">Adicionar</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
};

export default MikrotikMonitor;
