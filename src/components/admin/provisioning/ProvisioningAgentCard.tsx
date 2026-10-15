import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Copy } from "lucide-react";
import { toast } from "sonner";
import { AgentDownloadButton } from "@/components/admin/AgentDownloadButton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const FUNCTION_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/provisioning-agent`;

interface ClientOption {
  id: string;
  full_name: string;
}

const ProvisioningAgentCard = () => {
  const [key, setKey] = useState("");
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [clientId, setClientId] = useState("");

  useEffect(() => {
    Promise.all([
      (supabase.from("system_settings") as any)
        .select("value").eq("key", "provisioning_agent_key").maybeSingle(),
      supabase.from("clients").select("id, full_name").order("full_name"),
    ]).then(([settingResult, clientsResult]) => {
      setKey(settingResult.data?.value || "");
      if (clientsResult.error) {
        toast.error(`Erro ao carregar empresas: ${clientsResult.error.message}`);
        return;
      }
      setClients(clientsResult.data || []);
    });
  }, []);

  const selectedClient = clients.find((client) => client.id === clientId);
  const safeClientName = selectedClient?.full_name.replace(/[^a-zA-Z0-9_-]+/g, "-") || "empresa";
  const clientArgument = clientId ? `-ClientId ${clientId}` : "-ClientId UUID_DA_EMPRESA";
  const comando = `.\\ad-provisioning-agent.ps1 -Url "${FUNCTION_URL}" -Key "${key}" ${clientArgument} -Intervalo 30`;

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
          <Label>Empresa atendida por este agente</Label>
          <Select value={clientId} onValueChange={setClientId}>
            <SelectTrigger>
              <SelectValue placeholder="Selecione a empresa" />
            </SelectTrigger>
            <SelectContent>
              {clients.map((client) => (
                <SelectItem key={client.id} value={client.id}>{client.full_name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-sm text-muted-foreground">
            O pacote será exclusivo desta empresa e não buscará pedidos das demais.
          </p>
        </div>
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
        <AgentDownloadButton
          agent="provisioning"
          label="Baixar pacote configurado"
          disabled={!clientId || !key}
          options={{
            url: FUNCTION_URL,
            key,
            interval: 30,
            arguments: clientId ? `-ClientId ${clientId}` : "",
            serviceName: `MororoTech_AD_${safeClientName}`,
            zipName: `agente-ad-${safeClientName}`,
          }}
        />
        <p className="text-sm text-muted-foreground">
          Requisitos: Windows Server no domínio, PowerShell com o módulo do Active Directory e
          permissão para criar usuários e pastas.
        </p>
      </CardContent>
    </Card>);

};

export default ProvisioningAgentCard;
