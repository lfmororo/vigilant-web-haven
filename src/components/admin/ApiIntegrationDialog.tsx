import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { Key, Copy, Loader2, Plus, Ban, Check } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface ApiKey {
  id: string;
  api_key: string;
  description: string;
  is_active: boolean;
  last_used_at: string | null;
  created_at: string;
  client_id: string;
}

interface ApiIntegrationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clientId?: string;
  clientName?: string;
}

const ApiIntegrationDialog = ({ open, onOpenChange, clientId, clientName }: ApiIntegrationDialogProps) => {
  const { toast } = useToast();
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newDescription, setNewDescription] = useState("");
  const [newlyCreatedKey, setNewlyCreatedKey] = useState<string | null>(null);
  const [clients, setClients] = useState<{ id: string; full_name: string }[]>([]);
  const [selectedClientId, setSelectedClientId] = useState(clientId || "");

  const functionsUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`;

  useEffect(() => {
    if (open) {
      fetchApiKeys();
      if (!clientId) fetchClients();
      setNewlyCreatedKey(null);
    }
  }, [open, clientId]);

  const fetchClients = async () => {
    const { data: roleData } = await supabase.from("user_roles").select("user_id").eq("role", "client" as any);
    if (roleData && roleData.length > 0) {
      const ids = roleData.map((r) => r.user_id);
      const { data } = await supabase.from("profiles").select("id, full_name").in("id", ids);
      setClients(data || []);
    }
  };

  const fetchApiKeys = async () => {
    setLoading(true);
    try {
      let query = supabase.from("inventory_api_keys").select("*").order("created_at", { ascending: false });
      if (clientId) query = query.eq("client_id", clientId);
      const { data, error } = await query;
      if (error) throw error;
      setApiKeys((data as any) || []);
    } catch (error: any) {
      toast({ variant: "destructive", title: "Erro ao carregar chaves", description: error.message });
    } finally {
      setLoading(false);
    }
  };

  const handleCreateKey = async () => {
    const targetClientId = clientId || selectedClientId;
    if (!targetClientId) {
      toast({ variant: "destructive", title: "Selecione um cliente" });
      return;
    }
    setCreating(true);
    try {
      const newKey = crypto.randomUUID();
      const { error } = await supabase.from("inventory_api_keys").insert({
        client_id: targetClientId,
        api_key: newKey,
        description: newDescription || "Script de inventário",
      } as any);
      if (error) throw error;
      setNewlyCreatedKey(newKey);
      setNewDescription("");
      toast({ title: "Chave de API criada com sucesso!" });
      fetchApiKeys();
    } catch (error: any) {
      toast({ variant: "destructive", title: "Erro ao criar chave", description: error.message });
    } finally {
      setCreating(false);
    }
  };

  const handleToggleKey = async (id: string, isActive: boolean) => {
    try {
      const { error } = await supabase
        .from("inventory_api_keys")
        .update({ is_active: !isActive } as any)
        .eq("id", id);
      if (error) throw error;
      toast({ title: isActive ? "Chave desativada" : "Chave reativada" });
      fetchApiKeys();
    } catch (error: any) {
      toast({ variant: "destructive", title: "Erro", description: error.message });
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: "Copiado!" });
  };

  const maskKey = (key: string) => `${"•".repeat(24)}${key.slice(-8)}`;

  const powershellScript = (cId: string, key: string) =>
    `$body = @{
  client_id = "${cId}"
  api_key = "${key}"
  equipment = @(@{
    name = $env:COMPUTERNAME
    serial_number = (Get-WmiObject Win32_BIOS).SerialNumber
    brand = (Get-WmiObject Win32_ComputerSystem).Manufacturer
    model = (Get-WmiObject Win32_ComputerSystem).Model
    equipment_type = "PC/Notebook"
    location = ""
    notes = "OS: $([System.Environment]::OSVersion.VersionString), RAM: $([math]::Round((Get-WmiObject Win32_ComputerSystem).TotalPhysicalMemory/1GB))GB, CPU: $((Get-WmiObject Win32_Processor).Name), IP: $((Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.InterfaceAlias -ne 'Loopback' } | Select-Object -First 1).IPAddress)"
  })
} | ConvertTo-Json -Depth 3

Invoke-RestMethod -Uri "${functionsUrl}/inventory-sync" -Method POST -Body $body -ContentType "application/json"`;

  const pythonScript = (cId: string, key: string) =>
    `import requests
import platform
import subprocess
import socket

def get_serial():
    try:
        result = subprocess.check_output("wmic bios get serialnumber", shell=True)
        return result.decode().split("\\n")[1].strip()
    except:
        return "N/A"

data = {
    "client_id": "${cId}",
    "api_key": "${key}",
    "equipment": [{
        "name": platform.node(),
        "serial_number": get_serial(),
        "brand": platform.system(),
        "model": platform.machine(),
        "equipment_type": "PC/Notebook",
        "notes": f"OS: {platform.platform()}, CPU: {platform.processor()}, IP: {socket.gethostbyname(socket.gethostname())}"
    }]
}

response = requests.post("${functionsUrl}/inventory-sync", json=data)
print(response.json())`;

  const exampleClientId = clientId || selectedClientId || "SEU_CLIENT_ID";
  const exampleKey = newlyCreatedKey || "SUA_API_KEY";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Key className="w-5 h-5" />
            Integração API - Inventário
          </DialogTitle>
          <DialogDescription>
            {clientName
              ? `Gerencie chaves de API para ${clientName}`
              : "Gerencie chaves de API para sincronização automática de inventário"}
          </DialogDescription>
        </DialogHeader>

        {/* Create new key */}
        <div className="border rounded-lg p-4 space-y-3">
          <h3 className="font-semibold text-sm">Gerar Nova Chave</h3>
          {!clientId && (
            <div className="space-y-1">
              <Label className="text-xs">Cliente</Label>
              <select
                className="w-full border rounded-md px-3 py-2 text-sm bg-background"
                value={selectedClientId}
                onChange={(e) => setSelectedClientId(e.target.value)}
              >
                <option value="">Selecionar cliente...</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>{c.full_name}</option>
                ))}
              </select>
            </div>
          )}
          <div className="flex gap-2">
            <Input
              placeholder="Descrição (ex: Script PowerShell)"
              value={newDescription}
              onChange={(e) => setNewDescription(e.target.value)}
              className="flex-1"
            />
            <Button onClick={handleCreateKey} disabled={creating} size="sm">
              {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Plus className="w-4 h-4 mr-1" />Gerar</>}
            </Button>
          </div>
        </div>

        {/* Newly created key warning */}
        {newlyCreatedKey && (
          <div className="border border-yellow-500/30 bg-yellow-500/10 rounded-lg p-4 space-y-2">
            <p className="text-sm font-semibold text-yellow-400">⚠️ Copie esta chave agora! Ela não será exibida novamente.</p>
            <div className="flex items-center gap-2">
              <code className="text-xs bg-muted p-2 rounded flex-1 break-all font-mono">{newlyCreatedKey}</code>
              <Button variant="outline" size="sm" onClick={() => copyToClipboard(newlyCreatedKey)}>
                <Copy className="w-4 h-4" />
              </Button>
            </div>
          </div>
        )}

        {/* Keys list */}
        <div className="space-y-2">
          <h3 className="font-semibold text-sm">Chaves Ativas</h3>
          {loading ? (
            <div className="flex justify-center py-4"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
          ) : apiKeys.length === 0 ? (
            <p className="text-muted-foreground text-sm text-center py-4">Nenhuma chave cadastrada</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Chave</TableHead>
                  <TableHead>Descrição</TableHead>
                  <TableHead>Último uso</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Ação</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {apiKeys.map((k) => (
                  <TableRow key={k.id}>
                    <TableCell className="font-mono text-xs">{maskKey(k.api_key)}</TableCell>
                    <TableCell className="text-sm">{k.description || "-"}</TableCell>
                    <TableCell className="text-sm">
                      {k.last_used_at ? new Date(k.last_used_at).toLocaleDateString("pt-BR") : "Nunca"}
                    </TableCell>
                    <TableCell>
                      <Badge variant={k.is_active ? "default" : "secondary"}>
                        {k.is_active ? "Ativa" : "Inativa"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleToggleKey(k.id, k.is_active)}
                      >
                        {k.is_active ? <Ban className="w-4 h-4 text-destructive" /> : <Check className="w-4 h-4 text-green-400" />}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>

        {/* Script examples */}
        <div className="space-y-2">
          <h3 className="font-semibold text-sm">Exemplos de Scripts</h3>
          <Tabs defaultValue="powershell">
            <TabsList>
              <TabsTrigger value="powershell">PowerShell</TabsTrigger>
              <TabsTrigger value="python">Python</TabsTrigger>
            </TabsList>
            <TabsContent value="powershell" className="relative">
              <Button
                variant="ghost"
                size="sm"
                className="absolute top-2 right-2 z-10"
                onClick={() => copyToClipboard(powershellScript(exampleClientId, exampleKey))}
              >
                <Copy className="w-4 h-4" />
              </Button>
              <pre className="bg-muted p-4 rounded-lg text-xs overflow-x-auto max-h-64 overflow-y-auto">
                <code>{powershellScript(exampleClientId, exampleKey)}</code>
              </pre>
            </TabsContent>
            <TabsContent value="python" className="relative">
              <Button
                variant="ghost"
                size="sm"
                className="absolute top-2 right-2 z-10"
                onClick={() => copyToClipboard(pythonScript(exampleClientId, exampleKey))}
              >
                <Copy className="w-4 h-4" />
              </Button>
              <pre className="bg-muted p-4 rounded-lg text-xs overflow-x-auto max-h-64 overflow-y-auto">
                <code>{pythonScript(exampleClientId, exampleKey)}</code>
              </pre>
            </TabsContent>
          </Tabs>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ApiIntegrationDialog;
