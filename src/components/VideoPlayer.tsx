import { useRef, useEffect, useState } from "react";
import Hls from "hls.js";
import { Video, Loader2, AlertCircle, Play, Volume2, VolumeX, Maximize } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface VideoPlayerProps {
  hlsUrl?: string | null;
  rtspUrl?: string | null;
  cameraName: string;
  serialNumber?: string | null;
  channel: number;
  className?: string;
}

const VideoPlayer = ({ 
  hlsUrl, 
  rtspUrl, 
  cameraName, 
  serialNumber, 
  channel,
  className 
}: VideoPlayerProps) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const [status, setStatus] = useState<'loading' | 'playing' | 'error' | 'no-stream'>('loading');
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [isMuted, setIsMuted] = useState(true);
  const [showControls, setShowControls] = useState(false);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    // If we have an HLS URL, try to play it
    if (hlsUrl) {
      if (Hls.isSupported()) {
        const hls = new Hls({
          enableWorker: true,
          lowLatencyMode: true,
          backBufferLength: 90,
        });
        
        hlsRef.current = hls;
        hls.loadSource(hlsUrl);
        hls.attachMedia(video);
        
        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          video.play()
            .then(() => setStatus('playing'))
            .catch((err) => {
              console.error('Autoplay failed:', err);
              setStatus('playing'); // Still show video, user can click to play
            });
        });
        
        hls.on(Hls.Events.ERROR, (event, data) => {
          console.error('HLS error:', data);
          if (data.fatal) {
            switch (data.type) {
              case Hls.ErrorTypes.NETWORK_ERROR:
                setErrorMessage("Erro de rede. Tentando reconectar...");
                hls.startLoad();
                break;
              case Hls.ErrorTypes.MEDIA_ERROR:
                setErrorMessage("Erro de mídia. Tentando recuperar...");
                hls.recoverMediaError();
                break;
              default:
                setErrorMessage("Não foi possível carregar o stream");
                setStatus('error');
                hls.destroy();
                break;
            }
          }
        });
      } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
        // Native HLS support (Safari)
        video.src = hlsUrl;
        video.addEventListener('loadedmetadata', () => {
          video.play()
            .then(() => setStatus('playing'))
            .catch(() => setStatus('playing'));
        });
      } else {
        setErrorMessage("Seu navegador não suporta HLS");
        setStatus('error');
      }
    } else {
      setStatus('no-stream');
    }

    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, [hlsUrl]);

  const handlePlay = () => {
    videoRef.current?.play();
  };

  const toggleMute = () => {
    if (videoRef.current) {
      videoRef.current.muted = !videoRef.current.muted;
      setIsMuted(!isMuted);
    }
  };

  const toggleFullscreen = () => {
    if (containerRef.current) {
      if (document.fullscreenElement) {
        document.exitFullscreen();
      } else {
        containerRef.current.requestFullscreen();
      }
    }
  };

  const copyRtspUrl = () => {
    if (rtspUrl) {
      navigator.clipboard.writeText(rtspUrl);
    }
  };

  if (status === 'no-stream') {
    return (
      <div className={cn("w-full h-full flex flex-col items-center justify-center gap-4 p-6 bg-muted/50 rounded-lg", className)}>
        <Video className="w-16 h-16 text-muted-foreground/50" />
        <div className="text-center space-y-2">
          <p className="text-muted-foreground font-medium">Stream não disponível</p>
          <p className="text-xs text-muted-foreground/70">
            Dispositivo: {serialNumber || "N/A"} | Canal: {channel}
          </p>
          {rtspUrl && (
            <div className="mt-4 space-y-2">
              <p className="text-xs text-muted-foreground">
                Use um player externo (VLC) para acessar:
              </p>
              <code className="block text-xs bg-background/50 p-2 rounded border border-border break-all">
                {rtspUrl.replace(/:[^:@]+@/, ':****@')}
              </code>
              <Button variant="outline" size="sm" onClick={copyRtspUrl}>
                Copiar URL RTSP
              </Button>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div 
      ref={containerRef}
      className={cn("relative w-full h-full bg-black rounded-lg overflow-hidden group", className)}
      onMouseEnter={() => setShowControls(true)}
      onMouseLeave={() => setShowControls(false)}
    >
      <video
        ref={videoRef}
        className="w-full h-full object-contain"
        muted={isMuted}
        playsInline
        autoPlay
      />

      {/* Loading Overlay */}
      {status === 'loading' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80">
          <Loader2 className="w-10 h-10 animate-spin text-primary mb-3" />
          <p className="text-sm text-muted-foreground">Conectando ao stream...</p>
        </div>
      )}

      {/* Error Overlay */}
      {status === 'error' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 p-4">
          <AlertCircle className="w-10 h-10 text-destructive mb-3" />
          <p className="text-sm text-muted-foreground text-center">{errorMessage}</p>
          {rtspUrl && (
            <div className="mt-4 text-center">
              <p className="text-xs text-muted-foreground mb-2">
                Use um player externo:
              </p>
              <code className="block text-xs bg-muted/20 p-2 rounded break-all max-w-xs">
                {rtspUrl.replace(/:[^:@]+@/, ':****@')}
              </code>
            </div>
          )}
        </div>
      )}

      {/* Video Controls */}
      <div className={cn(
        "absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/80 to-transparent transition-opacity duration-300",
        showControls || status !== 'playing' ? "opacity-100" : "opacity-0"
      )}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-sm text-white font-medium truncate max-w-[200px]">
              {cameraName}
            </span>
            <span className="text-xs text-white/70 px-2 py-0.5 bg-white/10 rounded">
              CH {channel}
            </span>
            {status === 'playing' && (
              <span className="flex items-center gap-1 text-xs text-green-400">
                <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
                LIVE
              </span>
            )}
          </div>
          <div className="flex items-center gap-1">
            {status === 'playing' && (
              <>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-white hover:bg-white/20"
                  onClick={toggleMute}
                >
                  {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-white hover:bg-white/20"
                  onClick={toggleFullscreen}
                >
                  <Maximize className="w-4 h-4" />
                </Button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Play Button Overlay (if paused) */}
      {status === 'playing' && videoRef.current?.paused && (
        <button
          className="absolute inset-0 flex items-center justify-center bg-black/40 hover:bg-black/50 transition-colors"
          onClick={handlePlay}
        >
          <div className="p-4 rounded-full bg-white/20 backdrop-blur-sm">
            <Play className="w-8 h-8 text-white" fill="white" />
          </div>
        </button>
      )}
    </div>
  );
};

export default VideoPlayer;
