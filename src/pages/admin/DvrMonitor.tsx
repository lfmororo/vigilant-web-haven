import { useState, useEffect } from "react";
import AdminLayout from "@/components/admin/AdminLayout";
import { AgentVersionAlert } from "@/components/admin/AgentVersionAlert";
import { AgentDownloadButton } from "@/components/admin/AgentDownloadButton";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "@/hooks/use-toast";
import {
  Plus, RefreshCw, Video, VideoOff, Wifi, WifiOff, Trash2, Edit,
  Camera, History, BookOpen, Download, Copy, Check, ChevronRight,
  HardDrive, Activity, AlertTriangle, Clock, CheckCircle, XCircle, Cpu
} from "lucide-react";
import { formatTimeAgo } from "@/lib/formatTimeAgo";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";

interface DvrDevice {
  id: string;
  client_id: string;
  name: string;
  host: string;
  port: number;
  username: string;
  password: string;
  is_active: boolean;
  status: string;
  last_error: string | null;
  last_polled_at: string | null;
  created_at: string;
  clients?: { full_name: string };
  disk_total_gb?: number | null;
  disk_used_gb?: number | null;
  disk_free_gb?: number | null;
  disk_usage_pct?: number | null;
  recording_status?: string | null;
  device_model?: string | null;
  firmware_version?: string | null;
  serial_number?: string | null;
  total_channels?: number | null;
  uptime_seconds?: number | null;
}

interface DvrCamera {
  id: string;
  dvr_id: string;
  name: string;
  channel: number;
  rtsp_url: string | null;
  status: string;
  last_checked_at: string | null;
  recording_status?: string | null;
  resolution?: string | null;
  codec?: string | null;
  fps?: number | null;
  motion_detect?: boolean;
  video_loss?: boolean;
  camera_type?: string | null;
}

interface DvrEvent {
  id: string;
  dvr_id: string;
  camera_id: string | null;
  event_type: string;
  message: string;
  recorded_at: string;
}

const formatUptime = (seconds: number | null | undefined) => {
  if (!seconds) return "—";
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${d}d ${h}h ${m}m`;
};

const formatGB = (val: number | null | undefined) => val != null ? `${val.toFixed(1)} GB` : "—";

const DvrMonitor = () => {
  const [dvrs, setDvrs] = useState<DvrDevice[]>([]);
  const [cameras, setCameras] = useState<DvrCamera[]>([]);
  const [events, setEvents] = useState<DvrEvent[]>([]);
  const [clients, setClients] = useState<{ id: string; full_name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDvr, setSelectedDvr] = useState<string | null>(null);
  const [showDvrDialog, setShowDvrDialog] = useState(false);
  const [showCameraDialog, setShowCameraDialog] = useState(false);
  const [editingDvr, setEditingDvr] = useState<DvrDevice | null>(null);
  const [editingCamera, setEditingCamera] = useState<DvrCamera | null>(null);
  const [showGuide, setShowGuide] = useState(false);
  const [copiedStep, setCopiedStep] = useState<string | null>(null);

  const [dvrForm, setDvrForm] = useState({
    name: "", host: "", port: 80, username: "admin", password: "", client_id: "", is_active: true,
  });
  const [cameraForm, setCameraForm] = useState({
    name: "", channel: 1, rtsp_url: "", dvr_id: "",
  });

  const fetchData = async () => {
    setLoading(true);
    const [dvrsRes, clientsRes] = await Promise.all([
      supabase.from("dvr_devices").select("*, clients(full_name)").order("name"),
      supabase.from("clients").select("id, full_name").order("full_name"),
    ]);
    setDvrs((dvrsRes.data as any[]) || []);
    setClients(clientsRes.data || []);
    setLoading(false);
  };

  const fetchCameras = async (dvrId: string) => {
    const { data } = await supabase.from("dvr_cameras").select("*").eq("dvr_id", dvrId).order("channel");
    setCameras((data as any[]) || []);
  };

  const fetchEvents = async (dvrId: string) => {
    const { data } = await supabase
      .from("dvr_events")
      .select("*")
      .eq("dvr_id", dvrId)
      .order("recorded_at", { ascending: false })
      .limit(50);
    setEvents((data as any[]) || []);
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (selectedDvr) {
      fetchCameras(selectedDvr);
      fetchEvents(selectedDvr);
    }
  }, [selectedDvr]);

  const handleSaveDvr = async () => {
    if (!dvrForm.name || !dvrForm.host || !dvrForm.client_id) {
      toast({ title: "Preencha nome, host e cliente", variant: "destructive" });
      return;
    }
    if (editingDvr) {
      const { error } = await supabase.from("dvr_devices").update(dvrForm).eq("id", editingDvr.id);
      if (error) { toast({ title: "Erro ao atualizar", description: error.message, variant: "destructive" }); return; }
      toast({ title: "DVR atualizado" });
    } else {
      const { error } = await supabase.from("dvr_devices").insert(dvrForm);
      if (error) { toast({ title: "Erro ao criar", description: error.message, variant: "destructive" }); return; }
      toast({ title: "DVR cadastrado" });
    }
    setShowDvrDialog(false);
    setEditingDvr(null);
    setDvrForm({ name: "", host: "", port: 80, username: "admin", password: "", client_id: "", is_active: true });
    fetchData();
  };

  const handleDeleteDvr = async (id: string) => {
    if (!confirm("Excluir este DVR e todas as câmeras vinculadas?")) return;
    await supabase.from("dvr_devices").delete().eq("id", id);
    if (selectedDvr === id) setSelectedDvr(null);
    fetchData();
    toast({ title: "DVR removido" });
  };

  const handleSaveCamera = async () => {
    if (!cameraForm.name || !cameraForm.dvr_id) {
      toast({ title: "Preencha o nome da câmera", variant: "destructive" });
      return;
    }
    const payload = { ...cameraForm, rtsp_url: cameraForm.rtsp_url || null };
    if (editingCamera) {
      const { error } = await supabase.from("dvr_cameras").update(payload).eq("id", editingCamera.id);
      if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
      toast({ title: "Câmera atualizada" });
    } else {
      const { error } = await supabase.from("dvr_cameras").insert(payload);
      if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
      toast({ title: "Câmera cadastrada" });
    }
    setShowCameraDialog(false);
    setEditingCamera(null);
    setCameraForm({ name: "", channel: 1, rtsp_url: "", dvr_id: cameraForm.dvr_id });
    fetchCameras(cameraForm.dvr_id);
  };

  const handleDeleteCamera = async (id: string, dvrId: string) => {
    if (!confirm("Excluir esta câmera?")) return;
    await supabase.from("dvr_cameras").delete().eq("id", id);
    fetchCameras(dvrId);
    toast({ title: "Câmera removida" });
  };

  const openEditDvr = (dvr: DvrDevice) => {
    setEditingDvr(dvr);
    setDvrForm({
      name: dvr.name, host: dvr.host, port: dvr.port, username: dvr.username,
      password: dvr.password, client_id: dvr.client_id, is_active: dvr.is_active,
    });
    setShowDvrDialog(true);
  };

  const openNewDvr = () => {
    setEditingDvr(null);
    setDvrForm({ name: "", host: "", port: 80, username: "admin", password: "", client_id: "", is_active: true });
    setShowDvrDialog(true);
  };

  const openNewCamera = (dvrId: string) => {
    setEditingCamera(null);
    setCameraForm({ name: "", channel: cameras.length + 1, rtsp_url: "", dvr_id: dvrId });
    setShowCameraDialog(true);
  };

  const openEditCamera = (cam: DvrCamera) => {
    setEditingCamera(cam);
    setCameraForm({ name: cam.name, channel: cam.channel, rtsp_url: cam.rtsp_url || "", dvr_id: cam.dvr_id });
    setShowCameraDialog(true);
  };

  const statusBadge = (status: string) => {
    if (status === "online") return <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30">Online</Badge>;
    if (status === "offline") return <Badge className="bg-red-500/20 text-red-400 border-red-500/30">Offline</Badge>;
    return <Badge variant="secondary">Desconhecido</Badge>;
  };

  const recordingBadge = (status: string | null | undefined) => {
    if (status === "recording" || status === "all_recording") return <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30">⏺ Gravando</Badge>;
    if (status === "partial_recording") return <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30">⚠ Parcial</Badge>;
    if (status === "not_recording") return <Badge className="bg-red-500/20 text-red-400 border-red-500/30">⏹ Parado</Badge>;
    return null;
  };

  const eventIcon = (type: string) => {
    if (type.includes("online")) return <CheckCircle className="w-4 h-4 text-emerald-400" />;
    if (type.includes("offline") || type === "video_loss") return <XCircle className="w-4 h-4 text-red-400" />;
    if (type === "recording_stopped") return <AlertTriangle className="w-4 h-4 text-red-400" />;
    if (type === "recording_started") return <CheckCircle className="w-4 h-4 text-emerald-400" />;
    if (type === "disk_critical") return <HardDrive className="w-4 h-4 text-red-400" />;
    return <Activity className="w-4 h-4 text-muted-foreground" />;
  };

  const onlineDvrs = dvrs.filter(d => d.status === "online").length;
  const offlineDvrs = dvrs.filter(d => d.status === "offline").length;
  const totalCamerasOnline = cameras.filter(c => c.status === "online").length;
  const totalCamerasOffline = cameras.filter(c => c.status === "offline").length;
  const notRecordingCameras = cameras.filter(c => c.recording_status === "not_recording").length;

  const selectedDvrData = dvrs.find(d => d.id === selectedDvr);

  // Alerts
  const alerts: { type: "critical" | "warning"; message: string }[] = [];
  dvrs.forEach(d => {
    if (d.status === "offline") alerts.push({ type: "critical", message: `🔴 DVR ${d.name} está offline` });
    if (d.disk_usage_pct != null && d.disk_usage_pct > 90) alerts.push({ type: "critical", message: `💾 DVR ${d.name} — Disco em ${d.disk_usage_pct.toFixed(1)}%` });
    if (d.disk_usage_pct != null && d.disk_usage_pct > 70 && d.disk_usage_pct <= 90) alerts.push({ type: "warning", message: `💾 DVR ${d.name} — Disco em ${d.disk_usage_pct.toFixed(1)}%` });
    if (d.recording_status === "not_recording") alerts.push({ type: "critical", message: `⏹ DVR ${d.name} — Nenhuma câmera gravando` });
    if (d.recording_status === "partial_recording") alerts.push({ type: "warning", message: `⚠ DVR ${d.name} — Gravação parcial` });
  });
  alerts.sort((a, b) => (a.type === "critical" ? 0 : 1) - (b.type === "critical" ? 0 : 1));

  // Last collector update
  const lastPoll = dvrs.reduce((latest: string | null, d) => {
    if (!d.last_polled_at) return latest;
    if (!latest || new Date(d.last_polled_at) > new Date(latest)) return d.last_polled_at;
    return latest;
  }, null);

  const copyToClipboard = (text: string, stepId: string) => {
    navigator.clipboard.writeText(text);
    setCopiedStep(stepId);
    setTimeout(() => setCopiedStep(null), 2000);
    toast({ title: "Copiado!" });
  };

  const guideSteps = [
    {
      id: "requisitos",
      title: "1. Requisitos da VPS",
      content: `A VPS precisa ter instalado:\n\n• Python 3.8+\n• Acesso de rede aos DVRs (portas 80/554)\n• O coletor utiliza pyintelbras para comunicação via API CGI Intelbras`,
    },
    {
      id: "instalar",
      title: "2. Instalar Python e dependências",
      code: `# Ubuntu/Debian\nsudo apt update && sudo apt install -y python3 python3-pip\n\n# Instalar bibliotecas\npip3 install pyintelbras requests ping3\n\n# Verificar\npython3 -c "from pyintelbras import IntelbrasAPI; print('OK')"`,
    },
    {
      id: "baixar-coletor",
      title: "3. Baixar o Coletor",
      content: "Baixe o arquivo dvr-collector.py e coloque na VPS:",
      code: `mkdir -p /opt/dvr-collector && cd /opt/dvr-collector\ncurl -o dvr-collector.py ${window.location.origin}/dvr-collector.py`,
    },
    {
      id: "configurar",
      title: "4. Configurar a ANON_KEY",
      content: "Edite o arquivo e configure a chave de acesso:",
      code: `# Editar o arquivo\nnano /opt/dvr-collector/dvr-collector.py\n\n# Altere a linha:\nSUPABASE_ANON_KEY = "COLE_SUA_ANON_KEY_AQUI"\n\n# Testar execução\npython3 /opt/dvr-collector/dvr-collector.py`,
    },
    {
      id: "servico",
      title: "5. Criar Serviço (systemd)",
      content: "Para manter o coletor rodando permanentemente:",
      code: `sudo tee /etc/systemd/system/dvr-collector.service << 'EOF'\n[Unit]\nDescription=DVR Intelbras Collector (PyIntelbras)\nAfter=network.target\n\n[Service]\nType=simple\nUser=root\nWorkingDirectory=/opt/dvr-collector\nExecStart=/usr/bin/python3 dvr-collector.py\nRestart=always\nRestartSec=10\n\n[Install]\nWantedBy=multi-user.target\nEOF\n\nsudo systemctl daemon-reload\nsudo systemctl enable dvr-collector\nsudo systemctl start dvr-collector`,
    },
    {
      id: "verificar",
      title: "6. Verificar Status",
      code: `# Ver logs em tempo real\nsudo journalctl -u dvr-collector -f\n\n# Verificar status\nsudo systemctl status dvr-collector`,
    },
    {
      id: "importar",
      title: "7. Importar DVRs do SIMPlay (opcional)",
      content: `Se você usa o SIMPlay da Intelbras, pode importar os DVRs automaticamente com o script simplay-importer.js.`,
      code: `cd /opt/dvr-collector\nnpm install better-sqlite3 axios\ncurl -o simplay-importer.js ${window.location.origin}/simplay-importer.js\nnode simplay-importer.js --client-id <CLIENT_ID>`,
    },
  ];

  return (
    <AdminLayout>
      <AgentVersionAlert types={{["dvr"]}} className="mb-4" />
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Monitoramento de DVRs</h1>
            <p className="text-muted-foreground">Intelbras — PyIntelbras API CGI</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setShowGuide(true)}>
              <BookOpen className="w-4 h-4 mr-2" /> Guia VPS
            </Button>
            <Button variant="outline" onClick={fetchData}>
              <RefreshCw className="w-4 h-4 mr-2" /> Atualizar
            </Button>
            <Button onClick={openNewDvr}>
              <Plus className="w-4 h-4 mr-2" /> Novo DVR
            </Button>
          </div>
        </div>

        {/* Collector Status */}
        <div className="flex items-center gap-2 bg-muted/50 rounded-lg px-3 py-2 text-sm w-fit">
          <Clock className="w-4 h-4 text-muted-foreground" />
          <span className="text-muted-foreground">Última coleta:</span>
          {lastPoll ? (
            <span className={`font-medium ${(Date.now() - new Date(lastPoll).getTime()) > 5 * 60 * 1000 ? "text-amber-400" : "text-emerald-400"}`}>
              {formatTimeAgo(lastPoll)}
            </span>
          ) : <span className="text-muted-foreground">Nunca</span>}
        </div>

        {/* Alerts */}
        {alerts.length > 0 && (
          <Card className="border-amber-500/30">
            <CardHeader className="py-3 px-4">
              <CardTitle className="text-sm flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-400" />
                Alertas ({alerts.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="max-h-40 overflow-y-auto divide-y divide-border">
                {alerts.map((alert, i) => (
                  <div key={i} className={`px-4 py-2 text-sm ${alert.type === "critical" ? "bg-red-500/5 text-red-400" : "bg-amber-500/5 text-amber-400"}`}>
                    {alert.message}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <Card>
            <CardContent className="pt-6 text-center">
              <div className="text-3xl font-bold">{dvrs.length}</div>
              <p className="text-sm text-muted-foreground">Total DVRs</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6 text-center">
              <div className="text-3xl font-bold text-emerald-400">{onlineDvrs}</div>
              <p className="text-sm text-muted-foreground">Online</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6 text-center">
              <div className="text-3xl font-bold text-red-400">{offlineDvrs}</div>
              <p className="text-sm text-muted-foreground">Offline</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6 text-center">
              <div className="text-3xl font-bold text-muted-foreground">
                {dvrs.filter(d => d.status === "unknown").length}
              </div>
              <p className="text-sm text-muted-foreground">Sem dados</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6 text-center">
              <div className="text-3xl font-bold text-amber-400">
                {dvrs.filter(d => d.recording_status === "not_recording" || d.recording_status === "partial_recording").length}
              </div>
              <p className="text-sm text-muted-foreground">Gravação c/ problema</p>
            </CardContent>
          </Card>
        </div>

        {/* DVR List */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-1">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">DVRs Cadastrados</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 max-h-[500px] overflow-y-auto">
                {loading ? (
                  <p className="text-muted-foreground text-sm">Carregando...</p>
                ) : dvrs.length === 0 ? (
                  <p className="text-muted-foreground text-sm">Nenhum DVR cadastrado.</p>
                ) : (
                  dvrs.map((dvr) => (
                    <div
                      key={dvr.id}
                      className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                        selectedDvr === dvr.id ? "border-primary bg-primary/5" : "hover:bg-muted/50"
                      }`}
                      onClick={() => setSelectedDvr(dvr.id)}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          {dvr.status === "online" ? (
                            <Wifi className="w-4 h-4 text-emerald-400" />
                          ) : dvr.status === "offline" ? (
                            <WifiOff className="w-4 h-4 text-red-400" />
                          ) : (
                            <Wifi className="w-4 h-4 text-muted-foreground" />
                          )}
                          <span className="font-medium text-sm">{dvr.name}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          {recordingBadge(dvr.recording_status)}
                          {statusBadge(dvr.status)}
                        </div>
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">
                        {dvr.clients?.full_name || "—"} • {dvr.host}
                        {dvr.device_model && ` • ${dvr.device_model}`}
                      </div>
                      {dvr.disk_usage_pct != null && (
                        <div className="mt-1.5 flex items-center gap-2">
                          <HardDrive className="w-3 h-3 text-muted-foreground" />
                          <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden flex-1">
                            <div
                              className={`h-full rounded-full ${dvr.disk_usage_pct > 90 ? "bg-red-500" : dvr.disk_usage_pct > 70 ? "bg-amber-500" : "bg-emerald-500"}`}
                              style={{ width: `${dvr.disk_usage_pct}%` }}
                            />
                          </div>
                          <span className="text-xs text-muted-foreground">{dvr.disk_usage_pct.toFixed(0)}%</span>
                        </div>
                      )}
                      {dvr.last_polled_at && (
                        <div className="text-xs text-muted-foreground mt-1">
                          Última coleta: {formatTimeAgo(dvr.last_polled_at)}
                        </div>
                      )}
                      <div className="flex gap-1 mt-2">
                        <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); openEditDvr(dvr); }}>
                          <Edit className="w-3 h-3" />
                        </Button>
                        <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); handleDeleteDvr(dvr.id); }}>
                          <Trash2 className="w-3 h-3 text-destructive" />
                        </Button>
                      </div>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </div>

          {/* Detail Panel */}
          <div className="lg:col-span-2">
            {selectedDvr && selectedDvrData ? (
              <div className="space-y-4">
                {/* DVR Detail Header */}
                <Card>
                  <CardContent className="pt-4">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      <div className="bg-muted/50 rounded-lg p-3">
                        <p className="text-xs text-muted-foreground flex items-center gap-1"><Cpu className="w-3 h-3" /> Modelo</p>
                        <p className="text-sm font-bold">{selectedDvrData.device_model || "—"}</p>
                        <p className="text-xs text-muted-foreground">{selectedDvrData.firmware_version || ""}</p>
                      </div>
                      <div className="bg-muted/50 rounded-lg p-3">
                        <p className="text-xs text-muted-foreground flex items-center gap-1"><HardDrive className="w-3 h-3" /> Disco</p>
                        <p className="text-sm font-bold">
                          {selectedDvrData.disk_total_gb != null
                            ? `${formatGB(selectedDvrData.disk_used_gb)} / ${formatGB(selectedDvrData.disk_total_gb)}`
                            : "—"}
                        </p>
                        {selectedDvrData.disk_usage_pct != null && (
                          <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden mt-1">
                            <div
                              className={`h-full rounded-full ${selectedDvrData.disk_usage_pct > 90 ? "bg-red-500" : selectedDvrData.disk_usage_pct > 70 ? "bg-amber-500" : "bg-emerald-500"}`}
                              style={{ width: `${selectedDvrData.disk_usage_pct}%` }}
                            />
                          </div>
                        )}
                      </div>
                      <div className="bg-muted/50 rounded-lg p-3">
                        <p className="text-xs text-muted-foreground flex items-center gap-1"><Activity className="w-3 h-3" /> Gravação</p>
                        <div className="mt-1">{recordingBadge(selectedDvrData.recording_status) || <span className="text-sm">—</span>}</div>
                      </div>
                      <div className="bg-muted/50 rounded-lg p-3">
                        <p className="text-xs text-muted-foreground flex items-center gap-1"><Clock className="w-3 h-3" /> Uptime</p>
                        <p className="text-sm font-bold">{formatUptime(selectedDvrData.uptime_seconds)}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Tabs defaultValue="cameras">
                  <TabsList>
                    <TabsTrigger value="cameras"><Camera className="w-4 h-4 mr-1" /> Câmeras</TabsTrigger>
                    <TabsTrigger value="events"><History className="w-4 h-4 mr-1" /> Eventos</TabsTrigger>
                  </TabsList>

                  <TabsContent value="cameras">
                    <Card>
                      <CardHeader className="flex flex-row items-center justify-between">
                        <CardTitle className="text-lg">
                          Câmeras
                          {cameras.length > 0 && (
                            <span className="ml-2 text-sm font-normal text-muted-foreground">
                              {totalCamerasOnline} online / {totalCamerasOffline} offline
                              {notRecordingCameras > 0 && ` / ${notRecordingCameras} sem gravação`}
                            </span>
                          )}
                        </CardTitle>
                        <Button size="sm" onClick={() => openNewCamera(selectedDvr)}>
                          <Plus className="w-4 h-4 mr-1" /> Câmera
                        </Button>
                      </CardHeader>
                      <CardContent>
                        {cameras.length === 0 ? (
                          <p className="text-muted-foreground text-sm">Nenhuma câmera cadastrada.</p>
                        ) : (
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            {cameras.map((cam) => (
                              <div key={cam.id} className="p-3 rounded-lg border">
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-2">
                                    {cam.status === "online" ? (
                                      <Video className="w-5 h-5 text-emerald-400" />
                                    ) : cam.status === "offline" ? (
                                      <VideoOff className="w-5 h-5 text-red-400" />
                                    ) : (
                                      <Video className="w-5 h-5 text-muted-foreground" />
                                    )}
                                    <div>
                                      <p className="font-medium text-sm">{cam.name}</p>
                                      <p className="text-xs text-muted-foreground">
                                        Canal {cam.channel}
                                        {cam.resolution && ` • ${cam.resolution}`}
                                        {cam.codec && ` • ${cam.codec}`}
                                        {cam.fps && ` • ${cam.fps}fps`}
                                      </p>
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-1">
                                    <Button size="sm" variant="ghost" onClick={() => openEditCamera(cam)}>
                                      <Edit className="w-3 h-3" />
                                    </Button>
                                    <Button size="sm" variant="ghost" onClick={() => handleDeleteCamera(cam.id, cam.dvr_id)}>
                                      <Trash2 className="w-3 h-3 text-destructive" />
                                    </Button>
                                  </div>
                                </div>
                                <div className="flex items-center gap-2 mt-2 flex-wrap">
                                  {statusBadge(cam.status)}
                                  {recordingBadge(cam.recording_status)}
                                  {cam.video_loss && <Badge className="bg-red-500/20 text-red-400 border-red-500/30">📵 Perda vídeo</Badge>}
                                  {cam.motion_detect && <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30">🔵 Movimento</Badge>}
                                </div>
                                {cam.last_checked_at && (
                                  <p className="text-xs text-muted-foreground mt-1">{formatTimeAgo(cam.last_checked_at)}</p>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  </TabsContent>

                  <TabsContent value="events">
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-lg">Histórico de Eventos</CardTitle>
                      </CardHeader>
                      <CardContent>
                        {events.length === 0 ? (
                          <p className="text-muted-foreground text-sm">Nenhum evento registrado.</p>
                        ) : (
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>Tipo</TableHead>
                                <TableHead>Mensagem</TableHead>
                                <TableHead>Data</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {events.map((evt) => (
                                <TableRow key={evt.id}>
                                  <TableCell>
                                    <div className="flex items-center gap-2">
                                      {eventIcon(evt.event_type)}
                                      <Badge variant={evt.event_type.includes("online") || evt.event_type === "recording_started" ? "default" : "destructive"}>
                                        {evt.event_type.includes("camera") ? "Câmera" :
                                         evt.event_type.includes("recording") ? "Gravação" :
                                         evt.event_type === "disk_critical" ? "Disco" :
                                         evt.event_type === "video_loss" ? "Vídeo" : "DVR"}
                                      </Badge>
                                    </div>
                                  </TableCell>
                                  <TableCell className="text-sm">{evt.message}</TableCell>
                                  <TableCell className="text-sm text-muted-foreground">
                                    {new Date(evt.recorded_at).toLocaleString("pt-BR")}
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        )}
                      </CardContent>
                    </Card>
                  </TabsContent>
                </Tabs>
              </div>
            ) : (
              <Card>
                <CardContent className="pt-12 text-center text-muted-foreground">
                  <Camera className="w-12 h-12 mx-auto mb-4 opacity-30" />
                  <p>Selecione um DVR para ver câmeras e eventos</p>
                </CardContent>
              </Card>
            )}
          </div>
        </div>

        {/* DVR Dialog */}
        <Dialog open={showDvrDialog} onOpenChange={setShowDvrDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editingDvr ? "Editar DVR" : "Novo DVR"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Nome</Label>
                <Input value={dvrForm.name} onChange={(e) => setDvrForm({ ...dvrForm, name: e.target.value })} placeholder="DVR Loja Centro" />
              </div>
              <div>
                <Label>Cliente</Label>
                <Select value={dvrForm.client_id} onValueChange={(v) => setDvrForm({ ...dvrForm, client_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Selecione o cliente" /></SelectTrigger>
                  <SelectContent>
                    {clients.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.full_name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Host / IP</Label>
                  <Input value={dvrForm.host} onChange={(e) => setDvrForm({ ...dvrForm, host: e.target.value })} placeholder="meudvr.dyndns.org" />
                </div>
                <div>
                  <Label>Porta HTTP</Label>
                  <Input type="number" value={dvrForm.port} onChange={(e) => setDvrForm({ ...dvrForm, port: Number(e.target.value) })} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Usuário</Label>
                  <Input value={dvrForm.username} onChange={(e) => setDvrForm({ ...dvrForm, username: e.target.value })} />
                </div>
                <div>
                  <Label>Senha</Label>
                  <Input type="password" value={dvrForm.password} onChange={(e) => setDvrForm({ ...dvrForm, password: e.target.value })} />
                </div>
              </div>
              <Button className="w-full" onClick={handleSaveDvr}>
                {editingDvr ? "Salvar Alterações" : "Cadastrar DVR"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Camera Dialog */}
        <Dialog open={showCameraDialog} onOpenChange={setShowCameraDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editingCamera ? "Editar Câmera" : "Nova Câmera"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Nome</Label>
                <Input value={cameraForm.name} onChange={(e) => setCameraForm({ ...cameraForm, name: e.target.value })} placeholder="Câmera 1 - Entrada" />
              </div>
              <div>
                <Label>Canal</Label>
                <Input type="number" value={cameraForm.channel} onChange={(e) => setCameraForm({ ...cameraForm, channel: Number(e.target.value) })} />
              </div>
              <div>
                <Label>URL RTSP (opcional)</Label>
                <Input value={cameraForm.rtsp_url} onChange={(e) => setCameraForm({ ...cameraForm, rtsp_url: e.target.value })} placeholder="rtsp://user:pass@host:554/cam/..." />
                <p className="text-xs text-muted-foreground mt-1">Se vazio, será gerada automaticamente a partir dos dados do DVR.</p>
              </div>
              <Button className="w-full" onClick={handleSaveCamera}>
                {editingCamera ? "Salvar Alterações" : "Cadastrar Câmera"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* VPS Guide Dialog */}
        <Dialog open={showGuide} onOpenChange={setShowGuide}>
          <DialogContent className="max-w-2xl max-h-[85vh]">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <BookOpen className="w-5 h-5" />
                Guia de Configuração — Coletor DVR (Python)
              </DialogTitle>
            </DialogHeader>
            <ScrollArea className="max-h-[65vh] pr-4">
              <div className="space-y-2">
                <div className="flex gap-2 mb-4 flex-wrap">
                  <AgentDownloadButton
                    agent="dvr"
                    label="Baixar Agente DVR (.zip)"
                    size="sm"
                    options={{
                      url: import.meta.env.VITE_SUPABASE_URL,
                      key: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
                      interval: 300,
                    }}
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      const a = document.createElement("a");
                      a.href = "/instalar-agente-servico.ps1";
                      a.download = "instalar-agente-servico.ps1";
                      a.click();
                    }}
                  >
                    <Download className="w-4 h-4 mr-1" /> Instalador de Serviço (.ps1)
                  </Button>

                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      const a = document.createElement("a");
                      a.href = "/simplay-importer.js";
                      a.download = "simplay-importer.js";
                      a.click();
                    }}
                  >
                    <Download className="w-4 h-4 mr-1" /> Baixar Importador SIMPlay
                  </Button>
                </div>

                <Accordion type="single" collapsible className="w-full">
                  {guideSteps.map((step) => (
                    <AccordionItem key={step.id} value={step.id}>
                      <AccordionTrigger className="text-sm font-medium">
                        {step.title}
                      </AccordionTrigger>
                      <AccordionContent>
                        <div className="space-y-3">
                          {step.content && (
                            <p className="text-sm text-muted-foreground whitespace-pre-line">
                              {step.content}
                            </p>
                          )}
                          {step.code && (
                            <div className="relative">
                              <pre className="bg-muted p-3 rounded-lg text-xs overflow-x-auto whitespace-pre-wrap font-mono">
                                {step.code}
                              </pre>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="absolute top-2 right-2 h-7 w-7 p-0"
                                onClick={() => copyToClipboard(step.code!, step.id)}
                              >
                                {copiedStep === step.id ? (
                                  <Check className="w-3 h-3 text-emerald-400" />
                                ) : (
                                  <Copy className="w-3 h-3" />
                                )}
                              </Button>
                            </div>
                          )}
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                  ))}
                </Accordion>

                <Card className="mt-4">
                  <CardContent className="pt-4">
                    <h4 className="font-medium text-sm mb-2">📋 O que o coletor monitora</h4>
                    <ul className="text-xs text-muted-foreground space-y-1 list-disc list-inside">
                      <li>Status online/offline (ping)</li>
                      <li>Informações do dispositivo (modelo, firmware, serial)</li>
                      <li>Saúde do disco (capacidade, uso, espaço livre)</li>
                      <li>Status de gravação de cada canal</li>
                      <li>Detalhes dos canais (resolução, codec, FPS)</li>
                      <li>Detecção de eventos (perda de vídeo, movimento)</li>
                    </ul>
                  </CardContent>
                </Card>
              </div>
            </ScrollArea>
          </DialogContent>
        </Dialog>
      </div>
    </AdminLayout>
  );
};

export default DvrMonitor;
