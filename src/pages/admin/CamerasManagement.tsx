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
import {
  Dialog,
  DialogContent,
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
import { Plus, Loader2, Eye, EyeOff, Trash2, Edit } from "lucide-react";
import { z } from "zod";

interface CameraData {
  id: string;
  name: string;
  description: string | null;
  serial_number: string | null;
  device_username: string | null;
  device_password: string | null;
  channel: number;
  embed_url: string | null;
  location: string | null;
  is_active: boolean;
  created_at: string;
}

const cameraSchema = z.object({
  name: z.string().min(2, "Nome deve ter pelo menos 2 caracteres"),
  serial_number: z.string().min(1, "Número de série é obrigatório"),
  device_username: z.string().min(1, "Usuário é obrigatório"),
  device_password: z.string().min(1, "Senha é obrigatória"),
  channel: z.number().min(1, "Canal deve ser no mínimo 1").max(64, "Canal deve ser no máximo 64"),
  description: z.string().optional(),
  location: z.string().optional(),
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
    device_username: "",
    device_password: "",
    channel: 1,
    location: "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

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
      device_username: "",
      device_password: "",
      channel: 1,
      location: "",
    });
    setEditingCamera(null);
    setErrors({});
  };

  const handleOpenDialog = (camera?: CameraData) => {
    if (camera) {
      setEditingCamera(camera);
      setFormData({
        name: camera.name,
        description: camera.description || "",
        serial_number: camera.serial_number || "",
        device_username: camera.device_username || "",
        device_password: camera.device_password || "",
        channel: camera.channel || 1,
        location: camera.location || "",
      });
    } else {
      resetForm();
    }
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
            serial_number: formData.serial_number,
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
          serial_number: formData.serial_number,
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
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>
                  {editingCamera ? "Editar Câmera" : "Nova Câmera"}
                </DialogTitle>
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

                <div className="grid grid-cols-3 gap-4">
                  <div className="col-span-2 space-y-2">
                    <Label htmlFor="serial_number">Número de Série do Dispositivo</Label>
                    <Input
                      id="serial_number"
                      value={formData.serial_number}
                      onChange={(e) =>
                        setFormData({ ...formData, serial_number: e.target.value })
                      }
                      placeholder="Ex: ABC123456789"
                      className={errors.serial_number ? "border-destructive" : ""}
                    />
                    {errors.serial_number && (
                      <p className="text-sm text-destructive">{errors.serial_number}</p>
                    )}
                  </div>
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
                      className={errors.channel ? "border-destructive" : ""}
                    />
                    {errors.channel && (
                      <p className="text-sm text-destructive">{errors.channel}</p>
                    )}
                  </div>
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
                    <TableHead>Serial</TableHead>
                    <TableHead>Localização</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {cameras.map((camera) => (
                    <TableRow key={camera.id}>
                      <TableCell className="font-medium">{camera.name}</TableCell>
                      <TableCell className="font-mono text-xs">{camera.serial_number || "-"}</TableCell>
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
