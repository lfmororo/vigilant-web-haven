import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import AdminLayout from "@/components/admin/AdminLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/hooks/use-toast";
import { formatTimeAgo } from "@/lib/formatTimeAgo";
import {
  Server, Monitor, Plus, RefreshCw, Trash2, Edit, HardDrive,
  Cpu, MemoryStick, Activity, Clock, ChevronDown, ChevronRight,
  Power, AlertTriangle, CheckCircle, XCircle, Download, ServerCog
} from "lucide-react";
import IloServersTab from "@/components/admin/servers/IloServersTab";


const statusColor = (status: string) => {
  switch (status) {
    case "online": return "bg-emerald-500";
    case "offline": return "bg-red-500";
    case "warning": return "bg-amber-500";
    default: return "bg-muted-foreground";
  }
};

const statusBadge = (status: string) => {
  switch (status) {
    case "online": return <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30">Online</Badge>;
    case "offline": return <Badge className="bg-red-500/20 text-red-400 border-red-500/30">Offline</Badge>;
    case "warning": return <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30">Alerta</Badge>;
    default: return <Badge variant="secondary">Desconhecido</Badge>;
  }
};

const formatUptime = (seconds: number | null) => {
  if (!seconds) return "—";
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${d}d ${h}h ${m}m`;
};

const formatGB = (val: number | null | undefined) => val != null ? `${val.toFixed(1)} GB` : "—";
const formatPct = (val: number | null | undefined) => val != null ? `${val.toFixed(1)}%` : "—";

const ServerMonitor = () => {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("windows");
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [editingItem, setEditingItem] = useState<any>(null);
  const [expandedVmHost, setExpandedVmHost] = useState<string | null>(null);

  // Form states
  const [formData, setFormData] = useState({
    name: "", host: "", client_id: "", username: "root", password: "", port: 443
  });

  const { data: clients } = useQuery({
    queryKey: ["clients"],
    queryFn: async () => {
      const { data } = await supabase.from("clients").select("id, full_name").order("full_name");
      return data || [];
    }
  });

  const { data: windowsServers, isLoading: loadingWin } = useQuery({
    queryKey: ["windows-servers"],
    queryFn: async () => {
      const { data } = await supabase
        .from("windows_servers")
        .select("*, clients(full_name)")
        .order("name");
      return data || [];
    },
    refetchInterval: 30000
  });

  const { data: vmwareHosts, isLoading: loadingVm } = useQuery({
    queryKey: ["vmware-hosts"],
    queryFn: async () => {
      const { data } = await supabase
        .from("vmware_hosts")
        .select("*, clients(full_name)")
        .order("name");
      return data || [];
    },
    refetchInterval: 30000
  });

  const { data: vmwareVms } = useQuery({
    queryKey: ["vmware-vms"],
    queryFn: async () => {
      const { data } = await supabase
        .from("vmware_vms")
        .select("*")
        .order("name");
      return data || [];
    },
    refetchInterval: 30000
  });

  // Servidores HP iLO — usado para os cartões de resumo e para o painel de alertas.
  const { data: iloServers } = useQuery({
    queryKey: ["ilo-servers-summary"],
    queryFn: async () => {
      const { data } = await supabase
        .from("ilo_servers")
        .select("id, name, status, health_summary, last_polled_at, health_storage, health_power, health_fans, health_temperature")
        .order("name");
      return data || [];
    },
    refetchInterval: 30000
  });



  const addWindowsServer = useMutation({
    mutationFn: async (data: any) => {
      if (editingItem) {
        const { error } = await supabase.from("windows_servers").update(data).eq("id", editingItem.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("windows_servers").insert(data);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["windows-servers"] });
      setShowAddDialog(false);
      setEditingItem(null);
      toast({ title: editingItem ? "Servidor atualizado" : "Servidor adicionado" });
    },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" })
  });

  const addVmwareHost = useMutation({
    mutationFn: async (data: any) => {
      if (editingItem) {
        const { error } = await supabase.from("vmware_hosts").update(data).eq("id", editingItem.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("vmware_hosts").insert(data);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["vmware-hosts"] });
      setShowAddDialog(false);
      setEditingItem(null);
      toast({ title: editingItem ? "Host atualizado" : "Host adicionado" });
    },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" })
  });

  const deleteItem = useMutation({
    mutationFn: async ({ table, id }: { table: string; id: string }) => {
      const { error } = await supabase.from(table as any).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["windows-servers"] });
      queryClient.invalidateQueries({ queryKey: ["vmware-hosts"] });
      toast({ title: "Removido com sucesso" });
    }
  });

  const handleSubmit = () => {
    if (activeTab === "windows") {
      addWindowsServer.mutate({ name: formData.name, host: formData.host, client_id: formData.client_id });
    } else {
      addVmwareHost.mutate({
        name: formData.name, host: formData.host, client_id: formData.client_id,
        username: formData.username, password: formData.password, port: formData.port
      });
    }
  };

  const openEdit = (item: any, type: string) => {
    setEditingItem(item);
    setFormData({
      name: item.name, host: item.host, client_id: item.client_id,
      username: item.username || "root", password: item.password || "", port: item.port || 443
    });
    setActiveTab(type);
    setShowAddDialog(true);
  };

  const openAdd = () => {
    setEditingItem(null);
    setFormData({ name: "", host: "", client_id: "", username: "root", password: "", port: 443 });
    setShowAddDialog(true);
  };

  const winOnline = windowsServers?.filter(s => s.status === "online").length || 0;
  const winOffline = windowsServers?.filter(s => s.status === "offline").length || 0;
  const vmOnline = vmwareHosts?.filter(h => h.status === "online").length || 0;
  const vmOffline = vmwareHosts?.filter(h => h.status === "offline").length || 0;
  const totalVms = vmwareVms?.length || 0;
  const runningVms = vmwareVms?.filter(v => v.power_state === "poweredOn").length || 0;

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

  // Generate alerts
  const STALE_THRESHOLD_MS = 10 * 60 * 1000; // 10 minutes
  const now = Date.now();

  const alerts: { type: "critical" | "warning" | "info"; message: string }[] = [];

  // Windows server alerts
  windowsServers?.forEach(srv => {
    if (srv.status === "offline") alerts.push({ type: "critical", message: `🔴 ${srv.name} está offline` });
    if (srv.cpu_usage != null && srv.cpu_usage > 90) alerts.push({ type: "critical", message: `🔥 ${srv.name} — CPU em ${srv.cpu_usage.toFixed(1)}%` });
    if (srv.cpu_usage != null && srv.cpu_usage > 70 && srv.cpu_usage <= 90) alerts.push({ type: "warning", message: `⚠️ ${srv.name} — CPU em ${srv.cpu_usage.toFixed(1)}%` });
    if (srv.ram_usage_pct != null && srv.ram_usage_pct > 90) alerts.push({ type: "critical", message: `🔥 ${srv.name} — RAM em ${srv.ram_usage_pct.toFixed(1)}%` });
    if (srv.ram_usage_pct != null && srv.ram_usage_pct > 70 && srv.ram_usage_pct <= 90) alerts.push({ type: "warning", message: `⚠️ ${srv.name} — RAM em ${srv.ram_usage_pct.toFixed(1)}%` });
    if (srv.disk_usage_pct != null && srv.disk_usage_pct > 90) alerts.push({ type: "critical", message: `🔥 ${srv.name} — Disco em ${srv.disk_usage_pct.toFixed(1)}%` });
    if (srv.disk_usage_pct != null && srv.disk_usage_pct > 70 && srv.disk_usage_pct <= 90) alerts.push({ type: "warning", message: `⚠️ ${srv.name} — Disco em ${srv.disk_usage_pct.toFixed(1)}%` });
    if (srv.last_polled_at && (now - new Date(srv.last_polled_at).getTime()) > STALE_THRESHOLD_MS) {
      alerts.push({ type: "warning", message: `⏰ ${srv.name} — Coletor sem atualização há ${formatTimeAgo(srv.last_polled_at)}` });
    }
    if (srv.services_status && Array.isArray(srv.services_status)) {
      (srv.services_status as any[]).filter((svc: any) => svc.status !== "Running").forEach((svc: any) => {
        alerts.push({ type: "critical", message: `🛑 ${srv.name} — Serviço "${svc.display_name || svc.name}" parado` });
      });
    }
  });

  // VMware host alerts
  vmwareHosts?.forEach(host => {
    if (host.status === "offline") alerts.push({ type: "critical", message: `🔴 Host VMware ${host.name} está offline` });
    if (host.cpu_usage_pct != null && host.cpu_usage_pct > 90) alerts.push({ type: "critical", message: `🔥 Host ${host.name} — CPU em ${host.cpu_usage_pct.toFixed(1)}%` });
    if (host.ram_usage_pct != null && host.ram_usage_pct > 90) alerts.push({ type: "critical", message: `🔥 Host ${host.name} — RAM em ${host.ram_usage_pct.toFixed(1)}%` });
    if (host.last_polled_at && (now - new Date(host.last_polled_at).getTime()) > STALE_THRESHOLD_MS) {
      alerts.push({ type: "warning", message: `⏰ Host ${host.name} — Coletor sem atualização há ${formatTimeAgo(host.last_polled_at)}` });
    }
    // Datastore alerts
    const datastores = (host.datastores || []) as any[];
    datastores.forEach((ds: any) => {
      if (ds.capacity_gb > 0) {
        const usedPct = ((ds.capacity_gb - ds.free_gb) / ds.capacity_gb) * 100;
        if (usedPct > 90) alerts.push({ type: "critical", message: `🔥 ${host.name} — Datastore "${ds.name}" em ${usedPct.toFixed(1)}%` });
        else if (usedPct > 70) alerts.push({ type: "warning", message: `⚠️ ${host.name} — Datastore "${ds.name}" em ${usedPct.toFixed(1)}%` });
      }
    });
  });

  // Alertas de hardware HP iLO
  const HEALTH_LABELS: Record<string, string> = {
    health_storage: "Armazenamento",
    health_power: "Fontes",
    health_fans: "Ventiladores",
    health_temperature: "Temperatura",
  };

  iloServers?.forEach(srv => {
    if (srv.status === "offline") alerts.push({ type: "critical", message: `🔴 iLO ${srv.name} inacessível` });
    if (srv.health_summary === "Critical") alerts.push({ type: "critical", message: `🔥 iLO ${srv.name} — saúde do hardware CRÍTICA` });
    else if (srv.health_summary === "Warning") alerts.push({ type: "warning", message: `⚠️ iLO ${srv.name} — hardware em atenção` });

    Object.entries(HEALTH_LABELS).forEach(([field, label]) => {
      const value = (srv as any)[field];
      if (value === "Critical") alerts.push({ type: "critical", message: `🔥 iLO ${srv.name} — ${label} em estado crítico` });
      else if (value === "Warning") alerts.push({ type: "warning", message: `⚠️ iLO ${srv.name} — ${label} em atenção` });
    });

    if (srv.last_polled_at && (now - new Date(srv.last_polled_at).getTime()) > STALE_THRESHOLD_MS) {
      alerts.push({ type: "warning", message: `⏰ iLO ${srv.name} — Coletor sem atualização há ${formatTimeAgo(srv.last_polled_at)}` });
    }
  });



  // Sort: critical first, then warning, then info
  alerts.sort((a, b) => {
    const order = { critical: 0, warning: 1, info: 2 };
    return order[a.type] - order[b.type];
  });

  // Collector status
  const lastWinPoll = windowsServers?.reduce((latest: string | null, s) => {
    if (!s.last_polled_at) return latest;
    if (!latest || new Date(s.last_polled_at) > new Date(latest)) return s.last_polled_at;
    return latest;
  }, null) || null;

  const lastVmPoll = vmwareHosts?.reduce((latest: string | null, h) => {
    if (!h.last_polled_at) return latest;
    if (!latest || new Date(h.last_polled_at) > new Date(latest)) return h.last_polled_at;
    return latest;
  }, null) || null;

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Monitoramento de Servidores</h1>
            <p className="text-muted-foreground mt-1">Windows Server, VMware ESXi & HP iLO4</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => {
              queryClient.invalidateQueries({ queryKey: ["windows-servers"] });
              queryClient.invalidateQueries({ queryKey: ["vmware-hosts"] });
              queryClient.invalidateQueries({ queryKey: ["vmware-vms"] });
            }}>
              <RefreshCw className="w-4 h-4 mr-1" /> Atualizar
            </Button>
            <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
              <DialogTrigger asChild>
                {/* Nas abas iLO e Guia o cadastro é feito dentro da própria aba. */}
                <Button onClick={openAdd} disabled={activeTab === "ilo" || activeTab === "guide"}>
                  <Plus className="w-4 h-4 mr-1" /> Adicionar
                </Button>
              </DialogTrigger>

              <DialogContent>
                <DialogHeader>
                  <DialogTitle>{editingItem ? "Editar" : "Adicionar"} {activeTab === "windows" ? "Servidor Windows" : "Host VMware"}</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <div>
                    <Label>Cliente</Label>
                    <Select value={formData.client_id} onValueChange={v => setFormData(p => ({ ...p, client_id: v }))}>
                      <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                      <SelectContent>
                        {clients?.map(c => <SelectItem key={c.id} value={c.id}>{c.full_name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Nome</Label>
                    <Input value={formData.name} onChange={e => setFormData(p => ({ ...p, name: e.target.value }))} placeholder="Ex: SRV-DC01" />
                  </div>
                  <div>
                    <Label>IP / Host</Label>
                    <Input value={formData.host} onChange={e => setFormData(p => ({ ...p, host: e.target.value }))} placeholder="192.168.1.100" />
                  </div>
                  {activeTab === "vmware" && (
                    <>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <Label>Usuário</Label>
                          <Input value={formData.username} onChange={e => setFormData(p => ({ ...p, username: e.target.value }))} />
                        </div>
                        <div>
                          <Label>Porta</Label>
                          <Input type="number" value={formData.port} onChange={e => setFormData(p => ({ ...p, port: Number(e.target.value) }))} />
                        </div>
                      </div>
                      <div>
                        <Label>Senha</Label>
                        <Input type="password" value={formData.password} onChange={e => setFormData(p => ({ ...p, password: e.target.value }))} />
                      </div>
                    </>
                  )}
                  <Button className="w-full" onClick={handleSubmit}>
                    {editingItem ? "Salvar" : "Adicionar"}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {/* Collector Status */}
        <div className="flex flex-wrap gap-4 text-sm">
          <div className="flex items-center gap-2 bg-muted/50 rounded-lg px-3 py-2">
            <Server className="w-4 h-4 text-blue-400" />
            <span className="text-muted-foreground">Coletor Windows:</span>
            {lastWinPoll ? (
              <span className={`font-medium ${(now - new Date(lastWinPoll).getTime()) > STALE_THRESHOLD_MS ? "text-amber-400" : "text-emerald-400"}`}>
                {formatTimeAgo(lastWinPoll)}
              </span>
            ) : <span className="text-muted-foreground">Nunca</span>}
          </div>
          <div className="flex items-center gap-2 bg-muted/50 rounded-lg px-3 py-2">
            <Monitor className="w-4 h-4 text-purple-400" />
            <span className="text-muted-foreground">Coletor VMware:</span>
            {lastVmPoll ? (
              <span className={`font-medium ${(now - new Date(lastVmPoll).getTime()) > STALE_THRESHOLD_MS ? "text-amber-400" : "text-emerald-400"}`}>
                {formatTimeAgo(lastVmPoll)}
              </span>
            ) : <span className="text-muted-foreground">Nunca</span>}
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-500/10"><Server className="w-5 h-5 text-blue-400" /></div>
              <div>
                <p className="text-sm text-muted-foreground">Windows Servers</p>
                <p className="text-2xl font-bold">{windowsServers?.length || 0}</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="p-2 rounded-lg bg-emerald-500/10"><CheckCircle className="w-5 h-5 text-emerald-400" /></div>
              <div>
                <p className="text-sm text-muted-foreground">Online</p>
                <p className="text-2xl font-bold text-emerald-400">{winOnline + vmOnline}</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="p-2 rounded-lg bg-purple-500/10"><Monitor className="w-5 h-5 text-purple-400" /></div>
              <div>
                <p className="text-sm text-muted-foreground">VMware Hosts</p>
                <p className="text-2xl font-bold">{vmwareHosts?.length || 0}</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="p-2 rounded-lg bg-orange-500/10"><ServerCog className="w-5 h-5 text-orange-400" /></div>
              <div>
                <p className="text-sm text-muted-foreground">Servidores iLO</p>
                <p className="text-2xl font-bold">
                  {iloServers?.filter(s => s.health_summary === "OK" && s.status !== "offline").length || 0}/{iloServers?.length || 0}
                </p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="p-2 rounded-lg bg-cyan-500/10"><Power className="w-5 h-5 text-cyan-400" /></div>
              <div>
                <p className="text-sm text-muted-foreground">VMs Rodando</p>
                <p className="text-2xl font-bold">{runningVms}/{totalVms}</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Alerts Panel */}
        {alerts.length > 0 && (
          <Card className="border-amber-500/30">
            <CardHeader className="py-3 px-4">
              <CardTitle className="text-sm flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-400" />
                Alertas ({alerts.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="max-h-60 overflow-y-auto divide-y divide-border">
                {alerts.map((alert, i) => (
                  <div
                    key={i}
                    className={`px-4 py-2 text-sm flex items-center gap-2 ${
                      alert.type === "critical" ? "bg-red-500/5 text-red-400" :
                      alert.type === "warning" ? "bg-amber-500/5 text-amber-400" :
                      "bg-blue-500/5 text-blue-400"
                    }`}
                  >
                    {alert.type === "critical" && <XCircle className="w-4 h-4 shrink-0" />}
                    {alert.type === "warning" && <AlertTriangle className="w-4 h-4 shrink-0" />}
                    {alert.type === "info" && <CheckCircle className="w-4 h-4 shrink-0" />}
                    {alert.message}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {alerts.length === 0 && (
          <div className="flex items-center gap-2 text-sm text-emerald-400 bg-emerald-500/5 border border-emerald-500/20 rounded-lg px-4 py-3">
            <CheckCircle className="w-4 h-4" />
            Todos os servidores estão operando normalmente.
          </div>
        )}

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="windows"><Server className="w-4 h-4 mr-1" /> Windows</TabsTrigger>
            <TabsTrigger value="vmware"><Monitor className="w-4 h-4 mr-1" /> VMware</TabsTrigger>
            <TabsTrigger value="ilo"><ServerCog className="w-4 h-4 mr-1" /> HP iLO4</TabsTrigger>
            <TabsTrigger value="guide"><Download className="w-4 h-4 mr-1" /> Guia Coletor</TabsTrigger>

          </TabsList>

          {/* Windows Tab */}
          <TabsContent value="windows">
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Status</TableHead>
                      <TableHead>Nome</TableHead>
                      <TableHead>Cliente</TableHead>
                      <TableHead>IP</TableHead>
                      <TableHead>CPU</TableHead>
                      <TableHead>RAM</TableHead>
                      <TableHead>Disco</TableHead>
                      <TableHead>Uptime</TableHead>
                      <TableHead>Últ. Coleta</TableHead>
                      <TableHead>Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {windowsServers?.map(srv => (
                      <TableRow key={srv.id}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <div className={`w-2.5 h-2.5 rounded-full ${statusColor(srv.status)}`} />
                            {statusBadge(srv.status)}
                          </div>
                        </TableCell>
                        <TableCell className="font-medium">{srv.name}</TableCell>
                        <TableCell>{(srv as any).clients?.full_name || "—"}</TableCell>
                        <TableCell className="font-mono text-xs">{srv.host}</TableCell>
                        <TableCell>
                          {srv.cpu_usage != null ? (
                            <div className="flex items-center gap-1.5">
                              <div className="w-16 h-2 bg-muted rounded-full overflow-hidden">
                                <div className={`h-full rounded-full ${srv.cpu_usage > 90 ? "bg-red-500" : srv.cpu_usage > 70 ? "bg-amber-500" : "bg-emerald-500"}`} style={{ width: `${srv.cpu_usage}%` }} />
                              </div>
                              <span className="text-xs">{formatPct(srv.cpu_usage)}</span>
                            </div>
                          ) : "—"}
                        </TableCell>
                        <TableCell>
                          {srv.ram_usage_pct != null ? (
                            <div className="flex items-center gap-1.5">
                              <div className="w-16 h-2 bg-muted rounded-full overflow-hidden">
                                <div className={`h-full rounded-full ${srv.ram_usage_pct > 90 ? "bg-red-500" : srv.ram_usage_pct > 70 ? "bg-amber-500" : "bg-emerald-500"}`} style={{ width: `${srv.ram_usage_pct}%` }} />
                              </div>
                              <span className="text-xs">{formatPct(srv.ram_usage_pct)}</span>
                            </div>
                          ) : "—"}
                        </TableCell>
                        <TableCell>
                          {srv.disk_usage_pct != null ? (
                            <div className="flex items-center gap-1.5">
                              <div className="w-16 h-2 bg-muted rounded-full overflow-hidden">
                                <div className={`h-full rounded-full ${srv.disk_usage_pct > 90 ? "bg-red-500" : srv.disk_usage_pct > 70 ? "bg-amber-500" : "bg-emerald-500"}`} style={{ width: `${srv.disk_usage_pct}%` }} />
                              </div>
                              <span className="text-xs">{formatPct(srv.disk_usage_pct)}</span>
                            </div>
                          ) : "—"}
                        </TableCell>
                        <TableCell className="text-xs">{formatUptime(srv.uptime_seconds as number | null)}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {srv.last_polled_at ? formatTimeAgo(srv.last_polled_at) : "Nunca"}
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            <Button size="icon" variant="ghost" onClick={() => openEdit(srv, "windows")}><Edit className="w-4 h-4" /></Button>
                            <Button size="icon" variant="ghost" className="text-destructive" onClick={() => deleteItem.mutate({ table: "windows_servers", id: srv.id })}><Trash2 className="w-4 h-4" /></Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                    {(!windowsServers || windowsServers.length === 0) && (
                      <TableRow>
                        <TableCell colSpan={10} className="text-center py-8 text-muted-foreground">
                          Nenhum servidor Windows cadastrado
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            {/* Services detail for each server */}
            {windowsServers?.filter(s => s.services_status && (s.services_status as any[]).length > 0).map(srv => (
              <Card key={srv.id} className="mt-4">
                <CardHeader className="py-3 px-4">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Activity className="w-4 h-4" /> Serviços — {srv.name}
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Serviço</TableHead>
                        <TableHead>Display Name</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(srv.services_status as any[])?.map((svc: any, i: number) => (
                        <TableRow key={i}>
                          <TableCell className="font-mono text-xs">{svc.name}</TableCell>
                          <TableCell>{svc.display_name || svc.name}</TableCell>
                          <TableCell>
                            {svc.status === "Running" ? (
                              <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30">Rodando</Badge>
                            ) : (
                              <Badge className="bg-red-500/20 text-red-400 border-red-500/30">Parado</Badge>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            ))}
          </TabsContent>

          {/* VMware Tab */}
          <TabsContent value="vmware">
            <div className="space-y-4">
              {vmwareHosts?.map(host => {
                const vms = vmwareVms?.filter(v => v.host_id === host.id) || [];
                const isExpanded = expandedVmHost === host.id;
                const datastores = (host.datastores || []) as any[];
                return (
                  <Card key={host.id}>
                    <CardHeader className="py-3 px-4 cursor-pointer" onClick={() => setExpandedVmHost(isExpanded ? null : host.id)}>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                          <div className={`w-2.5 h-2.5 rounded-full ${statusColor(host.status)}`} />
                          <div>
                            <CardTitle className="text-base">{host.name}</CardTitle>
                            <p className="text-xs text-muted-foreground">{(host as any).clients?.full_name} · {host.host} · {host.esxi_version || "ESXi"}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-4 text-sm">
                          {host.cpu_usage_pct != null && (
                            <div className="flex items-center gap-1"><Cpu className="w-3 h-3" />{formatPct(host.cpu_usage_pct)}</div>
                          )}
                          {host.ram_usage_pct != null && (
                            <div className="flex items-center gap-1"><MemoryStick className="w-3 h-3" />{formatPct(host.ram_usage_pct)}</div>
                          )}
                          <Badge variant="secondary">{vms.filter(v => v.power_state === "poweredOn").length}/{vms.length} VMs</Badge>
                          {statusBadge(host.status)}
                          <div className="flex gap-1">
                            <Button size="icon" variant="ghost" onClick={e => { e.stopPropagation(); openEdit(host, "vmware"); }}><Edit className="w-4 h-4" /></Button>
                            <Button size="icon" variant="ghost" className="text-destructive" onClick={e => { e.stopPropagation(); deleteItem.mutate({ table: "vmware_hosts", id: host.id }); }}><Trash2 className="w-4 h-4" /></Button>
                          </div>
                        </div>
                      </div>
                    </CardHeader>
                    {isExpanded && (
                      <CardContent className="pt-0 space-y-4">
                        {/* Host Details */}
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                          <div className="bg-muted/50 rounded-lg p-3">
                            <p className="text-xs text-muted-foreground">CPU Cores</p>
                            <p className="text-lg font-bold">{host.cpu_cores || "—"}</p>
                          </div>
                          <div className="bg-muted/50 rounded-lg p-3">
                            <p className="text-xs text-muted-foreground">RAM Total</p>
                            <p className="text-lg font-bold">{formatGB(host.ram_total_gb)}</p>
                          </div>
                          <div className="bg-muted/50 rounded-lg p-3">
                            <p className="text-xs text-muted-foreground">RAM Usada</p>
                            <p className="text-lg font-bold">{formatGB(host.ram_used_gb)}</p>
                          </div>
                          <div className="bg-muted/50 rounded-lg p-3">
                            <p className="text-xs text-muted-foreground">Uptime</p>
                            <p className="text-lg font-bold">{formatUptime(host.uptime_seconds as number | null)}</p>
                          </div>
                        </div>

                        {/* Datastores */}
                        {datastores.length > 0 && (
                          <div>
                            <h4 className="text-sm font-medium mb-2 flex items-center gap-1"><HardDrive className="w-4 h-4" /> Datastores</h4>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                              {datastores.map((ds: any, i: number) => {
                                const usedPct = ds.capacity_gb > 0 ? ((ds.capacity_gb - ds.free_gb) / ds.capacity_gb * 100) : 0;
                                return (
                                  <div key={i} className="bg-muted/50 rounded-lg p-3">
                                    <div className="flex justify-between text-sm mb-1">
                                      <span className="font-medium">{ds.name}</span>
                                      <span className="text-muted-foreground">{formatGB(ds.capacity_gb - ds.free_gb)} / {formatGB(ds.capacity_gb)}</span>
                                    </div>
                                    <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                                      <div className={`h-full rounded-full ${usedPct > 90 ? "bg-red-500" : usedPct > 70 ? "bg-amber-500" : "bg-emerald-500"}`} style={{ width: `${usedPct}%` }} />
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}

                        {/* VMs */}
                        <div>
                          <h4 className="text-sm font-medium mb-2 flex items-center gap-1"><Monitor className="w-4 h-4" /> Máquinas Virtuais</h4>
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>Estado</TableHead>
                                <TableHead>Nome</TableHead>
                                <TableHead>SO</TableHead>
                                <TableHead>CPU</TableHead>
                                <TableHead>RAM</TableHead>
                                <TableHead>IP</TableHead>
                                <TableHead>Disco</TableHead>
                                <TableHead>VMware Tools</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {vms.map(vm => (
                                <TableRow key={vm.id}>
                                  <TableCell>
                                    {vm.power_state === "poweredOn" ? (
                                      <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30">Ligada</Badge>
                                    ) : (
                                      <Badge className="bg-muted text-muted-foreground">Desligada</Badge>
                                    )}
                                  </TableCell>
                                  <TableCell className="font-medium">{vm.name}</TableCell>
                                  <TableCell className="text-xs">{vm.guest_os || "—"}</TableCell>
                                  <TableCell>{vm.cpu_count || "—"} vCPU</TableCell>
                                  <TableCell>{vm.ram_mb ? `${(vm.ram_mb / 1024).toFixed(1)} GB` : "—"}</TableCell>
                                  <TableCell className="font-mono text-xs">{vm.ip_address || "—"}</TableCell>
                                  <TableCell>{formatGB(vm.disk_used_gb)} / {formatGB(vm.disk_provisioned_gb)}</TableCell>
                                  <TableCell>
                                    {vm.tools_status === "toolsOk" ? (
                                      <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30">OK</Badge>
                                    ) : vm.tools_status ? (
                                      <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30">{vm.tools_status}</Badge>
                                    ) : "—"}
                                  </TableCell>
                                </TableRow>
                              ))}
                              {vms.length === 0 && (
                                <TableRow>
                                  <TableCell colSpan={8} className="text-center py-4 text-muted-foreground">
                                    Nenhuma VM encontrada
                                  </TableCell>
                                </TableRow>
                              )}
                            </TableBody>
                          </Table>
                        </div>
                      </CardContent>
                    )}
                  </Card>
                );
              })}
              {(!vmwareHosts || vmwareHosts.length === 0) && (
                <Card><CardContent className="py-8 text-center text-muted-foreground">Nenhum host VMware cadastrado</CardContent></Card>
              )}
            </div>
          </TabsContent>

          {/* HP iLO4 Tab */}
          <TabsContent value="ilo">
            <IloServersTab clients={clients || []} />
          </TabsContent>



          {/* Guide Tab */}
          <TabsContent value="guide">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><Download className="w-5 h-5" /> Guia de Instalação dos Coletores</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div>
                  <h3 className="text-lg font-semibold mb-2 flex items-center gap-2"><Server className="w-5 h-5 text-blue-400" /> Coletor Windows (PowerShell Centralizado)</h3>
                  <p className="text-sm text-muted-foreground mb-3">
                    Um único script PowerShell roda em <strong>uma máquina Windows</strong> da rede e monitora <strong>todos os servidores</strong> remotamente via WMI. Ele busca a lista de servidores automaticamente do painel.
                  </p>
                  <div className="bg-muted rounded-lg p-4 space-y-2">
                    <p className="text-sm font-medium">1. Baixe o script na máquina coletora:</p>
                    <code className="text-xs block bg-background p-2 rounded">
                      Invoke-WebRequest -Uri "{window.location.origin}/windows-server-collector.ps1" -OutFile "C:\Scripts\windows-collector.ps1"
                    </code>
                    <p className="text-sm font-medium mt-3">2. Configure apenas a ANON_KEY no script:</p>
                    <code className="text-xs block bg-background p-2 rounded whitespace-pre">{`$SUPABASE_URL = "${supabaseUrl}"
$SUPABASE_ANON_KEY = "${anonKey}"
$SERVICES_TO_MONITOR = @("MSSQLSERVER","W3SVC","DNS","DHCP")`}</code>
                    <p className="text-sm font-medium mt-3">3. Pré-requisitos na rede:</p>
                    <div className="text-xs bg-background p-2 rounded space-y-1">
                      <p>• A conta que roda o script precisa de permissão WMI nos servidores remotos</p>
                      <p>• Firewall: liberar porta WMI (135 + portas dinâmicas) entre a máquina coletora e os servidores</p>
                      <p>• Habilitar serviço "Windows Remote Management" nos servidores alvo</p>
                    </div>
                    <p className="text-sm font-medium mt-3">4. Agende via Task Scheduler (a cada 5 min):</p>
                    <code className="text-xs block bg-background p-2 rounded whitespace-pre">{`$action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-ExecutionPolicy Bypass -File C:\\Scripts\\windows-collector.ps1"
$trigger = New-ScheduledTaskTrigger -RepetitionInterval (New-TimeSpan -Minutes 5) -Once -At (Get-Date)
Register-ScheduledTask -TaskName "WindowsServerCollector" -Action $action -Trigger $trigger -RunLevel Highest -User "SYSTEM"`}</code>
                  </div>
                </div>

                <div>
                  <h3 className="text-lg font-semibold mb-2 flex items-center gap-2"><Monitor className="w-5 h-5 text-purple-400" /> Coletor VMware (Node.js via SSH)</h3>
                  <p className="text-sm text-muted-foreground mb-3">
                    O coletor roda em uma VPS externa e consulta os hosts ESXi via <strong>SSH</strong> (vim-cmd / esxcli), garantindo compatibilidade com ESXi 6.5+. Requer serviço SSH ativo no host.
                  </p>
                  <div className="bg-muted rounded-lg p-4 space-y-2">
                    <p className="text-sm font-medium">1. Na VPS, instale a dependência:</p>
                    <code className="text-xs block bg-background p-2 rounded">npm install ssh2</code>
                    <p className="text-sm font-medium mt-3">2. Baixe o script:</p>
                    <code className="text-xs block bg-background p-2 rounded">
                      curl -o vmware-collector.js {window.location.origin}/vmware-collector.js
                    </code>
                    <p className="text-sm font-medium mt-3">3. Configure a ANON_KEY no script e rode como serviço (systemd):</p>
                    <code className="text-xs block bg-background p-2 rounded whitespace-pre">{`[Unit]
Description=VMware Collector (SSH)
After=network.target

[Service]
ExecStart=/usr/bin/node /opt/collectors/vmware-collector.js
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target`}</code>
                    <p className="text-sm font-medium mt-3">4. Pré-requisitos:</p>
                    <div className="text-xs bg-background p-2 rounded space-y-1">
                      <p>• Serviço SSH habilitado no host ESXi (porta 22)</p>
                      <p>• Credenciais com acesso SSH (usuário root)</p>
                      <p>• Liberação de firewall entre a VPS e os hosts na porta 22</p>
                    </div>
                  </div>
                </div>

                <div>
                  <h3 className="text-lg font-semibold mb-2 flex items-center gap-2"><ServerCog className="w-5 h-5 text-orange-400" /> Coletor HP iLO4 (Node.js via Redfish/HTTPS)</h3>
                  <p className="text-sm text-muted-foreground mb-3">
                    Um único script Node.js (sem dependências externas) roda em uma VPS ou máquina com acesso à
                    <strong> rede de gerenciamento dos iLOs</strong> e coleta temperaturas, ventiladores, fontes, voltagens,
                    discos/RAID (SmartStorage) e o log de eventos de hardware (IML) de todos os servidores cadastrados na aba HP iLO4.
                  </p>
                  <div className="bg-muted rounded-lg p-4 space-y-2">
                    <p className="text-sm font-medium">1. Configure o iLO4 de cada servidor:</p>
                    <div className="text-xs bg-background p-2 rounded space-y-1">
                      <p>• Crie um usuário dedicado somente-leitura (permissão apenas de <strong>Login</strong>)</p>
                      <p>• Mantenha a API Redfish/REST habilitada em <em>Security → Access Settings</em> (padrão no iLO4 2.3+)</p>
                      <p>• Use HTTPS na porta 443 e libere o firewall entre a máquina coletora e o iLO</p>
                      <p>• Recomendado: firmware do iLO4 na versão 2.55 ou superior</p>
                    </div>
                    <p className="text-sm font-medium mt-3">2. Baixe o script na máquina coletora:</p>
                    <code className="text-xs block bg-background p-2 rounded">
                      curl -o ilo-collector.js {window.location.origin}/ilo-collector.js
                    </code>
                    <p className="text-sm font-medium mt-3">3. Execute (coleta contínua a cada 5 minutos):</p>
                    <code className="text-xs block bg-background p-2 rounded whitespace-pre">{`node ilo-collector.js \\
  --url "${supabaseUrl}" \\
  --key "${anonKey}" \\
  --intervalo 300`}</code>
                    <p className="text-sm font-medium mt-3">4. Ou agende via cron (execução única por ciclo):</p>
                    <code className="text-xs block bg-background p-2 rounded whitespace-pre">{`*/5 * * * * /usr/bin/node /opt/collectors/ilo-collector.js --url "${supabaseUrl}" --key "SUA_ANON_KEY" --uma-vez`}</code>
                    <p className="text-sm font-medium mt-3">5. Alertas:</p>
                    <div className="text-xs bg-background p-2 rounded space-y-1">
                      <p>• Servidor inacessível, saúde crítica e novos eventos críticos do IML disparam WhatsApp para os administradores</p>
                      <p>• As condições de atenção/crítico também aparecem no painel de alertas desta página</p>
                      <p>• Certificados autoassinados do iLO são aceitos por padrão; use <code>--seguro</code> para exigir certificado válido</p>
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap gap-3">
                  <Button variant="outline" asChild>
                    <a href="/windows-server-collector.ps1" download>
                      <Download className="w-4 h-4 mr-1" /> Baixar Coletor Windows (.ps1)
                    </a>
                  </Button>
                  <Button variant="outline" asChild>
                    <a href="/vmware-collector.js" download>
                      <Download className="w-4 h-4 mr-1" /> Baixar Coletor VMware (.js)
                    </a>
                  </Button>
                  <Button variant="outline" asChild>
                    <a href="/ilo-collector.js" download>
                      <Download className="w-4 h-4 mr-1" /> Baixar Coletor HP iLO4 (.js)
                    </a>
                  </Button>
                </div>

              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </AdminLayout>
  );
};

export default ServerMonitor;
