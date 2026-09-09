import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Download, Copy } from "lucide-react";
import { toast } from "sonner";

const FUNCTION_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/provisioning-agent`;

const ProvisioningAgentCard = () => {
  const [key, setKey] = useState("");

  useEffect(() => {
    (supabase.from("system_settings") as any).
    select("value").eq("key", "provisioning_agent_key").maybeSingle().
    then(({ data }: { data: { value: string } | null }) => setKey(data?.value || ""));
  }, []);

  const comando = `.\\ad-provisioning-agent.ps1 -Url "${FUNCTION_URL}" -Key "${key}" -Intervalo 30`;

  const copiar = async (texto: string) => {
    await navigator.clipboard.writeText(texto);
    toast.success("Copiado.");
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Agente do servidor</CardTitle>
        <CardDescription>
          Instale no controlador de domínio. Ele executa os pedidos criados aqui.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label>Chave de acesso do agente</Label>
          <div className="flex gap-2">
            <Input value={key} readOnly type="password" />
            <Button variant="outline" onClick={() => copiar(key)}>
              <Copy className="w-4 h-4" />
            </Button>
          </div>
        </div>
        <div className="space-y-2">
          <Label>Comando de execução</Label>
          <div className="flex gap-2">
            <Input value={comando} readOnly className="font-mono text-xs" />
            <Button variant="outline" onClick={() => copiar(comando)}>
              <Copy className="w-4 h-4" />
            </Button>
          </div>
        </div>
        <Button asChild variant="outline">
          <a href="/ad-provisioning-agent.ps1" download>
            <Download className="w-4 h-4 mr-2" /> Baixar agente
          </a>
        </Button>
        <p className="text-sm text-muted-foreground">
          Requisitos: Windows Server no domínio, PowerShell com o módulo do Active Directory e
          permissão para criar usuários e pastas.
        </p>
      </CardContent>
    </Card>);

};

export default ProvisioningAgentCard;
