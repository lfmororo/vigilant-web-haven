import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { AlertTriangle, Activity } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Area, AreaChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatBps } from "./proxmoxTypes";

export interface ProxmoxTrafficChartProps {
  /** Identificador do nó — usado para guardar o limite escolhido no navegador. */
  nodeId: string;
  /** Soma das taxas atuais de download (bits por segundo). */
  totalRx: number;
  /** Soma das taxas atuais de upload (bits por segundo). */
  totalTx: number;
  /** Nome exibido nos alertas. */
  nodeName: string;
}

interface TrafficPoint {
  time: string;
  rx: number;
  tx: number;
}

const MAX_POINTS = 40;
const DEFAULT_LIMIT_MBPS = 500;

const storageKey = (nodeId: string) => `proxmox-traffic-limit:${nodeId}`;

/**
 * Gráfico de tráfego em tempo real de um nó Proxmox.
 *
 * O histórico é mantido apenas em memória: cada nova leitura recebida (via
 * Realtime ou refetch) acrescenta um ponto à série, limitada a MAX_POINTS para
 * não crescer indefinidamente enquanto a aba fica aberta.
 */
const ProxmoxTrafficChart = ({ nodeId, totalRx, totalTx, nodeName }: ProxmoxTrafficChartProps) => {
  const { toast } = useToast();
  const [history, setHistory] = useState<TrafficPoint[]>([]);
  const [limitMbps, setLimitMbps] = useState<number>(() => {
    const saved = typeof window !== "undefined" ? window.localStorage.getItem(storageKey(nodeId)) : null;
    const parsed = saved != null ? Number(saved) : NaN;
    return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_LIMIT_MBPS;
  });
  // Evita repetir o aviso a cada leitura enquanto o tráfego segue alto.
  const alertaAtivo = useRef(false);

  const limitBps = limitMbps * 1_000_000;

  useEffect(() => {
    window.localStorage.setItem(storageKey(nodeId), String(limitMbps));
  }, [nodeId, limitMbps]);

  useEffect(() => {
    const ponto: TrafficPoint = {
      time: new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
      rx: totalRx,
      tx: totalTx,
    };
    setHistory((prev) => [...prev, ponto].slice(-MAX_POINTS));
  }, [totalRx, totalTx]);

  const excedeu = totalRx > limitBps || totalTx > limitBps;

  useEffect(() => {
    if (excedeu && !alertaAtivo.current) {
      alertaAtivo.current = true;
      toast({
        title: `Tráfego alto em ${nodeName}`,
        description: `Download ${formatBps(totalRx)} · Upload ${formatBps(totalTx)} — acima do limite de ${limitMbps} Mbps.`,
        variant: "destructive",
      });
    }
    if (!excedeu) alertaAtivo.current = false;
  }, [excedeu, totalRx, totalTx, limitMbps, nodeName, toast]);

  const pico = useMemo(
    () => history.reduce((max, p) => Math.max(max, p.rx, p.tx), 0),
    [history],
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h4 className="text-sm font-medium flex items-center gap-1">
          <Activity className="w-4 h-4" /> Tráfego em tempo real
          {excedeu && (
            <Badge className="ml-2 bg-red-500/20 text-red-400 border-red-500/30 flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" /> Acima do limite
            </Badge>
          )}
        </h4>
        <div className="flex items-center gap-2">
          <Label htmlFor={`limite-${nodeId}`} className="text-xs text-muted-foreground whitespace-nowrap">
            Limite de alerta (Mbps)
          </Label>
          <Input
            id={`limite-${nodeId}`}
            type="number"
            min={1}
            className="h-8 w-24"
            value={limitMbps}
            onChange={(e) => {
              const val = Number(e.target.value);
              if (Number.isFinite(val) && val > 0) setLimitMbps(val);
            }}
          />
        </div>
      </div>

      <div className="h-56 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={history} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id={`rx-${nodeId}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.5} />
                <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
              </linearGradient>
              <linearGradient id={`tx-${nodeId}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="hsl(var(--accent-foreground))" stopOpacity={0.4} />
                <stop offset="95%" stopColor="hsl(var(--accent-foreground))" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis dataKey="time" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" minTickGap={24} />
            <YAxis
              tick={{ fontSize: 10 }}
              stroke="hsl(var(--muted-foreground))"
              width={70}
              domain={[0, Math.max(pico, limitBps) * 1.1]}
              tickFormatter={(v) => formatBps(Number(v))}
            />
            <Tooltip
              contentStyle={{
                background: "hsl(var(--popover))",
                border: "1px solid hsl(var(--border))",
                borderRadius: 8,
                color: "hsl(var(--popover-foreground))",
                fontSize: 12,
              }}
              formatter={(value: number, name: string) => [formatBps(value), name === "rx" ? "Download" : "Upload"]}
            />
            <ReferenceLine
              y={limitBps}
              stroke="hsl(var(--destructive))"
              strokeDasharray="4 4"
              label={{ value: `Limite ${limitMbps} Mbps`, position: "insideTopRight", fontSize: 10, fill: "hsl(var(--destructive))" }}
            />
            <Area type="monotone" dataKey="rx" stroke="hsl(var(--primary))" fill={`url(#rx-${nodeId})`} strokeWidth={2} isAnimationActive={false} />
            <Area type="monotone" dataKey="tx" stroke="hsl(var(--accent-foreground))" fill={`url(#tx-${nodeId})`} strokeWidth={2} isAnimationActive={false} />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {history.length < 2 && (
        <p className="text-xs text-muted-foreground">
          Aguardando novas leituras do coletor para desenhar o gráfico.
        </p>
      )}
    </div>
  );
};

export default ProxmoxTrafficChart;
