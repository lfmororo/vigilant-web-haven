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
  const [selectedKeyForScript, setSelectedKeyForScript] = useState<string>("");

  const functionsUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`;

  useEffect(() => {
    if (open) {
      fetchApiKeys();
      if (!clientId) fetchClients();
      setNewlyCreatedKey(null);
    }
  }, [open, clientId]);

  const fetchClients = async () => {
    const { data } = await supabase.from("clients").select("id, full_name").order("full_name");
    setClients(data || []);
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
    `# ------------------------------
# Inventário -> POST JSON (compatível - HttpClient fallback para WebRequest)
# Compatível com PowerShell 5.1+ e 7+
# ------------------------------

# Força TLS 1.2 (necessário no PowerShell 5.1)
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

# Config
$ClientId = "${cId}"
$BodyApiKey = "${key}"
$HeaderApiKey = "${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}"
$Endpoint = "${functionsUrl}/inventory-sync"
$TimeoutSeconds = 30
$MaxRetries = 3

# Tenta carregar System.Net.Http
$useHttpClient = $true
try {
    Add-Type -AssemblyName "System.Net.Http" -ErrorAction Stop
    if (-not ([type]::GetType("System.Net.Http.HttpClientHandler", $false, $false))) {
        $useHttpClient = $false
    }
} catch {
    $useHttpClient = $false
}

# IPv4 não-loopback
function Get-PrimaryIPv4 {
    try {
        $ips = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction Stop |
               Where-Object { $_.InterfaceAlias -ne 'Loopback' -and $_.IPAddress -notlike '169.254.*' } |
               Sort-Object -Property PrefixLength -Descending
        if ($ips -and $ips.Count -gt 0) { return $ips[0].IPAddress }
    } catch {
        try {
            $adapters = Get-CimInstance -ClassName Win32_NetworkAdapterConfiguration -Filter "IPEnabled = True"
            foreach ($a in $adapters) {
                if ($a.IPAddress) {
                    foreach ($ip in $a.IPAddress) {
                        if ($ip -match '^\\d{1,3}(\\.\\d{1,3}){3}$' -and -not ($ip -like '169.254.*') -and $ip -ne '127.0.0.1') {
                            return $ip
                        }
                    }
                }
            }
        } catch { return $null }
    }
    return $null
}

# Coleta de hardware (Get-CimInstance)
try { $cpu = (Get-CimInstance -ClassName Win32_Processor | Select-Object -First 1 -ExpandProperty Name) -as [string] } catch { $cpu = $null }
try { $ramBytes = (Get-CimInstance -ClassName Win32_ComputerSystem).TotalPhysicalMemory; $ramGB = if ($ramBytes) { [math]::Round($ramBytes / 1GB, 1) } else { $null } } catch { $ramGB = $null }

try {
    $disk = Get-CimInstance -ClassName Win32_LogicalDisk -Filter "DeviceID='C:'"
    if ($disk) {
        $diskTotalGB = [math]::Round($disk.Size / 1GB, 1)
        $diskFreeGB  = [math]::Round($disk.FreeSpace / 1GB, 1)
        $diskUsedGB  = [math]::Round(($disk.Size - $disk.FreeSpace) / 1GB, 1)
    } else { $diskTotalGB = $diskFreeGB = $diskUsedGB = $null }
} catch { $diskTotalGB = $diskFreeGB = $diskUsedGB = $null }

$computerName = $env:COMPUTERNAME
try { $serial = (Get-CimInstance -ClassName Win32_BIOS).SerialNumber } catch { $serial = $null }
try { $manufacturer = (Get-CimInstance -ClassName Win32_ComputerSystem).Manufacturer } catch { $manufacturer = $null }
try { $model = (Get-CimInstance -ClassName Win32_ComputerSystem).Model } catch { $model = $null }
$osInfo = try { (Get-CimInstance -ClassName Win32_OperatingSystem | Select-Object -First 1).Caption } catch { $null }
$osVersion = [System.Environment]::OSVersion.VersionString
$ip = Get-PrimaryIPv4
if (-not $ip) { $ip = "" }
$hardwareUpdatedAt = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")

# Detecta o usuário logado interativamente (funciona mesmo quando executado como SYSTEM/Agendador)
$loggedInUser = "$env:USERDOMAIN\\$env:USERNAME"
try {
    $explorerProc = Get-CimInstance -ClassName Win32_Process -Filter "Name='explorer.exe'" -ErrorAction Stop | Select-Object -First 1
    if ($explorerProc) {
        $owner = Invoke-CimMethod -InputObject $explorerProc -MethodName GetOwner -ErrorAction Stop
        if ($owner -and $owner.User) {
            $loggedInUser = "$($owner.Domain)\\$($owner.User)"
        }
    }
} catch { }

$equipment = [PSCustomObject]@{
    name = $computerName
    serial_number = $serial
    brand = $manufacturer
    model = $model
    equipment_type = "PC/Notebook"
    location = ""
    cpu = $cpu
    ram_total_gb = $ramGB
    disk_total_gb = $diskTotalGB
    disk_used_gb = $diskUsedGB
    disk_free_gb = $diskFreeGB
    hardware_updated_at = $hardwareUpdatedAt
    logged_in_user = $loggedInUser
    notes = "OS: $osInfo ($osVersion); IP: $ip"
}

$bodyObject = [PSCustomObject]@{
    client_id = $ClientId
    api_key   = $BodyApiKey
    equipment = @($equipment)
}

$bodyJson = $bodyObject | ConvertTo-Json -Depth 6

$headers = @{
    "apikey" = $HeaderApiKey
    "Content-Type" = "application/json"
}

# Envio via HttpClient
function Send-Json-WithHttpClient {
    param([string]$Uri, [string]$Json, [hashtable]$Hdrs, [int]$TimeoutSec = 30)
    $handler = New-Object System.Net.Http.HttpClientHandler
    $handler.UseProxy = $true
    $client = [System.Net.Http.HttpClient]::new($handler)
    $client.Timeout = [System.TimeSpan]::FromSeconds($TimeoutSec)
    try {
        foreach ($k in $Hdrs.Keys) {
            if ($client.DefaultRequestHeaders.Contains($k)) { $client.DefaultRequestHeaders.Remove($k) }
            $client.DefaultRequestHeaders.Add($k, [string]$Hdrs[$k])
        }
        $content = New-Object System.Net.Http.StringContent($Json, [System.Text.Encoding]::UTF8, "application/json")
        $task = $client.PostAsync($Uri, $content)
        $task.Wait()
        $resp = $task.Result
        $readTask = $resp.Content.ReadAsStringAsync()
        $readTask.Wait()
        return [PSCustomObject]@{ Success = $resp.IsSuccessStatusCode; StatusCode = [int]$resp.StatusCode; Body = $readTask.Result }
    } finally { $client.Dispose(); $handler.Dispose() }
}

# Fallback via WebRequest
function Send-Json-WithWebRequest {
    param([string]$Uri, [string]$Json, [hashtable]$Hdrs, [int]$TimeoutSec = 30)
    try {
        $req = [System.Net.WebRequest]::Create($Uri)
        $req.Method = "POST"
        $req.ContentType = "application/json"
        $req.Timeout = $TimeoutSec * 1000
        foreach ($k in $Hdrs.Keys) {
            if ($k -ieq "Content-Type") { continue }
            try { $req.Headers.Add($k, [string]$Hdrs[$k]) } catch { }
        }
        $bytes = [System.Text.Encoding]::UTF8.GetBytes($Json)
        $req.ContentLength = $bytes.Length
        $reqStream = $req.GetRequestStream()
        $reqStream.Write($bytes, 0, $bytes.Length)
        $reqStream.Close()
        $resp = $req.GetResponse()
        $sr = New-Object System.IO.StreamReader($resp.GetResponseStream())
        $body = $sr.ReadToEnd()
        $sr.Close(); $resp.Close()
        return [PSCustomObject]@{ Success = $true; StatusCode = 200; Body = $body }
    } catch {
        $we = $_.Exception; $body = ""; $status = 0
        if ($we -is [System.Net.WebException] -and $we.Response) {
            try { $sr = New-Object System.IO.StreamReader($we.Response.GetResponseStream()); $body = $sr.ReadToEnd(); $sr.Close(); $status = $we.Response.StatusCode } catch { }
        }
        return [PSCustomObject]@{ Success = $false; StatusCode = $status; Body = $body; ErrorMessage = $_.Exception.Message }
    }
}

if ($useHttpClient) {
    $sendFunc = { param($u,$j,$h,$t) Send-Json-WithHttpClient -Uri $u -Json $j -Hdrs $h -TimeoutSec $t }
} else {
    $sendFunc = { param($u,$j,$h,$t) Send-Json-WithWebRequest -Uri $u -Json $j -Hdrs $h -TimeoutSec $t }
}

# Envio com retry
$success = $false; $responseObj = $null
for ($attempt = 1; $attempt -le $MaxRetries; $attempt++) {
    try {
        $sendResult = & $sendFunc $Endpoint $bodyJson $headers $TimeoutSeconds
        if ($sendResult.Success) { $success = $true; $responseObj = $sendResult; break }
        else {
            Write-Warning ("Falha tentativa {0}: status {1}" -f $attempt, $sendResult.StatusCode)
            if ($attempt -lt $MaxRetries) { Start-Sleep -Seconds (2 * $attempt) }
        }
    } catch {
        Write-Warning ("Erro tentativa {0}: {1}" -f $attempt, $_.Exception.Message)
        if ($attempt -lt $MaxRetries) { Start-Sleep -Seconds (2 * $attempt) }
    }
}

if ($success) {
    Write-Output ("Enviado com sucesso (código {0}):" -f $responseObj.StatusCode)
    try { $responseObj.Body | ConvertFrom-Json } catch { Write-Output $responseObj.Body }
} else {
    $logFile = Join-Path $env:TEMP ("inventory-sync-fail-{0:yyyyMMdd-HHmmss}.json" -f (Get-Date))
    try { $bodyJson | Out-File -FilePath $logFile -Encoding UTF8; Write-Output ("Falha. Payload salvo em: {0}" -f $logFile) }
    catch { Write-Output "Falha ao enviar e salvar payload." }
    exit 1
}`;

  const pythonScript = (cId: string, key: string) =>
    `import requests, platform, subprocess, socket, psutil, os, getpass
from datetime import datetime, timezone

def get_serial():
    try:
        result = subprocess.check_output("wmic bios get serialnumber", shell=True)
        return result.decode().split("\\n")[1].strip()
    except:
        return "N/A"

disk = psutil.disk_usage("/")

data = {
    "client_id": "${cId}",
    "api_key": "${key}",
    "equipment": [{
        "name": platform.node(),
        "serial_number": get_serial(),
        "brand": platform.system(),
        "model": platform.machine(),
        "equipment_type": "PC/Notebook",
        "cpu": platform.processor(),
        "ram_total_gb": round(psutil.virtual_memory().total / (1024**3), 1),
        "disk_total_gb": round(disk.total / (1024**3), 1),
        "disk_used_gb": round(disk.used / (1024**3), 1),
        "disk_free_gb": round(disk.free / (1024**3), 1),
        "hardware_updated_at": datetime.now(timezone.utc).isoformat(),
        "logged_in_user": f"{os.environ.get('USERDOMAIN', '')}{chr(92)}{os.environ.get('USERNAME', '')}".strip(chr(92)) or __import__('getpass').getpass.__module__ and __import__('getpass').getuser(),
        "notes": f"OS: {platform.platform()}, IP: {socket.gethostbyname(socket.gethostname())}"
    }]
}

headers = {"apikey": "${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}"}
response = requests.post("${functionsUrl}/inventory-sync", json=data, headers=headers)
print(response.json())`;

  const exampleClientId = clientId || selectedClientId || "SEU_CLIENT_ID";
  const activeKeys = apiKeys.filter(k => k.is_active);
  const exampleKey = selectedKeyForScript || newlyCreatedKey || "SUA_API_KEY";

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
          {activeKeys.length > 0 && (
            <div className="space-y-1">
              <Label className="text-xs">Usar chave existente no script</Label>
              <select
                className="w-full border rounded-md px-3 py-2 text-sm bg-background"
                value={selectedKeyForScript}
                onChange={(e) => setSelectedKeyForScript(e.target.value)}
              >
                <option value="">{newlyCreatedKey ? "Usar chave recém-criada" : "Selecionar chave..."}</option>
                {activeKeys.map((k) => (
                  <option key={k.id} value={k.api_key}>
                    {k.description || "Sem descrição"} — ...{k.api_key.slice(-8)}
                  </option>
                ))}
              </select>
            </div>
          )}
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
