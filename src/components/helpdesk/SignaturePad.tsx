import { useRef, useEffect, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Eraser, Check } from "lucide-react";

interface SignaturePadProps {
  value?: string | null;
  onChange?: (dataUrl: string | null) => void;
  label?: string;
  disabled?: boolean;
}

const SignaturePad = ({ value, onChange, label = "Assinatura", disabled = false }: SignaturePadProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasDrawn, setHasDrawn] = useState(false);
  const [showPad, setShowPad] = useState(false);

  const getCanvas = () => canvasRef.current;
  const getCtx = () => getCanvas()?.getContext("2d");

  const initCanvas = useCallback(() => {
    const canvas = getCanvas();
    const ctx = getCtx();
    if (!canvas || !ctx) return;
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.lineWidth = 2;
    ctx.strokeStyle = "hsl(var(--foreground))";
  }, []);

  useEffect(() => {
    if (showPad) {
      setTimeout(initCanvas, 50);
    }
  }, [showPad, initCanvas]);

  const getPos = (e: React.TouchEvent | React.MouseEvent) => {
    const canvas = getCanvas();
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    if ("touches" in e) {
      const touch = e.touches[0];
      return { x: touch.clientX - rect.left, y: touch.clientY - rect.top };
    }
    return { x: (e as React.MouseEvent).clientX - rect.left, y: (e as React.MouseEvent).clientY - rect.top };
  };

  const startDraw = (e: React.TouchEvent | React.MouseEvent) => {
    if (disabled) return;
    e.preventDefault();
    const ctx = getCtx();
    if (!ctx) return;
    const { x, y } = getPos(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
    setIsDrawing(true);
  };

  const draw = (e: React.TouchEvent | React.MouseEvent) => {
    if (!isDrawing || disabled) return;
    e.preventDefault();
    const ctx = getCtx();
    if (!ctx) return;
    const { x, y } = getPos(e);
    ctx.lineTo(x, y);
    ctx.stroke();
    setHasDrawn(true);
  };

  const endDraw = () => setIsDrawing(false);

  const clearPad = () => {
    const canvas = getCanvas();
    const ctx = getCtx();
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasDrawn(false);
    onChange?.(null);
  };

  const confirmSignature = () => {
    const canvas = getCanvas();
    if (!canvas) return;
    const dataUrl = canvas.toDataURL("image/png");
    onChange?.(dataUrl);
    setShowPad(false);
  };

  if (value && !showPad) {
    return (
      <div className="space-y-2">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        <div className="border rounded-md p-2 bg-muted/30">
          <img src={value} alt={label} className="max-h-20 mx-auto" />
        </div>
        {!disabled && (
          <Button variant="outline" size="sm" className="w-full text-xs" onClick={() => { setShowPad(true); setHasDrawn(false); }}>
            Refazer Assinatura
          </Button>
        )}
      </div>
    );
  }

  if (!showPad) {
    return (
      <div className="space-y-2">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        {!disabled ? (
          <Button variant="outline" size="sm" className="w-full text-xs" onClick={() => setShowPad(true)}>
            Assinar
          </Button>
        ) : (
          <p className="text-xs text-muted-foreground italic">Sem assinatura</p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <div className="border rounded-md overflow-hidden bg-background touch-none">
        <canvas
          ref={canvasRef}
          className="w-full h-32 cursor-crosshair"
          onMouseDown={startDraw}
          onMouseMove={draw}
          onMouseUp={endDraw}
          onMouseLeave={endDraw}
          onTouchStart={startDraw}
          onTouchMove={draw}
          onTouchEnd={endDraw}
        />
      </div>
      <div className="flex gap-2">
        <Button variant="outline" size="sm" className="flex-1 text-xs" onClick={clearPad}>
          <Eraser className="w-3 h-3 mr-1" /> Limpar
        </Button>
        <Button size="sm" className="flex-1 text-xs" onClick={confirmSignature} disabled={!hasDrawn}>
          <Check className="w-3 h-3 mr-1" /> Confirmar
        </Button>
      </div>
    </div>
  );
};

export default SignaturePad;
