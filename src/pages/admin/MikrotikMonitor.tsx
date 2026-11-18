import { Suspense, useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import AdminLayout from "@/components/admin/AdminLayout";
import { AgentVersionAlert } from "@/components/admin/AgentVersionAlert";
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
import { Loader2, Plus, RefreshCw, Trash2, Edit, Wifi, WifiOff, Activity, ArrowUpDown, Network, Target, AlertTriangle, Download, Server, ScrollText, Globe, TrendingUp, Thermometer, Cpu, CalendarDays, Clock, MoreHorizontal, Zap, MemoryStick, BookOpen, Copy, Check, Info } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, Legend, PieChart, Pie, Cell } from "recharts";

import { lazyPage, PageLoader } from "@/components/PageLoader";
const MikrotikSetupGuideDialog = lazyPage(() => import("@/components/admin/mikrotik/MikrotikSetupGuideDialog"));
const GdmsTestDialog = lazyPage(() => import("@/components/admin/mikrotik/GdmsTestDialog"));
const MikrotikInterfacesTab = lazyPage(() => import("@/components/admin/mikrotik/MikrotikInterfacesTab"));
const MikrotikBandwidthTab = lazyPage(() => import("@/components/admin/mikrotik/MikrotikBandwidthTab"));
const MikrotikTrafficTab = lazyPage(() => import("@/components/admin/mikrotik/MikrotikTrafficTab"));
const MikrotikDhcpTab = lazyPage(() => import("@/components/admin/mikrotik/MikrotikDhcpTab"));
const MikrotikLogsTab = lazyPage(() => import("@/components/admin/mikrotik/MikrotikLogsTab"));
const MikrotikSystemTab = lazyPage(() => import("@/components/admin/mikrotik/MikrotikSystemTab"));
const MikrotikPingTab = lazyPage(() => import("@/components/admin/mikrotik/MikrotikPingTab"));
import { MikrotikDevice, MikrotikInterface, PingTarget, Client, emptyDevice, formatBytes, formatBitsPerSec } from "@/components/admin/mikrotik/types";

const MikrotikMonitor = () => {
  const navigate = useNavigate();

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
  const [showSetupGuide, setShowSetupGuide] = useState(false);
  const [showGdmsTest, setShowGdmsTest] = useState(false);
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
      if (document.hidden) return; // aba escondida: espera voltar
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
      snmp_security_level: editDevice.snmp_security_level || 'noAuthNoPriv',
      snmp_user: editDevice.snmp_user || null,
      snmp_auth_protocol: editDevice.snmp_auth_protocol || 'MD5',
      snmp_auth_passphrase: editDevice.snmp_auth_passphrase || null,
      snmp_priv_protocol: editDevice.snmp_priv_protocol || 'DES',
      snmp_priv_passphrase: editDevice.snmp_priv_passphrase || null,
    }).eq("id", editDevice.id);
    if (error) { toast.error(error.message); return; }
    toast.success("Dispositivo atualizado");
    setShowEditDialog(false);
    fetchDevices();
  };

  const handleDeleteDevice = async () => {
    if (!deleteDevice) return;
    try {
      const { error } = await supabase.from("mikrotik_devices").delete().eq("id", deleteDevice.id);
      if (error) throw error;
      
      toast.success("Dispositivo removido");
      setShowDeleteDialog(false);
      setDeleteDevice(null);
      if (selectedDevice?.id === deleteDevice.id) setSelectedDevice(null);
      fetchDevices();
    } catch (error: any) {
      toast.error(`Erro ao remover: ${error.message}`);
    }
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
            <SelectItem value="grandstream">Grandstream (SNMP Local - Recomendado)</SelectItem>
            <SelectItem value="grandstream_gdms">Grandstream (API GDMS - Beta)</SelectItem>
            <SelectItem value="snmp">SNMP (TP-Link, Ubiquiti, etc.)</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label>Nome do dispositivo *</Label>
        <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder={form.device_type === 'snmp' ? 'TP-Link ER605 - Matriz' : 'RB 750 - Matriz'} />
      </div>

      {form.device_type === 'grandstream_gdms' ? (
        <div className="space-y-4 pt-2 border-t">
          <div className="p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-md flex gap-2">
            <AlertTriangle className="w-4 h-4 text-yellow-600 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="text-[10px] font-bold text-yellow-700 uppercase">Atenção</p>
              <p className="text-[10px] text-yellow-600 leading-tight">
                A API GDMS está em desenvolvimento. Utilize <strong>SNMP Local + Proxy VPS</strong> para monitoramento estável no momento.
              </p>
            </div>
          </div>
          <p className="text-xs text-muted-foreground mb-2">Monitoramento via API do Grandstream Device Management System (GDMS).</p>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <Label>App Key (Key do Desenvolvedor)</Label>
              <Input value={form.username || ''} onChange={(e) => setForm({ ...form, username: e.target.value })} placeholder="Sua App Key do GDMS" />
            </div>
            <div className="col-span-2">
              <Label>App Secret (Secret do Desenvolvedor)</Label>
              <Input type="password" value={form.password || ''} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="Seu App Secret do GDMS" />
            </div>
            <div className="col-span-2">
              <Label>ID do Dispositivo (no GDMS)</Label>
              <Input value={form.host || ''} onChange={(e) => setForm({ ...form, host: e.target.value })} placeholder="MAC Address ou ID único" />
            </div>
          </div>
          <div className="flex items-center justify-between gap-2 pt-1">
            <p className="text-[10px] text-muted-foreground italic">Nota: Requer conta de desenvolvedor aprovada no painel GDMS.</p>
            <Button type="button" size="sm" variant="outline" onClick={() => setShowGdmsTest(true)}>
              Testar conexão GDMS
            </Button>
          </div>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Host/IP *</Label>
              <Input value={form.host} onChange={(e) => setForm({ ...form, host: e.target.value })} placeholder="192.168.1.1 ou ddns.exemplo.com" />
            </div>
            <div>
              <Label>Porta</Label>
              <Input type="number" value={form.port} onChange={(e) => setForm({ ...form, port: parseInt(e.target.value) || (form.device_type === 'mikrotik' ? 443 : 161) })} />
            </div>
          </div>
        </>
      )}

      {form.device_type !== 'grandstream_gdms' && (form.device_type === 'snmp' || form.device_type === 'grandstream') ? (
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
                  <SelectItem value="3">v3</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {form.snmp_version === '3' && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Usuário SNMPv3 *</Label>
                  <Input value={form.snmp_user || ''} onChange={(e) => setForm({ ...form, snmp_user: e.target.value })} placeholder="snmpuser" />
                </div>
                <div>
                  <Label>Nível de Segurança</Label>
                  <Select value={form.snmp_security_level || 'noAuthNoPriv'} onValueChange={(v) => setForm({ ...form, snmp_security_level: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="noAuthNoPriv">noAuthNoPriv</SelectItem>
                      <SelectItem value="authNoPriv">authNoPriv</SelectItem>
                      <SelectItem value="authPriv">authPriv</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              {(form.snmp_security_level === 'authNoPriv' || form.snmp_security_level === 'authPriv') && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Protocolo Auth</Label>
                    <Select value={form.snmp_auth_protocol || 'MD5'} onValueChange={(v) => setForm({ ...form, snmp_auth_protocol: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="MD5">MD5</SelectItem>
                        <SelectItem value="SHA">SHA</SelectItem>
                        <SelectItem value="SHA256">SHA-256</SelectItem>
                        <SelectItem value="SHA512">SHA-512</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Senha Auth *</Label>
                    <Input type="password" value={form.snmp_auth_passphrase || ''} onChange={(e) => setForm({ ...form, snmp_auth_passphrase: e.target.value })} placeholder="••••••••" />
                  </div>
                </div>
              )}
              {form.snmp_security_level === 'authPriv' && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Protocolo Priv</Label>
                    <Select value={form.snmp_priv_protocol || 'DES'} onValueChange={(v) => setForm({ ...form, snmp_priv_protocol: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="DES">DES</SelectItem>
                        <SelectItem value="AES">AES</SelectItem>
                        <SelectItem value="AES256">AES-256</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Senha Priv *</Label>
                    <Input type="password" value={form.snmp_priv_passphrase || ''} onChange={(e) => setForm({ ...form, snmp_priv_passphrase: e.target.value })} placeholder="••••••••" />
                  </div>
                </div>
              )}
            </>
          )}

          <div className="p-3 bg-blue-500/5 border border-blue-500/10 rounded-md flex gap-3 mt-2">
            <Server className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="text-[10px] font-bold text-blue-700 uppercase">Configuração VPS</p>
              <p className="text-[10px] text-blue-600 leading-tight">
                Para dispositivos locais, utilize o <strong>Script do Coletor</strong> em uma VPS para enviar os dados SNMP para este painel.
              </p>
            </div>
          </div>
          <p className="text-xs text-muted-foreground mt-2">Coleta via SNMP (IF-MIB). Certifique-se de que o SNMP está habilitado no dispositivo.</p>
        </>
      ) : form.device_type !== 'grandstream_gdms' ? (
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
      ) : null}
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
      <AgentVersionAlert types={["mikrotik"]} className="mb-4" />
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
            <Button variant="outline" onClick={() => setShowSetupGuide(true)}>
              <BookOpen className="w-4 h-4 mr-2" /> Guia VPS
            </Button>
            <Button variant="outline" onClick={() => navigate("/admin/gdms-tutorial")}>
              <Info className="w-4 h-4 mr-2" /> Tutorial GDMS
            </Button>
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
                              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={(e) => { e.stopPropagation(); import("@/components/admin/mikrotik/collectorScript").then((m) => m.generateCollectorScript(device)); }}>
                                <Download className="w-3.5 h-3.5" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Baixar collector</TooltipContent>
                          </Tooltip>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={(e) => { e.stopPropagation(); setEditDevice({ ...device }); setShowEditDialog(true); }}>
                                <Edit className="w-3.5 h-3.5" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Editar dispositivo</TooltipContent>
                          </Tooltip>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive" onClick={(e) => { e.stopPropagation(); setDeleteDevice(device); setShowDeleteDialog(true); }}>
                                <Trash2 className="w-3.5 h-3.5" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Remover dispositivo</TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                        <div className="flex-1" />
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
                      <div className="flex items-center gap-2">
                        <Button size="sm" variant="outline" onClick={() => handlePollDevice(selectedDevice.id)} disabled={polling === selectedDevice.id}>
                          {polling === selectedDevice.id ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <RefreshCw className="w-4 h-4 mr-1" />}
                          Atualizar
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => { setEditDevice({ ...selectedDevice }); setShowEditDialog(true); }}>
                          <Edit className="w-4 h-4 mr-1" />
                          Editar
                        </Button>
                        <Button size="sm" variant="outline" className="text-destructive hover:bg-destructive/10" onClick={() => { setDeleteDevice(selectedDevice); setShowDeleteDialog(true); }}>
                          <Trash2 className="w-4 h-4 mr-1" />
                          Excluir
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Tabs defaultValue="interfaces">
                  <TabsList className="flex-wrap h-auto gap-1 w-full justify-start">
                    <TabsTrigger value="interfaces"><Activity className="w-4 h-4 mr-1" /> Interfaces</TabsTrigger>
                    <TabsTrigger value="bandwidth"><Zap className="w-4 h-4 mr-1" /> Banda</TabsTrigger>
                    <TabsTrigger value="traffic"><ArrowUpDown className="w-4 h-4 mr-1" /> Tráfego</TabsTrigger>
                    {selectedDevice.device_type !== 'snmp' && selectedDevice.device_type !== 'grandstream' && (
                      <TabsTrigger value="dhcp"><Globe className="w-4 h-4 mr-1" /> DHCP</TabsTrigger>
                    )}
                    {selectedDevice.device_type !== 'snmp' && selectedDevice.device_type !== 'grandstream' && (
                      <TabsTrigger value="logs">
                        <ScrollText className="w-4 h-4 mr-1" /> Logs
                        {selectedDevice.last_log_alerts && selectedDevice.last_log_alerts.length > 0 && (
                          <Badge variant="destructive" className="text-[10px] ml-1 px-1 py-0">{selectedDevice.last_log_alerts.length}</Badge>
                        )}
                      </TabsTrigger>
                    )}
                    <TabsTrigger value="system"><Server className="w-4 h-4 mr-1" /> Sistema</TabsTrigger>
                    <TabsTrigger value="ping"><Target className="w-4 h-4 mr-1" /> Ping</TabsTrigger>
                  </TabsList>

                <Suspense fallback={<PageLoader />}>
                <TabsContent value="interfaces" className="mt-4"><MikrotikInterfacesTab interfaceEvents={interfaceEvents} interfaces={interfaces} selectedDevice={selectedDevice} /></TabsContent>

                <TabsContent value="bandwidth" className="mt-4"><MikrotikBandwidthTab interfaces={interfaces} trafficHistory={trafficHistory} /></TabsContent>

                <TabsContent value="traffic" className="mt-4"><MikrotikTrafficTab interfaces={interfaces} selectedTrafficIface={selectedTrafficIface} setSelectedTrafficIface={setSelectedTrafficIface} trafficHistory={trafficHistory} /></TabsContent>

                <TabsContent value="dhcp" className="mt-4"><MikrotikDhcpTab dhcpHistory={dhcpHistory} selectedDevice={selectedDevice} /></TabsContent>

                <TabsContent value="logs" className="mt-4"><MikrotikLogsTab selectedDevice={selectedDevice} /></TabsContent>

                <TabsContent value="system" className="mt-4"><MikrotikSystemTab selectedDevice={selectedDevice} systemHistory={systemHistory} /></TabsContent>

                <TabsContent value="ping" className="mt-4"><MikrotikPingTab pingTargets={pingTargets} setPingForm={setPingForm} setShowPingDialog={setShowPingDialog} handleDeletePingTarget={handleDeletePingTarget} /></TabsContent>
                </Suspense>
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

      {/* Setup Guide Dialog */}
      {/* Diálogos pesados: baixados só quando abertos. */}
      <Suspense fallback={null}>
        {showSetupGuide && <MikrotikSetupGuideDialog open={showSetupGuide} onOpenChange={setShowSetupGuide} />}
        {showGdmsTest && <GdmsTestDialog open={showGdmsTest} onOpenChange={setShowGdmsTest} />}
      </Suspense>

    </AdminLayout>
  );
};

export default MikrotikMonitor;
