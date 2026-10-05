import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import AdminLayout from "@/components/admin/AdminLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import {
  Shield,
  Plus,
  Loader2,
  Search,
  Wifi,
  WifiOff,
  AlertTriangle,
} from "lucide-react";
import { Link } from "react-router-dom";

interface FirewallWithClient {
  id: string;
  name: string;
  model: string | null;
  firmwareVersion: string | null;
  status: "online" | "offline" | "warning";
  lastSeenAt: string | null;
  createdAt: string;
  clientId: string;
  clients: { full_name: string } | null;
  latestCpu: number | null;
  latestMemory: number | null;
  alertCount: number;
  vpnOfflineCount: number;
}

interface NewFirewallForm {
  clientId: string;
  name: string;
  serialNumber: string;
  model: string;
  sophosIp: string;
}

const SophosMonitor = () => {
  const { toast } = useToast();
  const [firewalls, setFirewalls] = useState<FirewallWithClient[]>([]);
  const [clients, setClients] = useState<{ id: string; full_name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [clientFilter, setClientFilter] = useState<string>("all");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState<NewFirewallForm>({
    clientId: "",
    name: "",
    serialNumber: "",
    model: "",
    sophosIp: "",
  });

  useEffect(() => {
    fetchClients();
    fetchFirewalls();
  }, []);

  const fetchClients = async () => {
    const { data } = await supabase
      .from("clients")
      .select("id, full_name")
      .order("full_name");
    if (data) setClients(data);
  };

  const fetchFirewalls = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("sophos_firewalls")
        .select(`
          *,
          clients (full_name)
        `)
        .order("name");
      if (error) throw error;

      const fwIds = (data || []).map((f) => f.id);

      // Latest telemetry per firewall
      const { data: telemetryData } = await supabase
        .from("sophos_telemetry_logs")
        .select("firewall_id, cpu_usage, memory_usage, vpn_tunnels, created_at")
        .in("firewall_id", fwIds.length ? fwIds : ["00000000-0000-0000-0000-000000000000"])
        .order("created_at", { ascending: false });

      const latestTelemetry: Record<string, any> = {};
      (telemetryData || []).forEach((t: any) => {
        if (!latestTelemetry[t.firewall_id]) {
          latestTelemetry[t.firewall_id] = t;
        }
      });

      // Alert counts
      const { data: alertsData } = await supabase
        .from("sophos_alerts")
        .select("firewall_id")
        .eq("resolved", false)
        .in("firewall_id", fwIds.length ? fwIds : ["00000000-0000-0000-0000-000000000000"]);

      const alertCounts: Record<string, number> = {};
      const vpnOfflineCounts: Record<string, number> = {};
      (alertsData || []).forEach((a: any) => {
        alertCounts[a.firewall_id] = (alertCounts[a.firewall_id] || 0) + 1;
      });

      Object.entries(latestTelemetry).forEach(([fwId, tel: any]) => {
        const tunnels = tel.vpn_tunnels as Array<{ status: string }> | null;
        vpnOfflineCounts[fwId] = tunnels?.filter((t) => t.status === "disconnected").length || 0;
      });

      const enriched = (data || []).map((fw: any) => ({
        ...fw,
        latestCpu: latestTelemetry[fw.id]?.cpu_usage ?? null,
        latestMemory: latestTelemetry[fw.id]?.memory_usage ?? null,
        alertCount: alertCounts[fw.id] || 0,
        vpnOfflineCount: vpnOfflineCounts[fw.id] || 0,
      }));

      setFirewalls(enriched);
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Erro ao carregar firewalls",
        description: error.message,
      });
    } finally {
      setLoading(false);
    }
  };

  const handleCreateFirewall = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.clientId || !formData.name) {
      toast({ variant: "destructive", title: "Preencha os campos obrigatórios" });
      return;
    }
    setIsSubmitting(true);
    try {
      const { error } = await supabase.from("sophos_firewalls").insert({
        client_id: formData.clientId,
        name: formData.name,
        serial_number: formData.serialNumber || null,
        model: formData.model || null,
        sophos_ip: formData.sophosIp || null,
        api_token: crypto.randomUUID(),
      });
      if (error) throw error;
      toast({ title: "Firewall criado", description: `${formData.name} foi cadastrado.` });
      setFormData({ clientId: "", name: "", serialNumber: "", model: "", sophosIp: "" });
      setIsDialogOpen(false);
      fetchFirewalls();
    } catch (error: any) {
      toast({ variant: "destructive", title: "Erro ao criar firewall", description: error.message });
    } finally {
      setIsSubmitting(false);
    }
  };

  const isOnline = (fw: FirewallWithClient) => {
    if (!fw.lastSeenAt) return false;
    return new Date(fw.lastSeenAt).getTime() > Date.now() - 3 * 60 * 1000;
  };

  const offlineCount = firewalls.filter((f) => !isOnline(f)).length;
  const onlineCount = firewalls.filter((f) => isOnline(f)).length;
  const alertCountTotal = firewalls.filter((f) => f.alertCount > 0).length;
  const vpnOfflineCount = firewalls.filter((f) => f.vpnOfflineCount > 0).length;

  const filteredFirewalls = firewalls.filter((fw) => {
    const matchSearch =
      fw.name.toLowerCase().includes(search.toLowerCase()) ||
      (fw.clients?.full_name || "").toLowerCase().includes(search.toLowerCase()) ||
      (fw.model || "").toLowerCase().includes(search.toLowerCase());
    const matchStatus =
      statusFilter === "all" ||
      (statusFilter === "online" && isOnline(fw)) ||
      (statusFilter === "offline" && !isOnline(fw));
    const matchClient = clientFilter === "all" || fw.clientId === clientFilter;
    return matchSearch && matchStatus && matchClient;
  });

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-display font-bold flex items-center gap-3">
              <Shield className="w-8 h-8" />
              Firewalls Sophos
            </h1>
            <p className="text-muted-foreground">Monitoramento centralizado de firewalls</p>
          </div>
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="w-4 h-4 mr-2" />
                Novo Firewall
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Cadastrar Firewall Sophos</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleCreateFirewall} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="fw-client">Cliente *</Label>
                  <Select
                    value={formData.clientId}
                    onValueChange={(v) => setFormData({ ...formData, clientId: v })}
                  >
                    <SelectTrigger id="fw-client">
                      <SelectValue placeholder="Selecione o cliente" />
                    </SelectTrigger>
                    <SelectContent>
                      {clients.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.full_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="fw-name">Nome *</Label>
                  <Input
                    id="fw-name"
                    placeholder="Ex: Sophos XGS 2100 - Matriz"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="fw-serial">Número de Série</Label>
                    <Input
                      id="fw-serial"
                      value={formData.serialNumber}
                      onChange={(e) => setFormData({ ...formData, serialNumber: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="fw-model">Modelo</Label>
                    <Input
                      id="fw-model"
                      placeholder="Ex: XGS 2100"
                      value={formData.model}
                      onChange={(e) => setFormData({ ...formData, model: e.target.value })}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="fw-ip">IP Local do Firewall</Label>
                  <Input
                    id="fw-ip"
                    placeholder="Ex: 192.168.1.1"
                    value={formData.sophosIp}
                    onChange={(e) => setFormData({ ...formData, sophosIp: e.target.value })}
                  />
                </div>
                <Button type="submit" className="w-full" disabled={isSubmitting}>
                  {isSubmitting ? (
                    <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Criando...</>
                  ) : (
                    "Cadastrar Firewall"
                  )}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold">{firewalls.length}</div>
              <p className="text-xs text-muted-foreground">Total de Firewalls</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold text-green-600 dark:text-green-400">
                {onlineCount}
              </div>
              <p className="text-xs text-muted-foreground">Dispositivos Online</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold text-amber-600 dark:text-amber-400">
                {alertCountTotal}
              </div>
              <p className="text-xs text-muted-foreground">Firewalls com Alertas</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold text-red-600 dark:text-red-400">
                {vpnOfflineCount}
              </div>
              <p className="text-xs text-muted-foreground">Túneis VPN Offline</p>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por nome, cliente ou modelo..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos Status</SelectItem>
              <SelectItem value="online">Online</SelectItem>
              <SelectItem value="offline">Offline</SelectItem>
            </SelectContent>
          </Select>
          <Select value={clientFilter} onValueChange={setClientFilter}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Cliente" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos Clientes</SelectItem>
              {clients.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.full_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Table */}
        <Card>
          <CardContent className="p-0">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
              </div>
            ) : filteredFirewalls.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                <Shield className="w-12 h-12 mb-4 opacity-20" />
                <p>Nenhum firewall encontrado</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Firewall</TableHead>
                    <TableHead>Cliente</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>CPU / Memória</TableHead>
                    <TableHead>VPN Offline</TableHead>
                    <TableHead>Último Heartbeat</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredFirewalls.map((fw) => {
                    const online = isOnline(fw);
                    return (
                      <TableRow key={fw.id}>
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <div className="relative">
                              <Shield className="w-5 h-5 text-primary" />
                              {online && (
                                <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                              )}
                            </div>
                            <div>
                              <p className="font-medium">{fw.name}</p>
                              <p className="text-xs text-muted-foreground">{fw.model || "—"}</p>
                            </div>
                            {fw.alertCount > 0 && (
                              <Badge variant="destructive" className="text-xs">
                                <AlertTriangle className="w-3 h-3 mr-1" />
                                {fw.alertCount}
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Link
                            to={`/admin/clients?highlight=${fw.clientId}`}
                            className="text-sm text-muted-foreground hover:text-primary underline underline-offset-2"
                          >
                            {fw.clients?.full_name || "—"}
                          </Link>
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={online ? "default" : "secondary"}
                            className={online ? "bg-green-500/10 text-green-600 border-green-500/20 hover:bg-green-500/10" : ""}
                          >
                            {online ? (
                              <><Wifi className="w-3 h-3 mr-1" />Online</>
                            ) : (
                              <><WifiOff className="w-3 h-3 mr-1" />Offline</>
                            )}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="space-y-1 min-w-[120px]">
                            <div className="flex items-center gap-2 text-xs">
                              <span>CPU</span>
                              <Progress
                                value={fw.latestCpu ?? 0}
                                className="h-1.5 flex-1"
                              />
                              <span className="w-8 text-right tabular-nums">
                                {fw.latestCpu != null ? `${fw.latestCpu}%` : "—"}
                              </span>
                            </div>
                            <div className="flex items-center gap-2 text-xs">
                              <span>MEM</span>
                              <Progress
                                value={fw.latestMemory ?? 0}
                                className="h-1.5 flex-1"
                              />
                              <span className="w-8 text-right tabular-nums">
                                {fw.latestMemory != null ? `${fw.latestMemory}%` : "—"}
                              </span>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          {fw.vpnOfflineCount > 0 ? (
                            <Badge variant="destructive" className="text-xs">
                              {fw.vpnOfflineCount} offline
                            </Badge>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {fw.lastSeenAt
                            ? new Date(fw.lastSeenAt).toLocaleString("pt-BR")
                            : "Nunca"}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button variant="ghost" size="sm" asChild>
                            <Link to={`/admin/sophos/${fw.id}`}>Ver Detalhes</Link>
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
};

export default SophosMonitor;
