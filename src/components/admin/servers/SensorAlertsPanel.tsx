import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { AlertTriangle, BellRing, CheckCircle2 } from "lucide-react";

/** Alerta individual de sensor, gravado pela função de ingestão. */
export interface SensorAlert {
  id: string;
  server_id: string;
  sensor_name: string;
  sensor_type: string | null;
  severity: "warning" | "critical";
  status: "active" | "resolved";
  reading: number | null;
  unit: string | null;
  message: string | null;
  first_detected_at: string;
  last_notified_at: string | null;
  resolved_at: string | null;
}

export interface SensorAlertsPanelProps {
  /** Mapa id -> nome do servidor, para exibir o rótulo amigável. */
  serverNames: Record<string, string>;
  className?: string;
}

const formatarData = (iso: string | null): string =>
  iso ? new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "—";

/**
 * Lista os alertas de sensores gerados pelo monitoramento. Cada linha aqui
 * corresponde a uma notificação individual enviada por WhatsApp aos admins.
 */
const SensorAlertsPanel = ({ serverNames, className }: SensorAlertsPanelProps) => {
  const { data: alerts, isLoading } = useQuery({
    queryKey: ["server-sensor-alerts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("server_sensor_alerts")
        .select("*")
        .order("status", { ascending: true })
        .order("severity", { ascending: true })
        .order("last_notified_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data || []) as unknown as SensorAlert[];
    },
    refetchInterval: 30000,
  });

  const ativos = (alerts || []).filter((a) => a.status === "active");
  const recentesResolvidos = (alerts || []).filter((a) => a.status === "resolved").slice(0, 5);

  return (
    <Card className={cn("border-border", className)}>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <BellRing className="w-4 h-4 text-primary" />
          Alertas de sensores (WhatsApp)
          {ativos.length > 0 && <Badge variant="destructive">{ativos.length} ativo(s)</Badge>}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {isLoading && <p className="text-sm text-muted-foreground">Carregando alertas…</p>}

        {!isLoading && ativos.length === 0 && (
          <p className="text-sm text-muted-foreground flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-primary" />
            Nenhum sensor em alerta no momento.
          </p>
        )}

        {ativos.map((a) => (
          <div
            key={a.id}
            className="flex flex-col gap-1 rounded-md border border-border bg-muted/30 p-3 md:flex-row md:items-center md:justify-between"
          >
            <div className="min-w-0">
              <p className="text-sm font-medium flex items-center gap-2">
                <AlertTriangle
                  className={cn("w-4 h-4", a.severity === "critical" ? "text-destructive" : "text-primary")}
                />
                <span className="truncate">{a.sensor_name}</span>
                <Badge variant={a.severity === "critical" ? "destructive" : "secondary"}>
                  {a.severity === "critical" ? "Crítico" : "Atenção"}
                </Badge>
              </p>
              <p className="text-xs text-muted-foreground truncate">
                {serverNames[a.server_id] || "Servidor"} · {a.message || "—"}
              </p>
            </div>
            <p className="text-xs text-muted-foreground whitespace-nowrap">
              Notificado: {formatarData(a.last_notified_at)}
            </p>
          </div>
        ))}

        {recentesResolvidos.length > 0 && (
          <div className="pt-2">
            <p className="text-xs font-medium text-muted-foreground mb-1">Normalizados recentemente</p>
            {recentesResolvidos.map((a) => (
              <p key={a.id} className="text-xs text-muted-foreground">
                ✅ {serverNames[a.server_id] || "Servidor"} · {a.sensor_name} — {formatarData(a.resolved_at)}
              </p>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default SensorAlertsPanel;
