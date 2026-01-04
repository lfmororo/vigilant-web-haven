import { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import AdminLayout from "@/components/admin/AdminLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Loader2, Camera, MapPin } from "lucide-react";

interface CameraData {
  id: string;
  name: string;
  description: string | null;
  location: string | null;
  is_active: boolean;
}

interface UserProfile {
  id: string;
  full_name: string;
  email: string;
}

const UserCamerasManagement = () => {
  const { userId } = useParams<{ userId: string }>();
  const { user: currentUser } = useAuth();
  const { toast } = useToast();
  const [user, setUser] = useState<UserProfile | null>(null);
  const [cameras, setCameras] = useState<CameraData[]>([]);
  const [assignedCameraIds, setAssignedCameraIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (userId) {
      fetchData();
    }
  }, [userId]);

  const fetchData = async () => {
    try {
      const [userRes, camerasRes, assignmentsRes] = await Promise.all([
        supabase.from("profiles").select("*").eq("id", userId).single(),
        supabase.from("cameras").select("*").order("name"),
        supabase.from("user_cameras").select("camera_id").eq("user_id", userId),
      ]);

      if (userRes.error) throw userRes.error;
      if (camerasRes.error) throw camerasRes.error;
      if (assignmentsRes.error) throw assignmentsRes.error;

      setUser(userRes.data);
      setCameras(camerasRes.data || []);
      setAssignedCameraIds(
        new Set(assignmentsRes.data?.map((a) => a.camera_id) || [])
      );
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Erro ao carregar dados",
        description: error.message,
      });
    } finally {
      setLoading(false);
    }
  };

  const handleToggleCamera = async (cameraId: string) => {
    const isAssigned = assignedCameraIds.has(cameraId);
    setSaving(true);

    try {
      if (isAssigned) {
        const { error } = await supabase
          .from("user_cameras")
          .delete()
          .eq("user_id", userId)
          .eq("camera_id", cameraId);

        if (error) throw error;

        setAssignedCameraIds((prev) => {
          const next = new Set(prev);
          next.delete(cameraId);
          return next;
        });

        toast({
          title: "Câmera removida",
          description: "Acesso removido com sucesso.",
        });
      } else {
        const { error } = await supabase.from("user_cameras").insert({
          user_id: userId,
          camera_id: cameraId,
          assigned_by: currentUser?.id,
        });

        if (error) throw error;

        setAssignedCameraIds((prev) => new Set([...prev, cameraId]));

        toast({
          title: "Câmera atribuída",
          description: "Acesso concedido com sucesso.",
        });
      }
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Erro",
        description: error.message,
      });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </AdminLayout>
    );
  }

  if (!user) {
    return (
      <AdminLayout>
        <div className="text-center py-12">
          <p className="text-muted-foreground">Usuário não encontrado</p>
          <Button asChild className="mt-4">
            <Link to="/admin/users">Voltar</Link>
          </Button>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="space-y-8">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link to="/admin/users">
              <ArrowLeft className="w-5 h-5" />
            </Link>
          </Button>
          <div>
            <h1 className="text-3xl font-display font-bold">
              Câmeras de {user.full_name}
            </h1>
            <p className="text-muted-foreground">{user.email}</p>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Atribuir Câmeras</CardTitle>
            <CardDescription>
              Selecione as câmeras que este usuário poderá visualizar
            </CardDescription>
          </CardHeader>
          <CardContent>
            {cameras.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">
                Nenhuma câmera cadastrada no sistema
              </p>
            ) : (
              <div className="space-y-4">
                {cameras.map((camera) => {
                  const isAssigned = assignedCameraIds.has(camera.id);
                  return (
                    <div
                      key={camera.id}
                      className={`flex items-center justify-between p-4 rounded-lg border transition-colors ${
                        isAssigned
                          ? "border-primary/50 bg-primary/5"
                          : "border-border hover:border-border/80"
                      }`}
                    >
                      <div className="flex items-center gap-4">
                        <Checkbox
                          id={camera.id}
                          checked={isAssigned}
                          onCheckedChange={() => handleToggleCamera(camera.id)}
                          disabled={saving}
                        />
                        <div className="flex items-center gap-3">
                          <div
                            className={`p-2 rounded-lg ${
                              isAssigned ? "bg-primary/20" : "bg-muted"
                            }`}
                          >
                            <Camera
                              className={`w-5 h-5 ${
                                isAssigned ? "text-primary" : "text-muted-foreground"
                              }`}
                            />
                          </div>
                          <div>
                            <label
                              htmlFor={camera.id}
                              className="font-medium cursor-pointer"
                            >
                              {camera.name}
                            </label>
                            {camera.location && (
                              <div className="flex items-center gap-1 text-sm text-muted-foreground">
                                <MapPin className="w-3 h-3" />
                                {camera.location}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                      <div>
                        <span
                          className={`text-xs px-2 py-1 rounded-full ${
                            camera.is_active
                              ? "bg-green-500/20 text-green-400"
                              : "bg-muted text-muted-foreground"
                          }`}
                        >
                          {camera.is_active ? "Ativa" : "Inativa"}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <div className="text-sm text-muted-foreground">
          {assignedCameraIds.size} câmera(s) atribuída(s) a este usuário
        </div>
      </div>
    </AdminLayout>
  );
};

export default UserCamerasManagement;
