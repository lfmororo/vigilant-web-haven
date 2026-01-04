import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Shield, LogOut, Camera, MapPin, Loader2, Video, Copy, ExternalLink } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import VideoPlayer from "@/components/VideoPlayer";
interface CameraData {
  id: string;
  name: string;
  description: string | null;
  embed_url: string | null;
  location: string | null;
  is_active: boolean;
  serial_number: string | null;
  device_username: string | null;
  device_password: string | null;
  channel: number;
}

interface StreamInfo {
  rtsp_url: string;
  rtsp_url_alt: string;
  camera_name: string;
}

const Dashboard = () => {
  const { user, signOut } = useAuth();
  const { toast } = useToast();
  const [cameras, setCameras] = useState<CameraData[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCamera, setSelectedCamera] = useState<CameraData | null>(null);
  const [streamInfo, setStreamInfo] = useState<StreamInfo | null>(null);
  const [loadingStream, setLoadingStream] = useState(false);

  useEffect(() => {
    fetchCameras();
  }, []);

  const fetchCameras = async () => {
    try {
      const { data, error } = await supabase
        .from("cameras")
        .select("*")
        .eq("is_active", true)
        .order("name");

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

  const fetchStreamInfo = async (camera: CameraData) => {
    setLoadingStream(true);
    setStreamInfo(null);
    
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      
      if (!token) {
        throw new Error("Não autenticado");
      }

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/get-camera-stream`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
          body: JSON.stringify({ camera_id: camera.id }),
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Erro ao obter stream');
      }

      const data = await response.json();
      setStreamInfo(data);
    } catch (error: any) {
      console.error('Error fetching stream:', error);
      toast({
        variant: "destructive",
        title: "Erro ao obter informações do stream",
        description: error.message,
      });
    } finally {
      setLoadingStream(false);
    }
  };

  const handleCameraSelect = (camera: CameraData) => {
    setSelectedCamera(camera);
    fetchStreamInfo(camera);
  };

  const handleCloseModal = () => {
    setSelectedCamera(null);
    setStreamInfo(null);
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({
      title: "Copiado!",
      description: "URL copiada para a área de transferência",
    });
  };

  const handleSignOut = async () => {
    await signOut();
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card/50 backdrop-blur-xl sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <Shield className="w-6 h-6 text-primary" />
            </div>
            <div>
              <h1 className="font-display font-bold text-lg">SecureTech</h1>
              <p className="text-xs text-muted-foreground">Área do Cliente</p>
            </div>
          </div>
          <Button variant="ghost" onClick={handleSignOut}>
            <LogOut className="w-4 h-4 mr-2" />
            Sair
          </Button>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8">
        <div className="mb-8">
          <h2 className="text-2xl font-display font-bold mb-2">Suas Câmeras</h2>
          <p className="text-muted-foreground">
            Visualize suas câmeras de segurança em tempo real
          </p>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : cameras.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-12">
              <Camera className="w-12 h-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium mb-2">Nenhuma câmera atribuída</h3>
              <p className="text-muted-foreground text-center max-w-md">
                Entre em contato com o administrador para ter acesso às suas câmeras.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {cameras.map((camera) => (
              <Card
                key={camera.id}
                className="cursor-pointer hover:border-primary/50 transition-colors group"
                onClick={() => handleCameraSelect(camera)}
              >
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div className="p-2 rounded-lg bg-primary/10 group-hover:bg-primary/20 transition-colors">
                      <Video className="w-5 h-5 text-primary" />
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs px-2 py-1 rounded-full bg-muted text-muted-foreground">
                        CH {camera.channel}
                      </span>
                      <span className="text-xs px-2 py-1 rounded-full bg-green-500/20 text-green-400">
                        Online
                      </span>
                    </div>
                  </div>
                  <CardTitle className="text-lg mt-3">{camera.name}</CardTitle>
                  {camera.description && (
                    <CardDescription>{camera.description}</CardDescription>
                  )}
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {camera.serial_number && (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Camera className="w-4 h-4" />
                        <span className="font-mono text-xs">{camera.serial_number}</span>
                      </div>
                    )}
                    {camera.location && (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <MapPin className="w-4 h-4" />
                        {camera.location}
                      </div>
                    )}
                  </div>
                  <div className="mt-4 aspect-video bg-muted rounded-lg flex items-center justify-center">
                    <p className="text-sm text-muted-foreground">
                      Clique para visualizar
                    </p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </main>

      {/* Camera Viewer Modal */}
      <Dialog open={!!selectedCamera} onOpenChange={handleCloseModal}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Video className="w-5 h-5 text-primary" />
              {selectedCamera?.name}
            </DialogTitle>
          </DialogHeader>
          {selectedCamera && (
            <>
              <div className="aspect-video bg-black rounded-lg overflow-hidden">
                {loadingStream ? (
                  <div className="w-full h-full flex flex-col items-center justify-center gap-3">
                    <Loader2 className="w-10 h-10 animate-spin text-primary" />
                    <p className="text-sm text-muted-foreground">Obtendo informações do stream...</p>
                  </div>
                ) : selectedCamera.embed_url ? (
                  <iframe
                    src={selectedCamera.embed_url}
                    className="w-full h-full"
                    allowFullScreen
                    allow="autoplay; encrypted-media"
                  />
                ) : (
                  <VideoPlayer
                    hlsUrl={null}
                    rtspUrl={streamInfo?.rtsp_url}
                    cameraName={selectedCamera.name}
                    serialNumber={selectedCamera.serial_number}
                    channel={selectedCamera.channel}
                    className="w-full h-full"
                  />
                )}
              </div>
              
              {/* Camera Info */}
              <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
                {selectedCamera.serial_number && (
                  <div className="flex items-center gap-2">
                    <Camera className="w-4 h-4" />
                    <span className="font-mono text-xs">{selectedCamera.serial_number}</span>
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <Video className="w-4 h-4" />
                  <span>Canal {selectedCamera.channel}</span>
                </div>
                {selectedCamera.location && (
                  <div className="flex items-center gap-2">
                    <MapPin className="w-4 h-4" />
                    {selectedCamera.location}
                  </div>
                )}
              </div>

              {/* RTSP URLs */}
              {streamInfo && (
                <div className="space-y-3 pt-2 border-t border-border">
                  <p className="text-sm text-muted-foreground">
                    Para visualizar em player externo (VLC, go2rtc):
                  </p>
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <code className="flex-1 text-xs bg-muted p-2 rounded font-mono break-all">
                        {streamInfo.rtsp_url.replace(/:[^:@]+@/, ':****@')}
                      </code>
                      <Button
                        variant="outline"
                        size="icon"
                        className="shrink-0"
                        onClick={() => copyToClipboard(streamInfo.rtsp_url)}
                      >
                        <Copy className="w-4 h-4" />
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      URL alternativa:
                    </p>
                    <div className="flex items-center gap-2">
                      <code className="flex-1 text-xs bg-muted p-2 rounded font-mono break-all">
                        {streamInfo.rtsp_url_alt.replace(/:[^:@]+@/, ':****@')}
                      </code>
                      <Button
                        variant="outline"
                        size="icon"
                        className="shrink-0"
                        onClick={() => copyToClipboard(streamInfo.rtsp_url_alt)}
                      >
                        <Copy className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Dashboard;
