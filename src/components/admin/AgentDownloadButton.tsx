import { useState, type ComponentProps } from "react";
import { Download, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { downloadAgentBundle, type BundleOptions } from "@/lib/agentBundle";

export interface AgentDownloadButtonProps extends Omit<ComponentProps<typeof Button>, "onClick"> {
  /** Identificador do agente em AGENT_BUNDLES. */
  agent: string;
  /** Rótulo do botão. */
  label: string;
  /** Opções de empacotamento (URL, chave, intervalo, arquivos extras). */
  options?: BundleOptions;
}

/**
 * Botão que gera e baixa o ZIP completo do agente (coletor + instalador + LEIA-ME).
 */
export function AgentDownloadButton({
  agent,
  label,
  options,
  variant = "outline",
  disabled,
  ...props
}: AgentDownloadButtonProps) {
  const [loading, setLoading] = useState(false);

  const handleClick = async () => {
    setLoading(true);
    try {
      await downloadAgentBundle(agent, options);
      toast.success("Pacote gerado", { description: `${label} baixado em .zip` });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Falha desconhecida";
      toast.error("Erro ao gerar o pacote", { description: message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button variant={variant} onClick={handleClick} disabled={disabled || loading} {...props}>
      {loading ? (
        <Loader2 className="w-4 h-4 mr-1 animate-spin" />
      ) : (
        <Download className="w-4 h-4 mr-1" />
      )}
      {label}
    </Button>
  );
}
