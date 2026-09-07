import { useEffect, useState } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { AGENT_VERSIONS, isOutdated } from "@/lib/agentVersions";
import { cn } from "@/lib/utils";

interface AgentRow {
  agent_type: string;
  agent_key: string;
  name: string | null;
  version: string | null;
  host: string | null;
  last_seen_at: string;
}

export interface AgentVersionAlertProps {
  /** Tipos de agente exibidos nesta página. Vazio = todos. */
  types?: string[];
  className?: string;
}

/**
 * Aviso visual de agentes coletores rodando versão antiga.
 * Nada é renderizado quando todos estão atualizados.
 */
export function AgentVersionAlert({ types, className }: AgentVersionAlertProps) {
  const [outdated, setOutdated] = useState<AgentRow[]>([]);

  useEffect(() => {
    let cancelado = false;

    const carregar = async () => {
      let query = supabase
        .from("collector_agent_status")
        .select("agent_type, agent_key, name, version, host, last_seen_at");
      if (types?.length) query = query.in("agent_type", types);

      const { data, error } = await query;
      if (error || cancelado) return;

      const antigos = (data ?? []).filter((a) => {
        const esperada = AGENT_VERSIONS[a.agent_type]?.version;
        return esperada ? isOutdated(a.version, esperada) : false;
      });
      setOutdated(antigos as AgentRow[]);
    };

    carregar();
    const timer = window.setInterval(carregar, 60_000);
    return () => {
      cancelado = true;
      window.clearInterval(timer);
    };
  }, [types?.join(",")]);

  if (outdated.length === 0) return null;

  return (
    <Alert variant="destructive" className={cn("border-destructive/40", className)}>
      <AlertTriangle className="h-4 w-4" />
      <AlertTitle>
        {outdated.length === 1
          ? "1 agente coletor desatualizado"
          : `${outdated.length} agentes coletores desatualizados`}
      </AlertTitle>
      <AlertDescription>
        <ul className="mt-2 space-y-1 text-sm">
          {outdated.map((a) => {
            const spec = AGENT_VERSIONS[a.agent_type];
            return (
              <li key={`${a.agent_type}-${a.agent_key}`} className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{spec?.label ?? a.agent_type}</span>
                <span className="text-muted-foreground">{a.host || a.agent_key}</span>
                <Badge variant="outline">Instalada: {a.version || "desconhecida"}</Badge>
                <Badge>Atual: {spec?.version}</Badge>
              </li>
            );
          })}
        </ul>
        <p className="mt-3 flex items-center gap-2 text-sm">
          <RefreshCw className="h-3.5 w-3.5" />
          Baixe o pacote atualizado nesta página e reinstale o serviço na máquina.
        </p>
      </AlertDescription>
    </Alert>
  );
}
