import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import AdminLayout from "@/components/admin/AdminLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { Plus, Loader2, Eye, EyeOff, Trash2, Edit, Wifi, WifiOff, RefreshCw } from "lucide-react";
import { z } from "zod";

interface CameraData {
  id: string;
  name: string;
  description: string | null;
  serial_number: string | null;
  device_ip: string | null;
  device_username: string | null;
  device_password: string | null;
  channel: number;
  embed_url: string | null;
  location: string | null;
  is_active: boolean;
  created_at: string;
}

type ConnectionStatus = 'idle' | 'testing' | 'success' | 'error';

interface ConnectionResult {
  status: ConnectionStatus;
  message?: string;
  deviceInfo?: any;
}

const cameraSchema = z.object({
  name: z.string().min(2, "Nome deve ter pelo menos 2 caracteres"),
  serial_number: z.string().optional(),
  device_ip: z.string().optional(),
  device_username: z.string().min(1, "Usuário é obrigatório"),
  device_password: z.string().min(1, "Senha é obrigatória"),
  channel: z.number().min(1, "Canal deve ser no mínimo 1").max(64, "Canal deve ser no máximo 64"),
  description: z.string().optional(),
  location: z.string().optional(),
}).refine(data => data.serial_number || data.device_ip, {
  message: "Informe o Número de Série ou o IP do dispositivo",
  path: ["serial_number"],
});

const CamerasManagement = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [cameras, setCameras] = useState<CameraData[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [editingCamera, setEditingCamera] = useState<CameraData | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    serial_number: "",
    device_ip: "",
    device_username: "",
    device_password: "",
    channel: 1,
    location: "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [connectionResult, setConnectionResult] = useState<ConnectionResult>({ status: 'idle' });

  useEffect(() => {
    fetchCameras();
  }, []);

  const fetchCameras = async () => {
    try {
      const { data, error } = await supabase
        .from("cameras")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;
      setCameras(data || []);
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Erro ao carregar câmeras",
        description: error.message,
      });
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setFormData({
      name: "",
      description: "",
      serial_number: "",
      device_ip: "",
      device_username: "",
      device_password: "",
      channel: 1,
      location: "",
    });
    setEditingCamera(null);
    setErrors({});
    setConnectionResult({ status: 'idle' });
  };

  const testConnection = async () => {
    if (!formData.device_ip || !formData.device_username || !formData.device_password) {
      toast({
        variant: "destructive",
        title: "Campos obrigatórios",
        description: "Preencha IP, usuário e senha para testar a conexão",
      });
      return;
    }

    setConnectionResult({ status: 'testing' });

    try {
      const { data, error } = await supabase.functions.invoke('test-camera-connection', {
        body: {
          device_ip: formData.device_ip,
          device_username: formData.device_username,
          device_password: formData.device_password,
          port: 80,
        },
      });

      if (error) throw error;

      if (data.success) {
        setConnectionResult({
          status: 'success',
          message: data.message,
          deviceInfo: data.device_info,
        });
        toast({
          title: "Conexão OK",
          description: data.message,
        });
      } else {
        setConnectionResult({
          status: 'error',
          message: data.error,
        });
        toast({
          variant: "destructive",
          title: "Falha na conexão",
          description: data.error,
        });
      }
    } catch (error: any) {
      setConnectionResult({
        status: 'error',
        message: error.message || 'Erro ao testar conexão',
      });
      toast({
        variant: "destructive",
        title: "Erro",
        description: error.message,
      });
    }
  };

  const handleOpenDialog = (camera?: CameraData) => {
    if (camera) {
      setEditingCamera(camera);
      setFormData({
        name: camera.name,
        description: camera.description || "",
        serial_number: camera.serial_number || "",
        device_ip: camera.device_ip || "",
        device_username: camera.device_username || "",
        device_password: camera.device_password || "",
        channel: camera.channel || 1,
        location: camera.location || "",
      });
    } else {
      resetForm();
    }
    setConnectionResult({ status: 'idle' });
    setIsDialogOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});

    const result = cameraSchema.safeParse(formData);
    if (!result.success) {
      const fieldErrors: Record<string, string> = {};
      result.error.errors.forEach((err) => {
        fieldErrors[err.path[0] as string] = err.message;
      });
      setErrors(fieldErrors);
      return;
    }

    setIsSubmitting(true);

    try {
      if (editingCamera) {
        const { error } = await supabase
          .from("cameras")
          .update({
            name: formData.name,
            description: formData.description || null,
            serial_number: formData.serial_number || null,
            device_ip: formData.device_ip || null,
            device_username: formData.device_username,
            device_password: formData.device_password,
            channel: formData.channel,
            location: formData.location || null,
          })
          .eq("id", editingCamera.id);

        if (error) throw error;

        toast({
          title: "Câmera atualizada",
          description: `${formData.name} foi atualizada com sucesso.`,
        });
      } else {
        const { error } = await supabase.from("cameras").insert({
          name: formData.name,
          description: formData.description || null,
          serial_number: formData.serial_number || null,
          device_ip: formData.device_ip || null,
          device_username: formData.device_username,
          device_password: formData.device_password,
          channel: formData.channel,
          location: formData.location || null,
          created_by: user?.id,
        });

        if (error) throw error;

        toast({
          title: "Câmera criada",
          description: `${formData.name} foi criada com sucesso.`,
        });
      }

      resetForm();
      setIsDialogOpen(false);
      fetchCameras();
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Erro",
        description: error.message,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggleActive = async (camera: CameraData) => {
    try {
      const { error } = await supabase
        .from("cameras")
        .update({ is_active: !camera.is_active })
        .eq("id", camera.id);

      if (error) throw error;

      toast({
        title: camera.is_active ? "Câmera desativada" : "Câmera ativada",
      });

      fetchCameras();
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Erro",
        description: error.message,
      });
    }
  };

  const handleDelete = async (camera: CameraData) => {
    if (!confirm(`Deseja realmente excluir "${camera.name}"?`)) return;

    try {
      const { error } = await supabase
        .from("cameras")
        .delete()
        .eq("id", camera.id);

      if (error) throw error;

      toast({
        title: "Câmera excluída",
        description: `${camera.name} foi excluída com sucesso.`,
      });

      fetchCameras();
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Erro ao excluir",
        description: error.message,
      });
    }
  };

  return (
    <AdminLayout>
      <div className="space-y-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-display font-bold">Câmeras</h1>
            <p className="text-muted-foreground">
              Gerencie as câmeras do sistema
            </p>
          </div>
          <Dialog open={isDialogOpen} onOpenChange={(open) => {
            setIsDialogOpen(open);
            if (!open) resetForm();
          }}>
            <DialogTrigger asChild>
              <Button onClick={() => handleOpenDialog()}>
                <Plus className="w-4 h-4 mr-2" />
                Nova Câmera
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>
                  {editingCamera ? "Editar Câmera" : "Nova Câmera"}
                </DialogTitle>
                <DialogDescription>
                  Preencha os dados da câmera. Informe Serial (P2P) ou IP para conexão direta.
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Nome da Câmera</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) =>
                      setFormData({ ...formData, name: e.target.value })
                    }
                    placeholder="Ex: Entrada Principal"
                    className={errors.name ? "border-destructive" : ""}
                  />
                  {errors.name && (
                    <p className="text-sm text-destructive">{errors.name}</p>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="serial_number">Número de Série (P2P/Cloud)</Label>
                    <Input
                      id="serial_number"
                      value={formData.serial_number}
                      onChange={(e) =>
                        setFormData({ ...formData, serial_number: e.target.value })
                      }
                      placeholder="Ex: ABC123456789"
                      className={errors.serial_number ? "border-destructive" : ""}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="device_ip">IP do Dispositivo</Label>
                    <Input
                      id="device_ip"
                      value={formData.device_ip}
                      onChange={(e) =>
                        setFormData({ ...formData, device_ip: e.target.value })
                      }
                      placeholder="Ex: 192.168.1.100"
                    />
                  </div>
                </div>
                {errors.serial_number && (
                  <p className="text-sm text-destructive">{errors.serial_number}</p>
                )}

                <div className="space-y-2">
                  <Label htmlFor="channel">Canal</Label>
                  <Input
                    id="channel"
                    type="number"
                    min={1}
                    max={64}
                    value={formData.channel}
                    onChange={(e) =>
                      setFormData({ ...formData, channel: parseInt(e.target.value) || 1 })
                    }
                    className={errors.channel ? "border-destructive" : "w-24"}
                  />
                  {errors.channel && (
                    <p className="text-sm text-destructive">{errors.channel}</p>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="device_username">Usuário do Dispositivo</Label>
                    <Input
                      id="device_username"
                      value={formData.device_username}
                      onChange={(e) =>
                        setFormData({ ...formData, device_username: e.target.value })
                      }
                      placeholder="admin"
                      className={errors.device_username ? "border-destructive" : ""}
                    />
                    {errors.device_username && (
                      <p className="text-sm text-destructive">{errors.device_username}</p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="device_password">Senha do Dispositivo</Label>
                    <div className="relative">
                      <Input
                        id="device_password"
                        type={showPassword ? "text" : "password"}
                        value={formData.device_password}
                        onChange={(e) =>
                          setFormData({ ...formData, device_password: e.target.value })
                        }
                        className={`pr-10 ${errors.device_password ? "border-destructive" : ""}`}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      >
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                    {errors.device_password && (
                      <p className="text-sm text-destructive">{errors.device_password}</p>
                    )}
                  </div>
                </div>

                {/* Test Connection Section */}
                {formData.device_ip && formData.device_username && formData.device_password && (
                  <div className="space-y-2 p-4 border border-border rounded-lg bg-muted/30">
                    <div className="flex items-center justify-between">
                      <Label>Testar Conexão</Label>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={testConnection}
                        disabled={connectionResult.status === 'testing'}
                      >
                        {connectionResult.status === 'testing' ? (
                          <>
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            Testando...
                          </>
                        ) : (
                          <>
                            <RefreshCw className="w-4 h-4 mr-2" />
                            Testar Conexão
                          </>
                        )}
                      </Button>
                    </div>
                    
                    {connectionResult.status === 'success' && (
                      <div className="flex items-center gap-2 text-sm">
                        <Badge variant="outline" className="bg-green-500/10 text-green-500 border-green-500/20">
                          <Wifi className="w-3 h-3 mr-1" />
                          Conectado
                        </Badge>
                        <span className="text-muted-foreground">{connectionResult.message}</span>
                      </div>
                    )}
                    
                    {connectionResult.status === 'error' && (
                      <div className="flex items-center gap-2 text-sm">
                        <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/20">
                          <WifiOff className="w-3 h-3 mr-1" />
                          Falha
                        </Badge>
                        <span className="text-muted-foreground">{connectionResult.message}</span>
                      </div>
                    )}

                    {connectionResult.deviceInfo && (
                      <div className="text-xs text-muted-foreground mt-2 font-mono bg-background/50 p-2 rounded">
                        {connectionResult.deviceInfo.deviceType !== 'Unknown' && (
                          <div>Tipo: {connectionResult.deviceInfo.deviceType}</div>
                        )}
                        {connectionResult.deviceInfo.serialNumber !== 'Unknown' && (
                          <div>Serial: {connectionResult.deviceInfo.serialNumber}</div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                <div className="space-y-2">
                  <Label htmlFor="description">Descrição (opcional)</Label>
                  <Textarea
                    id="description"
                    value={formData.description}
                    onChange={(e) =>
                      setFormData({ ...formData, description: e.target.value })
                    }
                    placeholder="Descrição da câmera..."
                    rows={2}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="location">Localização (opcional)</Label>
                  <Input
                    id="location"
                    value={formData.location}
                    onChange={(e) =>
                      setFormData({ ...formData, location: e.target.value })
                    }
                    placeholder="Ex: Portaria, Estacionamento"
                  />
                </div>

                <Button type="submit" className="w-full" disabled={isSubmitting}>
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      {editingCamera ? "Salvando..." : "Criando..."}
                    </>
                  ) : editingCamera ? (
                    "Salvar Alterações"
                  ) : (
                    "Criar Câmera"
                  )}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Lista de Câmeras</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
              </div>
            ) : cameras.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">
                Nenhuma câmera cadastrada
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead>Serial / IP</TableHead>
                    <TableHead>Localização</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {cameras.map((camera) => (
                    <TableRow key={camera.id}>
                      <TableCell className="font-medium">{camera.name}</TableCell>
                      <TableCell className="font-mono text-xs">
                        {camera.device_ip && (
                          <div className="flex items-center gap-1">
                            <Wifi className="w-3 h-3 text-muted-foreground" />
                            {camera.device_ip}
                          </div>
                        )}
                        {camera.serial_number && (
                          <div className="text-muted-foreground">{camera.serial_number}</div>
                        )}
                        {!camera.device_ip && !camera.serial_number && "-"}
                      </TableCell>
                      <TableCell>{camera.location || "-"}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Switch
                            checked={camera.is_active}
                            onCheckedChange={() => handleToggleActive(camera)}
                          />
                          <span className={camera.is_active ? "text-green-400" : "text-muted-foreground"}>
                            {camera.is_active ? "Ativa" : "Inativa"}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleOpenDialog(camera)}
                          >
                            <Edit className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDelete(camera)}
                            className="text-destructive hover:text-destructive"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
};

export default CamerasManagement;
