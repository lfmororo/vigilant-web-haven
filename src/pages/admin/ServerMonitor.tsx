import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import AdminLayout from "@/components/admin/AdminLayout";
import { AgentVersionAlert } from "@/components/admin/AgentVersionAlert";
import { AgentDownloadButton } from "@/components/admin/AgentDownloadButton";
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
  Power, AlertTriangle, CheckCircle, XCircle, Download, ServerCog, Boxes, LayoutDashboard, Terminal, Database, KeyRound
} from "lucide-react";
import LinuxServersTab from "@/components/admin/servers/LinuxServersTab";
import SqlServerTab from "@/components/admin/servers/SqlServerTab";
import MonitorAgentsTab from "@/components/admin/servers/MonitorAgentsTab";
import MonitoringOverview from "@/components/admin/servers/MonitoringOverview";
import { UsageBar, fmtAgo } from "@/components/admin/servers/monitorUi";
import IloServersTab from "@/components/admin/servers/IloServersTab";
import ProxmoxTab from "@/components/admin/servers/ProxmoxTab";
import DiagnosticsTab from "@/components/admin/servers/DiagnosticsTab";
import DiagnosticsHistoryTab from "@/components/admin/servers/DiagnosticsHistoryTab";
import ADHealthTab from "@/components/admin/servers/ADHealthTab";


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
  const [activeTab, setActiveTab] = useState("overview");
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
        .select("id, client_id, name, host, username, port, status, is_active, cpu_cores, cpu_usage_pct, ram_total_gb, ram_used_gb, ram_usage_pct, esxi_version, uptime_seconds, datastores, last_polled_at, last_error, created_at, updated_at, clients(full_name)")
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
      const payload: Record<string, any> = {
        name: formData.name, host: formData.host, client_id: formData.client_id,
        username: formData.username, port: formData.port
      };
      // Senha vazia na edição = manter a atual.
      if (formData.password) payload.password = formData.password;
      addVmwareHost.mutate(payload);
    }
  };

  const openEdit = (item: any, type: string) => {
    setEditingItem(item);
    setFormData({
      name: item.name, host: item.host, client_id: item.client_id,
      username: item.username || "root", password: "", port: item.port || 443
    });
    setActiveTab(type);
    setShowAddDialog(true);
  };

  const openAdd = () => {
    setEditingItem(null);
    setFormData({ name: "", host: "", client_id: "", username: "root", password: "", port: 443 });
    setShowAddDialog(true);
  };

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  const bundleOptions = { url: supabaseUrl, key: anonKey, interval: 300 };

  return (
    <AdminLayout>
      <AgentVersionAlert types={["windows", "linux", "sqlserver", "vmware", "ilo", "idrac", "proxmox"]} className="mb-4" />
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
                {/* Cadastro manual só para Windows e VMware; as demais abas têm o próprio cadastro. */}
                <Button onClick={openAdd} disabled={activeTab !== "windows" && activeTab !== "vmware"}>
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

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="overview"><LayoutDashboard className="w-4 h-4 mr-1" /> Visão geral</TabsTrigger>
            <TabsTrigger value="windows"><Server className="w-4 h-4 mr-1" /> Windows</TabsTrigger>
            <TabsTrigger value="linux"><Terminal className="w-4 h-4 mr-1" /> Linux</TabsTrigger>
            <TabsTrigger value="sqlserver"><Database className="w-4 h-4 mr-1" /> SQL Server</TabsTrigger>
            <TabsTrigger value="vmware"><Monitor className="w-4 h-4 mr-1" /> VMware</TabsTrigger>
            <TabsTrigger value="ilo"><ServerCog className="w-4 h-4 mr-1" /> iLO4 / iDRAC9</TabsTrigger>
            <TabsTrigger value="proxmox"><Boxes className="w-4 h-4 mr-1" /> Proxmox</TabsTrigger>
            <TabsTrigger value="ad-health"><Activity className="w-4 h-4 mr-1" /> Saúde do AD</TabsTrigger>
            <TabsTrigger value="diagnostics"><Activity className="w-4 h-4 mr-1" /> Diagnósticos</TabsTrigger>
            <TabsTrigger value="diagnostics-history"><Activity className="w-4 h-4 mr-1" /> Histórico Diagnósticos</TabsTrigger>

            <TabsTrigger value="agents"><KeyRound className="w-4 h-4 mr-1" /> Agentes & Alertas</TabsTrigger>
            <TabsTrigger value="guide"><Download className="w-4 h-4 mr-1" /> Guia Coletor</TabsTrigger>

          </TabsList>

          <TabsContent value="overview">
            <MonitoringOverview clients={clients} onOpenTab={setActiveTab} />
          </TabsContent>

          <TabsContent value="linux"><LinuxServersTab clients={clients} /></TabsContent>
          <TabsContent value="sqlserver"><SqlServerTab clients={clients} /></TabsContent>
          <TabsContent value="agents"><MonitorAgentsTab clients={clients} /></TabsContent>

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
                          {Array.isArray((srv as any).disks) && (srv as any).disks.length > 0 ? (
                            <div className="space-y-1">
                              {((srv as any).disks as any[]).map((d: any, i: number) => (
                                <UsageBar key={i} label={String(d.drive ?? d.letter ?? d.name ?? "").replace(/\\$/, "")} value={d.usage_pct} />
                              ))}
                            </div>
                          ) : <UsageBar value={srv.disk_usage_pct} />}
                          {(srv as any).pending_reboot && <Badge variant="outline" className="mt-1 border-amber-500/40 text-amber-400 text-[10px]">reboot pendente</Badge>}
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

            {/* Detalhe por servidor: serviços, top processos e eventos */}
            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              {windowsServers?.filter((s: any) => (s.services_status as any[])?.length || (s.top_processes as any[])?.length || (s.event_errors as any[])?.length).map((srv: any) => {
                const services = (Array.isArray(srv.services_status) ? srv.services_status : []) as any[];
                const procs = (Array.isArray(srv.top_processes) ? srv.top_processes : []) as any[];
                const events = (Array.isArray(srv.event_errors) ? srv.event_errors : []) as any[];
                const byCpu = procs.filter((p) => p.by !== "memory").slice(0, 5);
                const byMem = procs.filter((p) => p.by === "memory").slice(0, 5);
                return (
                  <Card key={srv.id}>
                    <CardHeader className="py-3 px-4">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <Server className="w-4 h-4" /> {srv.name}
                        {srv.pending_reboot && <Badge variant="outline" className="border-amber-500/40 text-amber-400 text-[10px]">reboot pendente</Badge>}
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="px-4 pb-4 space-y-3 text-xs">
                      {services.length > 0 && (
                        <div>
                          <p className="mb-1 font-medium text-muted-foreground">Serviços</p>
                          <div className="flex flex-wrap gap-1">
                            {services.map((svc, i) => (
                              <Badge key={i} variant="outline" title={svc.display_name || svc.name}
                                className={svc.status === "Running" ? "border-emerald-500/30 text-emerald-400" : "border-red-500/30 bg-red-500/10 text-red-400"}>
                                {svc.name}{svc.status !== "Running" ? ` · ${svc.status || "parado"}` : ""}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      )}
                      {procs.length > 0 && (
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <p className="mb-1 font-medium text-muted-foreground">Top CPU</p>
                            {byCpu.map((p, i) => <div key={i} className="flex justify-between gap-2"><span className="truncate">{p.name}</span><span className="tabular-nums">{p.cpu_pct ?? 0}%</span></div>)}
                          </div>
                          <div>
                            <p className="mb-1 font-medium text-muted-foreground">Top memória</p>
                            {byMem.map((p, i) => <div key={i} className="flex justify-between gap-2"><span className="truncate">{p.name}</span><span className="tabular-nums">{p.mem_mb != null ? `${Math.round(p.mem_mb)} MB` : "—"}</span></div>)}
                          </div>
                        </div>
                      )}
                      <div>
                        <p className="mb-1 font-medium text-muted-foreground">Eventos recentes (System)</p>
                        {events.length === 0 ? <p className="text-muted-foreground">Nenhum erro desde a última coleta.</p> : (
                          <div className="max-h-40 space-y-1 overflow-y-auto">
                            {events.slice(0, 10).map((e, i) => (
                              <div key={i} className="rounded border border-border px-2 py-1">
                                <div className="flex justify-between gap-2">
                                  <span className={e.level === "Critical" ? "font-medium text-red-400" : "text-amber-400"}>{e.level} · {e.source} ({e.event_id})</span>
                                  <span className="text-muted-foreground">{e.time ? fmtAgo(e.time) : ""}</span>
                                </div>
                                {e.message && <p className="line-clamp-2 text-muted-foreground">{e.message}</p>}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          
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

          <TabsContent value="proxmox">
            <ProxmoxTab clients={clients || []} />
          </TabsContent>

          <TabsContent value="diagnostics">
            <DiagnosticsTab clients={clients || []} />
          </TabsContent>

          <TabsContent value="ad-health">
            <ADHealthTab clients={clients || []} />
          </TabsContent>
          <TabsContent value="diagnostics-history">
            <DiagnosticsHistoryTab clients={clients || []} />
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

                <div>
                  <h3 className="font-semibold mb-2 flex items-center gap-2"><ServerCog className="w-4 h-4" /> Dell iDRAC9 (Redfish)</h3>
                  <p className="text-sm text-muted-foreground mb-2">
                    Coletor Node.js dedicado aos servidores Dell. Coleta status geral, CPU e memória, temperaturas,
                    voltagens, ventoinhas, fontes, controladoras RAID, volumes, discos físicos e os eventos do SEL
                    de todos os servidores cadastrados com o fabricante <strong>Dell (iDRAC9)</strong>.
                  </p>
                  <div className="bg-muted rounded-lg p-4 space-y-2">
                    <p className="text-sm font-medium">1. Configure o iDRAC9 de cada servidor:</p>
                    <div className="text-xs bg-background p-2 rounded space-y-1">
                      <p>• Crie um usuário local com função <strong>Read Only</strong> em <em>iDRAC Settings → Users</em></p>
                      <p>• Mantenha a API Redfish habilitada em <em>iDRAC Settings → Services</em> (padrão no iDRAC9)</p>
                      <p>• Garanta conectividade HTTPS (porta 443) entre a máquina coletora e o iDRAC</p>
                      <p>• Opcional: em <em>Configuration → System Settings → Alert Configuration</em> configure e-mail/SNMP traps direto no iDRAC</p>
                    </div>
                    <p className="text-sm font-medium mt-3">2. Baixe o script na máquina coletora:</p>
                    <code className="text-xs block bg-background p-2 rounded">
                      curl -o idrac-collector.js {window.location.origin}/idrac-collector.js
                    </code>
                    <p className="text-sm font-medium mt-3">3. Execute (coleta contínua a cada 5 minutos):</p>
                    <code className="text-xs block bg-background p-2 rounded whitespace-pre">{`node idrac-collector.js \\
  --url "${supabaseUrl}" \\
  --key "${anonKey}" \\
  --intervalo 300`}</code>
                    <p className="text-sm font-medium mt-3">4. Ou agende via cron (execução única por ciclo):</p>
                    <code className="text-xs block bg-background p-2 rounded whitespace-pre">{`*/5 * * * * /usr/bin/node /opt/collectors/idrac-collector.js --url "${supabaseUrl}" --key "SUA_ANON_KEY" --uma-vez`}</code>
                    <p className="text-sm font-medium mt-3">5. Alertas:</p>
                    <div className="text-xs bg-background p-2 rounded space-y-1">
                      <p>• Cada sensor em falha (temperatura, ventoinha, fonte, disco) gera um alerta individual via WhatsApp</p>
                      <p>• Servidor inacessível, saúde crítica e novos eventos críticos do SEL também notificam os administradores</p>
                      <p>• Certificados autoassinados do iDRAC são aceitos por padrão; use <code>--seguro</code> para exigir certificado válido</p>
                    </div>
                  </div>
                </div>

                <div>
                  <h3 className="font-semibold mb-2 flex items-center gap-2"><Boxes className="w-4 h-4" /> Proxmox VE (API REST)</h3>
                  <p className="text-sm text-muted-foreground mb-2">
                    Coletor Node.js que consulta a API do Proxmox VE e envia métricas do nó, storages e VMs/containers.
                  </p>
                  <div className="bg-muted rounded-lg p-4 space-y-2">
                    <p className="text-sm font-medium">1. Crie um API Token no Proxmox (recomendado):</p>
                    <div className="text-xs bg-background p-2 rounded space-y-1">
                      <p>• Datacenter → Permissions → API Tokens → Add (ex.: <code>root@pam!monitor</code>)</p>
                      <p>• Desmarque “Privilege Separation” ou conceda a role <strong>PVEAuditor</strong> em <code>/</code></p>
                      <p>• Copie o Secret exibido uma única vez e cadastre-o na aba Proxmox</p>
                    </div>
                    <p className="text-sm font-medium mt-3">2. Baixe o script na máquina coletora:</p>
                    <code className="text-xs block bg-background p-2 rounded">
                      curl -o proxmox-collector.js {window.location.origin}/proxmox-collector.js
                    </code>
                    <p className="text-sm font-medium mt-3">3. Execute (coleta contínua a cada 5 minutos):</p>
                    <code className="text-xs block bg-background p-2 rounded whitespace-pre">{`node proxmox-collector.js \\
  --url "${supabaseUrl}" \\
  --key "${anonKey}" \\
  --intervalo 300`}</code>
                    <p className="text-sm font-medium mt-3">4. Ou agende via cron (execução única por ciclo):</p>
                    <code className="text-xs block bg-background p-2 rounded whitespace-pre">{`*/5 * * * * /usr/bin/node /opt/collectors/proxmox-collector.js --url "${supabaseUrl}" --key "SUA_ANON_KEY" --uma-vez`}</code>
                    <p className="text-xs text-muted-foreground mt-2">
                      Certificados autoassinados do Proxmox são aceitos por padrão; use <code>--seguro</code> para exigir certificado válido.
                    </p>
                  </div>
                </div>

                <div>
                  <h3 className="font-semibold mb-2 flex items-center gap-2"><Download className="w-4 h-4" /> Instalar como serviço do Windows</h3>
                  <p className="text-sm text-muted-foreground mb-2">
                    O script <code>instalar-agente-servico.ps1</code> acompanha todos os coletores. Coloque-o na
                    <strong> mesma pasta em que o agente foi extraído</strong>: ele detecta o coletor, registra o serviço
                    apontando para essa pasta, cria logs em <code>.\logs\</code> e reinicia automaticamente em caso de falha.
                  </p>
                  <div className="bg-muted rounded-lg p-4 space-y-2">
                    <p className="text-sm font-medium">1. Abra o PowerShell como Administrador na pasta do agente e execute:</p>
                    <code className="text-xs block bg-background p-2 rounded whitespace-pre">{`.\\instalar-agente-servico.ps1 \`
  -Url "${supabaseUrl}" \`
  -Key "${anonKey}" \`
  -Intervalo 300`}</code>
                    <p className="text-sm font-medium mt-3">2. Instalando um coletor específico (quando há vários na pasta):</p>
                    <code className="text-xs block bg-background p-2 rounded whitespace-pre">{`.\\instalar-agente-servico.ps1 -Script proxmox-collector.js -Nome "ColetorProxmox" -Url "${supabaseUrl}" -Key "SUA_ANON_KEY"`}</code>
                    <p className="text-sm font-medium mt-3">3. Gerenciar o serviço:</p>
                    <div className="text-xs bg-background p-2 rounded space-y-1">
                      <p>• Status: <code>Get-Service Agente_proxmoxcollector</code></p>
                      <p>• Parar/Iniciar: <code>Stop-Service …</code> / <code>Start-Service …</code></p>
                      <p>• Desinstalar: <code>.\instalar-agente-servico.ps1 -Desinstalar</code></p>
                      <p>• Requer Node.js instalado para coletores <code>.js</code>; usa NSSM (baixado automaticamente) e, sem internet, cria uma Tarefa Agendada no boot como SYSTEM</p>
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap gap-3">
                  <AgentDownloadButton agent="windows" label="Baixar Agente Windows (.zip)" options={bundleOptions} />
                  <AgentDownloadButton agent="vmware" label="Baixar Agente VMware (.zip)" options={bundleOptions} />
                  <AgentDownloadButton agent="ilo" label="Baixar Agente HP iLO4 (.zip)" options={bundleOptions} />
                  <AgentDownloadButton agent="idrac" label="Baixar Agente Dell iDRAC9 (.zip)" options={bundleOptions} />
                  <AgentDownloadButton agent="proxmox" label="Baixar Agente Proxmox (.zip)" options={bundleOptions} />
                  <Button asChild>
                    <a href="/instalar-agente-servico.ps1" download>
                      <Download className="w-4 h-4 mr-1" /> Somente o Instalador (.ps1)
                    </a>
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Cada .zip contém o coletor, o instalador de serviço, o atalho <code>instalar.cmd</code> já
                  preenchido com URL e chave, e um LEIA-ME com os comandos.
                </p>



              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </AdminLayout>
  );
};

export default ServerMonitor;
