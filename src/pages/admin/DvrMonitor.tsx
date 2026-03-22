import { useState, useEffect } from "react";
import AdminLayout from "@/components/admin/AdminLayout";
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
import { Plus, RefreshCw, Video, VideoOff, Wifi, WifiOff, Trash2, Edit, Camera, History, BookOpen, Download, Copy, Check, ChevronRight } from "lucide-react";
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
}

interface DvrCamera {
  id: string;
  dvr_id: string;
  name: string;
  channel: number;
  rtsp_url: string | null;
  status: string;
  last_checked_at: string | null;
}

interface DvrEvent {
  id: string;
  dvr_id: string;
  camera_id: string | null;
  event_type: string;
  message: string;
  recorded_at: string;
}

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
    if (status === "online") return <Badge className="bg-green-600 text-white">Online</Badge>;
    if (status === "offline") return <Badge variant="destructive">Offline</Badge>;
    return <Badge variant="secondary">Desconhecido</Badge>;
  };

  const onlineDvrs = dvrs.filter(d => d.status === "online").length;
  const offlineDvrs = dvrs.filter(d => d.status === "offline").length;
  const totalCamerasOnline = cameras.filter(c => c.status === "online").length;
  const totalCamerasOffline = cameras.filter(c => c.status === "offline").length;

  const copyToClipboard = (text: string, stepId: string) => {
    navigator.clipboard.writeText(text);
    setCopiedStep(stepId);
    setTimeout(() => setCopiedStep(null), 2000);
    toast({ title: "Copiado!" });
  };

  const collectorDownloadUrl = `/dvr-vps-collector.js`;

  const guideSteps = [
    {
      id: "requisitos",
      title: "1. Requisitos da VPS",
      content: `A VPS precisa ter instalado:\n\n• Node.js 18+ (recomendado: 20 LTS)\n• ffmpeg (para teste de stream RTSP das câmeras)\n• SIMPlay da Intelbras (para acesso remoto aos DVRs)\n• Acesso de rede aos DVRs (portas 80/554)`,
    },
    {
      id: "instalar-node",
      title: "2. Instalar Node.js e ffmpeg",
      code: `# Ubuntu/Debian\ncurl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -\nsudo apt install -y nodejs ffmpeg\n\n# Verificar instalação\nnode --version\nffmpeg -version`,
    },
    {
      id: "baixar-coletor",
      title: "3. Baixar o Coletor",
      content: "Baixe o arquivo dvr-vps-collector.js e coloque na VPS, ou copie o conteúdo abaixo:",
      code: `# Criar pasta do projeto\nmkdir -p /opt/dvr-collector && cd /opt/dvr-collector\n\n# Instalar dependências\nnpm init -y\nnpm install axios ping`,
    },
    {
      id: "configurar",
      title: "4. Configurar o Coletor",
      content: "O coletor já vem configurado para se conectar ao seu painel. Basta copiar o arquivo dvr-vps-collector.js para /opt/dvr-collector/ e iniciar.",
      code: `# Copiar o arquivo para a VPS\nscp dvr-vps-collector.js usuario@sua-vps:/opt/dvr-collector/\n\n# Testar execução\ncd /opt/dvr-collector\nnode dvr-vps-collector.js`,
    },
    {
      id: "servico",
      title: "5. Criar Serviço (systemd)",
      content: "Para manter o coletor rodando permanentemente:",
      code: `sudo tee /etc/systemd/system/dvr-collector.service << 'EOF'\n[Unit]\nDescription=DVR VPS Collector\nAfter=network.target\n\n[Service]\nType=simple\nUser=root\nWorkingDirectory=/opt/dvr-collector\nExecStart=/usr/bin/node dvr-vps-collector.js\nRestart=always\nRestartSec=10\n\n[Install]\nWantedBy=multi-user.target\nEOF\n\nsudo systemctl daemon-reload\nsudo systemctl enable dvr-collector\nsudo systemctl start dvr-collector`,
    },
    {
      id: "verificar",
      title: "6. Verificar Status",
      code: `# Ver logs em tempo real\nsudo journalctl -u dvr-collector -f\n\n# Verificar status\nsudo systemctl status dvr-collector`,
    },
    {
      id: "simplay",
      title: "7. Configurar SIMPlay (Intelbras)",
      content: `O SIMPlay deve ser instalado na VPS para permitir acesso remoto aos DVRs Intelbras.\n\n1. Baixe o SIMPlay no site da Intelbras\n2. Instale na VPS (Windows) ou use Wine (Linux)\n3. Cadastre seus DVRs no SIMPlay com o ID de série\n4. Configure o acesso P2P ou DDNS\n5. Os DVRs ficarão acessíveis pela rede da VPS\n\nCom o SIMPlay configurado, o coletor conseguirá fazer ping e testar RTSP nos DVRs.`,
    },
  ];

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Monitoramento de DVRs</h1>
            <p className="text-muted-foreground">Monitoramento via SIMPlay Intelbras</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={fetchData}>
              <RefreshCw className="w-4 h-4 mr-2" /> Atualizar
            </Button>
            <Button onClick={openNewDvr}>
              <Plus className="w-4 h-4 mr-2" /> Novo DVR
            </Button>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-6 text-center">
              <div className="text-3xl font-bold">{dvrs.length}</div>
              <p className="text-sm text-muted-foreground">Total DVRs</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6 text-center">
              <div className="text-3xl font-bold text-green-600">{onlineDvrs}</div>
              <p className="text-sm text-muted-foreground">Online</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6 text-center">
              <div className="text-3xl font-bold text-destructive">{offlineDvrs}</div>
              <p className="text-sm text-muted-foreground">Offline</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6 text-center">
              <div className="text-3xl font-bold text-blue-600">
                {dvrs.filter(d => d.status === "unknown").length}
              </div>
              <p className="text-sm text-muted-foreground">Sem dados</p>
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
                            <Wifi className="w-4 h-4 text-green-600" />
                          ) : dvr.status === "offline" ? (
                            <WifiOff className="w-4 h-4 text-destructive" />
                          ) : (
                            <Wifi className="w-4 h-4 text-muted-foreground" />
                          )}
                          <span className="font-medium text-sm">{dvr.name}</span>
                        </div>
                        {statusBadge(dvr.status)}
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">
                        {dvr.clients?.full_name || "—"} • {dvr.host}
                      </div>
                      {dvr.last_polled_at && (
                        <div className="text-xs text-muted-foreground">
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
            {selectedDvr ? (
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
                            <div key={cam.id} className="p-3 rounded-lg border flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                {cam.status === "online" ? (
                                  <Video className="w-5 h-5 text-green-600" />
                                ) : cam.status === "offline" ? (
                                  <VideoOff className="w-5 h-5 text-destructive" />
                                ) : (
                                  <Video className="w-5 h-5 text-muted-foreground" />
                                )}
                                <div>
                                  <p className="font-medium text-sm">{cam.name}</p>
                                  <p className="text-xs text-muted-foreground">Canal {cam.channel}</p>
                                  {cam.last_checked_at && (
                                    <p className="text-xs text-muted-foreground">{formatTimeAgo(cam.last_checked_at)}</p>
                                  )}
                                </div>
                              </div>
                              <div className="flex items-center gap-1">
                                {statusBadge(cam.status)}
                                <Button size="sm" variant="ghost" onClick={() => openEditCamera(cam)}>
                                  <Edit className="w-3 h-3" />
                                </Button>
                                <Button size="sm" variant="ghost" onClick={() => handleDeleteCamera(cam.id, cam.dvr_id)}>
                                  <Trash2 className="w-3 h-3 text-destructive" />
                                </Button>
                              </div>
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
                                  <Badge variant={evt.event_type.includes("online") ? "default" : "destructive"}>
                                    {evt.event_type.includes("camera") ? "Câmera" : "DVR"}
                                  </Badge>
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
      </div>
    </AdminLayout>
  );
};

export default DvrMonitor;
