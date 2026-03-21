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
import { Loader2, Plus, RefreshCw, Trash2, Edit, Wifi, WifiOff, Activity, ArrowUpDown, Network, Target, AlertTriangle, Download, Server, ScrollText, Globe, TrendingUp, Thermometer, Cpu } from "lucide-react";
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
  name: "", host: "", port: 443, username: "admin", password: "", use_ssl: true, client_id: "", proxy_url: "", api_port: 8728,
};

const formatBytes = (bytes: number) => {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
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

    await api.disconnect();
    return { success: true, identity, resource, health, interfaces: interfaces || [], ipAddresses: ipAddresses || [], pppoeClients: pppoeClients || [], logs, dhcpLeases: dhcpLeases || [] };
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

function analyzeDhcpLeases(dhcpLeases) {
  const totalLeases = dhcpLeases.length;
  const activeLeases = dhcpLeases.filter(l => l.status === 'bound' || l.dynamic === 'true' || l.dynamic === true).length;
  const staticLeases = dhcpLeases.filter(l => l.dynamic === 'false' || l.dynamic === false).length;
  const byServer = {};
  for (const lease of dhcpLeases) {
    const server = lease.server || lease['dhcp-server'] || 'default';
    if (!byServer[server]) byServer[server] = { total: 0, active: 0 };
    byServer[server].total++;
    if (lease.status === 'bound') byServer[server].active++;
  }
  return { total_leases: totalLeases, active_leases: activeLeases, static_leases: staticLeases, dynamic_leases: totalLeases - staticLeases, by_server: byServer };
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
  const dhcp = analyzeDhcpLeases(data.dhcpLeases);
  console.log(\`  📊 \${data.interfaces.length} interfaces, \${dhcp.total_leases} DHCP leases\`);
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
      const dhcp = analyzeDhcpLeases(data.dhcpLeases);
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
    setTrafficHistory(records.map((d: any) => ({
      ...d,
      time: new Date(d.recorded_at).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }),
      tx_mb: Number((d.tx_bytes / (1024 * 1024)).toFixed(2)),
      rx_mb: Number((d.rx_bytes / (1024 * 1024)).toFixed(2)),
    })));
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
    const insertData = { ...deviceForm, proxy_url: deviceForm.proxy_url || null, api_port: deviceForm.api_port || 8728 };
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

  const handleTestAlert = async (deviceId: string) => {
    setPolling(deviceId);
    try {
      const device = devices.find(d => d.id === deviceId);
      if (!device) throw new Error("Dispositivo não encontrado");

      const { data, error } = await supabase.functions.invoke("mikrotik-vps-ingest", {
        body: {
          device_id: deviceId,
          collected_data: { success: true, interfaces: [], ipAddresses: [], pppoeClients: [] },
          status_changes: [
            {
              interface_name: "ether1-test",
              previous_status: "up",
              current_status: "down",
            },
            {
              interface_name: "ether2-test",
              previous_status: "down",
              current_status: "up",
            },
          ],
          log_alerts: [
            { time: new Date().toLocaleTimeString("pt-BR"), message: "[TESTE] Simulação de alerta de log para validação do sistema" },
          ],
          dhcp_summary: {
            total_leases: 100,
            active_leases: 95,
            dynamic_leases: 80,
            static_leases: 15,
            by_server: {
              "dhcp-server1": { total: 60, active: 57 },
              "dhcp-server2": { total: 40, active: 38 },
            },
          },
        },
      });
      if (error) throw error;
      if (data?.whatsapp_sent) {
        toast.success("Alerta de teste enviado via WhatsApp!");
      } else {
        toast.info("Teste processado, mas WhatsApp não foi enviado (verifique configurações)");
      }
      fetchDevices();
    } catch (err: any) {
      toast.error(err.message || "Erro ao enviar teste");
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
        <Label>Nome do dispositivo *</Label>
        <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="RB 750 - Matriz" />
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
      {isEdit && (
        <div className="flex items-center gap-2">
          <Switch checked={form.is_active} onCheckedChange={(v) => setForm({ ...form, is_active: v })} />
          <Label>Ativo</Label>
        </div>
      )}
    </div>
  );

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Monitoramento Mikrotik</h1>
            <p className="text-muted-foreground">Monitore links e interfaces de RouterBoards</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-2 mr-2">
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
            <h2 className="text-lg font-semibold">Dispositivos</h2>
            {loading ? (
              <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin" /></div>
            ) : devices.length === 0 ? (
              <Card><CardContent className="py-8 text-center text-muted-foreground">Nenhum dispositivo cadastrado</CardContent></Card>
            ) : (
              devices.map((device) => (
                <Card
                  key={device.id}
                  className={`cursor-pointer transition-colors hover:border-primary ${selectedDevice?.id === device.id ? "border-primary bg-accent/30" : ""}`}
                  onClick={() => setSelectedDevice(device)}
                >
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {device.last_error ? (
                          <WifiOff className="w-4 h-4 text-destructive" />
                        ) : device.last_polled_at ? (
                          <Wifi className="w-4 h-4 text-green-500" />
                        ) : (
                          <Network className="w-4 h-4 text-muted-foreground" />
                        )}
                        <div>
                          <p className="font-medium text-sm">{device.name}</p>
                          <p className="text-xs text-muted-foreground">{device.host}:{device.port}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={(e) => { e.stopPropagation(); handlePollDevice(device.id); }} disabled={polling === device.id}>
                          {polling === device.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                        </Button>
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={(e) => { e.stopPropagation(); handleTestAlert(device.id); }} disabled={!!polling}>
                                <AlertTriangle className="w-3 h-3 text-orange-500" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Enviar alerta de teste</TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={(e) => { e.stopPropagation(); generateCollectorScript(device); }}>
                                <Download className="w-3 h-3" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Baixar script collector</TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={(e) => { e.stopPropagation(); setEditDevice({ ...device }); setShowEditDialog(true); }}>
                          <Edit className="w-3 h-3" />
                        </Button>
                        <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={(e) => { e.stopPropagation(); setDeleteDevice(device); setShowDeleteDialog(true); }}>
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </div>
                    </div>
                    <div className="mt-2 flex items-center gap-2">
                      <Badge variant={device.is_active ? "default" : "secondary"} className="text-xs">
                        {device.is_active ? "Ativo" : "Inativo"}
                      </Badge>
                      <span className="text-xs text-muted-foreground">{device.client?.full_name}</span>
                    </div>
                    {device.last_error && (
                      device.last_error.includes("ROUTEROS 6.x DETECTADO") ? (
                        <div className="mt-2 p-2 rounded bg-accent border border-border">
                          <div className="flex items-start gap-1.5">
                            <AlertTriangle className="w-3.5 h-3.5 text-orange-500 mt-0.5 shrink-0" />
                            <div>
                              <p className="text-xs font-medium text-orange-600 dark:text-orange-400">RouterOS 6.x detectado</p>
                              <p className="text-xs text-muted-foreground mt-0.5">
                                Sem API REST. Configure um proxy para monitorar.
                              </p>
                              {!device.proxy_url && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="mt-1.5 h-6 text-xs"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setEditDevice({ ...device });
                                    setShowEditDialog(true);
                                  }}
                                >
                                  Configurar Proxy
                                </Button>
                              )}
                            </div>
                          </div>
                        </div>
                      ) : (
                        <p className="mt-1 text-xs text-destructive truncate">{device.last_error}</p>
                      )
                    )}
                  </CardContent>
                </Card>
              ))
            )}
          </div>

          {/* Device Detail */}
          <div className="lg:col-span-2">
            {selectedDevice ? (
              <Tabs defaultValue="interfaces">
                <TabsList className="flex-wrap h-auto gap-1">
                  <TabsTrigger value="interfaces"><Activity className="w-4 h-4 mr-1" /> Interfaces</TabsTrigger>
                  <TabsTrigger value="traffic"><ArrowUpDown className="w-4 h-4 mr-1" /> Tráfego</TabsTrigger>
                  <TabsTrigger value="dhcp"><Globe className="w-4 h-4 mr-1" /> DHCP</TabsTrigger>
                  <TabsTrigger value="logs"><ScrollText className="w-4 h-4 mr-1" /> Logs</TabsTrigger>
                  <TabsTrigger value="system"><Server className="w-4 h-4 mr-1" /> Sistema</TabsTrigger>
                  <TabsTrigger value="ping"><Target className="w-4 h-4 mr-1" /> Ping</TabsTrigger>
                </TabsList>

                <TabsContent value="interfaces" className="mt-4">
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base flex items-center justify-between">
                        Interfaces - {selectedDevice.name}
                        <Button size="sm" variant="outline" onClick={() => handlePollDevice(selectedDevice.id)} disabled={polling === selectedDevice.id}>
                          {polling === selectedDevice.id ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <RefreshCw className="w-4 h-4 mr-1" />}
                          Atualizar
                        </Button>
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      {interfaces.length === 0 ? (
                        <p className="text-center text-muted-foreground py-4">Nenhuma interface. Clique em Atualizar para coletar.</p>
                      ) : (
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
                      )}
                    </CardContent>
                  </Card>
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
                      <CardTitle className="text-base">DHCP Leases - {selectedDevice.name}</CardTitle>
                    </CardHeader>
                    <CardContent>
                      {selectedDevice.last_dhcp_summary ? (() => {
                        const ds = selectedDevice.last_dhcp_summary;
                        const usagePct = ds.total_leases > 0 ? Math.round((ds.active_leases / ds.total_leases) * 100) : 0;
                        const pieData = [
                          { name: "Dinâmicos", value: ds.dynamic_leases || 0 },
                          { name: "Estáticos", value: ds.static_leases || 0 },
                          { name: "Inativos", value: Math.max(0, (ds.total_leases || 0) - (ds.active_leases || 0)) },
                        ].filter(d => d.value > 0);
                        const PIE_COLORS = ["hsl(var(--primary))", "hsl(var(--chart-2))", "hsl(var(--muted))"];
                        return (
                          <div className="space-y-4">
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
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
                            </div>

                            {/* Utilização geral + Pie chart */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                              <div className="p-4 rounded-lg border bg-card space-y-3">
                                <h4 className="text-sm font-semibold">Utilização Geral</h4>
                                <div className="flex items-center gap-3">
                                  <Progress value={usagePct} className="h-3 flex-1" />
                                  <span className={`text-lg font-bold ${usagePct > 80 ? "text-destructive" : usagePct > 60 ? "text-orange-500" : "text-primary"}`}>
                                    {usagePct}%
                                  </span>
                                </div>
                                <p className="text-xs text-muted-foreground">
                                  {ds.active_leases} de {ds.total_leases} leases em uso
                                </p>
                              </div>
                              {pieData.length > 0 && (
                                <div className="p-4 rounded-lg border bg-card">
                                  <h4 className="text-sm font-semibold mb-2">Distribuição</h4>
                                  <ResponsiveContainer width="100%" height={150}>
                                    <PieChart>
                                      <Pie data={pieData} cx="50%" cy="50%" innerRadius={35} outerRadius={60} dataKey="value" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                                        {pieData.map((_, idx) => (
                                          <Cell key={idx} fill={PIE_COLORS[idx % PIE_COLORS.length]} />
                                        ))}
                                      </Pie>
                                      <RechartsTooltip />
                                    </PieChart>
                                  </ResponsiveContainer>
                                </div>
                              )}
                            </div>

                            {ds.by_server && Object.keys(ds.by_server).length > 0 && (
                              <div>
                                <h4 className="text-sm font-semibold mb-2">Por Servidor DHCP</h4>
                                <Table>
                                  <TableHeader>
                                    <TableRow>
                                      <TableHead>Servidor</TableHead>
                                      <TableHead>Total</TableHead>
                                      <TableHead>Ativos</TableHead>
                                      <TableHead>Utilização</TableHead>
                                    </TableRow>
                                  </TableHeader>
                                  <TableBody>
                                    {Object.entries(ds.by_server).map(([server, info]: [string, any]) => {
                                      const serverPct = info.total > 0 ? Math.round((info.active / info.total) * 100) : 0;
                                      return (
                                        <TableRow key={server}>
                                          <TableCell className="font-medium text-sm">{server}</TableCell>
                                          <TableCell>{info.total}</TableCell>
                                          <TableCell>{info.active}</TableCell>
                                          <TableCell>
                                            <div className="flex items-center gap-2">
                                              <Progress value={serverPct} className="h-2 w-20" />
                                              <span className={`text-xs font-medium ${serverPct > 80 ? "text-destructive" : ""}`}>{serverPct}%</span>
                                            </div>
                                          </TableCell>
                                        </TableRow>
                                      );
                                    })}
                                  </TableBody>
                                </Table>
                              </div>
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
            ) : (
              <Card>
                <CardContent className="py-16 text-center text-muted-foreground">
                  <Network className="w-12 h-12 mx-auto mb-4 opacity-30" />
                  <p>Selecione um dispositivo para ver as interfaces</p>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>

      {/* Create Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>Novo Dispositivo Mikrotik</DialogTitle></DialogHeader>
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
