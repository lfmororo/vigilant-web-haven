<#
=== Coletor Windows Server (centralizado) — v2.0.0 ===
Roda em UMA máquina Windows e monitora TODOS os servidores cadastrados no painel
(list-windows) via CIM/WMI. Compatível com Windows PowerShell 5.1.

Uso:
  powershell -ExecutionPolicy Bypass -File windows-server-collector.ps1 -Token <MONITOR_TOKEN>
  powershell -ExecutionPolicy Bypass -File windows-server-collector.ps1 -Token <MONITOR_TOKEN> -UmaVez
  ... -Intervalo 300 -ServicosAutomaticos

Parâmetros:
  -SupabaseUrl (-Url)   Endereço do painel (padrão já preenchido)
  -SupabaseKey (-Key)   Chave pública (opcional)
  -Token                Token do agente gerado no painel (ou variável de ambiente MONITOR_TOKEN) — OBRIGATÓRIO
  -Intervalo            Segundos entre coletas (padrão 300)
  -UmaVez               Faz uma coleta e sai
  -ServicosAutomaticos  Também alerta serviços automáticos parados (exceto lista de ruído)

Requisitos: conta com permissão WMI/WinRM nos servidores remotos (WinRM 5985 ou DCOM/RPC 135).
Para rodar como serviço use instalar-agente-servico.ps1 (loop contínuo é o padrão).
#>
[CmdletBinding()]
param(
    [Alias("Url")][string]$SupabaseUrl = "https://egbusmegupjfxqswdlxq.supabase.co",
    [Alias("Key")][string]$SupabaseKey = "",
    [string]$Token = "",
    [int]$Intervalo = 300,
    [switch]$UmaVez,
    [switch]$ServicosAutomaticos
)

$ErrorActionPreference = "Continue"
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

# Versao deste coletor. Mantenha igual a src/lib/agentVersions.ts.
$AGENT_VERSION = "2.0.0"

if (-not $Token) { $Token = $env:MONITOR_TOKEN }
if (-not $Token) {
    Write-Host "ERRO: informe -Token <MONITOR_TOKEN> (ou defina a variavel de ambiente MONITOR_TOKEN)." -ForegroundColor Red
    exit 1
}
$SupabaseUrl = $SupabaseUrl.TrimEnd("/")
if ($Intervalo -lt 30) { $Intervalo = 30 }

$ScriptDir = $PSScriptRoot
if (-not $ScriptDir) { $ScriptDir = (Get-Location).Path }
$LOG_FILE = Join-Path $ScriptDir "windows-collector.log"
$STATE_FILE = Join-Path $ScriptDir "windows-collector.state.json"
$LOG_MAX_BYTES = 5MB

$SERVICES_TO_MONITOR = @(
    "MSSQLSERVER", "MSSQL`$SQLEXPRESS", "SQLSERVERAGENT", "W3SVC", "Spooler", "DNS",
    "DHCPServer", "NTDS", "Netlogon", "DFSR", "VeeamBackupSvc", "LanmanServer"
)

# Serviços automáticos que costumam ficar parados sem problema (ruído).
$SERVICE_NOISE = @(
    "gupdate", "gupdatem", "edgeupdate", "edgeupdatem", "sppsvc", "RemoteRegistry", "MapsBroker",
    "wuauserv", "BITS", "TrustedInstaller", "ShellHWDetection", "tiledatamodelsvc", "WbioSrvc",
    "CDPSvc", "OneSyncSvc", "UsoSvc", "DoSvc", "sppsvc", "stisvc", "TabletInputService", "WaaSMedicSvc",
    "clr_optimization_v4.0.30319_32", "clr_optimization_v4.0.30319_64", "MMCSS", "Dnscache",
    "IaasVmProvider", "WinDefend", "WSearch", "gpsvc", "camsvc", "AppReadiness"
)

# ------------------------------------------------------------ log com rotação
function Write-Log {
    param([string]$Message, [string]$Level = "INFO")
    $line = "[{0}] [{1}] {2}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $Level, $Message
    try {
        if ((Test-Path $LOG_FILE) -and ((Get-Item $LOG_FILE).Length -gt $LOG_MAX_BYTES)) {
            $old = "$LOG_FILE.1"
            if (Test-Path $old) { Remove-Item $old -Force -ErrorAction SilentlyContinue }
            Rename-Item -Path $LOG_FILE -NewName (Split-Path $old -Leaf) -Force -ErrorAction SilentlyContinue
        }
        Add-Content -Path $LOG_FILE -Value $line -Encoding UTF8
    } catch {}
    Write-Host $line
}

# ------------------------------------------------------------ HTTP
function Get-Headers {
    $h = @{ "x-monitor-token" = $Token }
    if ($SupabaseKey) {
        $h["apikey"] = $SupabaseKey
        $h["Authorization"] = "Bearer $SupabaseKey"
    }
    return $h
}

function Invoke-Api {
    param([string]$Function, [object]$Body)
    $json = ConvertTo-Json -InputObject $Body -Depth 8 -Compress
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($json)
    return Invoke-RestMethod -Uri "$SupabaseUrl/functions/v1/$Function" -Method POST -Body $bytes `
        -ContentType "application/json; charset=utf-8" -Headers (Get-Headers) -TimeoutSec 30
}

function Send-AgentVersion {
    try {
        Invoke-Api -Function "agent-heartbeat" -Body @{ agent_type = "windows"; version = $AGENT_VERSION; host = $env:COMPUTERNAME } | Out-Null
    } catch {
        Write-Log "Falha ao reportar a versao do agente: $($_.Exception.Message)" "WARN"
    }
}

# ------------------------------------------------------------ estado (eventos desde a última coleta)
function Read-State {
    $state = @{}
    if (Test-Path $STATE_FILE) {
        try {
            $obj = Get-Content $STATE_FILE -Raw -Encoding UTF8 | ConvertFrom-Json
            foreach ($p in $obj.PSObject.Properties) { $state[$p.Name] = [string]$p.Value }
        } catch {}
    }
    return $state
}

function Save-State {
    param([hashtable]$State)
    try { ConvertTo-Json -InputObject $State -Compress | Set-Content -Path $STATE_FILE -Encoding UTF8 } catch {}
}

# ------------------------------------------------------------ coleta
function New-RemoteSession {
    param([string]$Computer)
    $isLocal = ($Computer -eq "localhost" -or $Computer -eq "127.0.0.1" -or $Computer -ieq $env:COMPUTERNAME)
    if ($isLocal) {
        try { return New-CimSession -ErrorAction Stop } catch {}
    }
    try {
        $opt = New-CimSessionOption -Protocol Wsman
        return New-CimSession -ComputerName $Computer -SessionOption $opt -OperationTimeoutSec 30 -ErrorAction Stop
    } catch {
        try {
            $opt = New-CimSessionOption -Protocol Dcom
            return New-CimSession -ComputerName $Computer -SessionOption $opt -OperationTimeoutSec 30 -ErrorAction Stop
        } catch {
            return $null
        }
    }
}

function Round1 { param($v) return [math]::Round([double]$v, 1) }

function Get-SmartByDrive {
    param($Session)
    # Mapeia disco físico com previsão de falha -> letras de unidade.
    $result = @{}
    try {
        $smart = Get-CimInstance -CimSession $Session -Namespace "root/wmi" -ClassName MSStorageDriver_FailurePredictStatus -ErrorAction Stop
        $failing = @($smart | Where-Object { $_.PredictFailure -eq $true })
        if ($failing.Count -eq 0) { return $result }
        $drives = Get-CimInstance -CimSession $Session -ClassName Win32_DiskDrive -ErrorAction Stop
        foreach ($d in $drives) {
            $pnp = [string]$d.PNPDeviceID
            $match = $false
            foreach ($f in $failing) {
                $inst = ([string]$f.InstanceName) -replace "_\d+$", ""
                if ($inst -and $pnp -and ($inst -ieq $pnp)) { $match = $true }
            }
            if (-not $match) { continue }
            $parts = Get-CimAssociatedInstance -CimSession $Session -InputObject $d -ResultClassName Win32_DiskPartition -ErrorAction SilentlyContinue
            foreach ($p in $parts) {
                $lds = Get-CimAssociatedInstance -CimSession $Session -InputObject $p -ResultClassName Win32_LogicalDisk -ErrorAction SilentlyContinue
                foreach ($ld in $lds) { $result[[string]$ld.DeviceID] = $true }
            }
        }
    } catch {}
    return $result
}

function Test-RegKey {
    param($Session, [string]$SubKey)
    try {
        $regArgs = @{ hDefKey = [uint32]2147483650; sSubKeyName = $SubKey }
        $r = Invoke-CimMethod -CimSession $Session -Namespace "root/default" -ClassName StdRegProv -MethodName EnumKey -Arguments $regArgs -ErrorAction Stop
        return ($r.ReturnValue -eq 0)
    } catch { return $false }
}

function Get-ServerData {
    param($Session, [string]$Computer, [hashtable]$State, [string]$ServerId)

    $data = @{}

    # CPU
    $cpuPerf = Get-CimInstance -CimSession $Session -ClassName Win32_PerfFormattedData_PerfOS_Processor -Filter "Name='_Total'" -ErrorAction Stop
    $data.cpu_usage = Round1 $cpuPerf.PercentProcessorTime
    $procs = @(Get-CimInstance -CimSession $Session -ClassName Win32_Processor -ErrorAction SilentlyContinue)
    $cores = 0
    foreach ($p in $procs) { $cores += [int]$p.NumberOfLogicalProcessors }
    if ($cores -gt 0) { $data.cpu_cores = $cores }
    if ($procs.Count -gt 0) { $data.cpu_model = ([string]$procs[0].Name).Trim() }

    # RAM / SO
    $os = Get-CimInstance -CimSession $Session -ClassName Win32_OperatingSystem -ErrorAction Stop
    $ramTotal = [double]$os.TotalVisibleMemorySize / 1MB
    $ramFree = [double]$os.FreePhysicalMemory / 1MB
    $ramUsed = $ramTotal - $ramFree
    $data.ram_total_gb = Round1 $ramTotal
    $data.ram_used_gb = Round1 $ramUsed
    if ($ramTotal -gt 0) { $data.ram_usage_pct = Round1 (($ramUsed / $ramTotal) * 100) }
    $data.os_version = "$($os.Caption) $($os.Version)"
    if ($os.LastBootUpTime) {
        $boot = [datetime]$os.LastBootUpTime
        $data.last_boot_time = $boot.ToUniversalTime().ToString("o")
        $data.uptime_seconds = [int64]((Get-Date) - $boot).TotalSeconds
    }

    # Discos (todos os locais)
    $smartMap = Get-SmartByDrive -Session $Session
    $disks = @()
    $sumTotal = 0.0; $sumFree = 0.0; $maxPct = $null
    $logical = Get-CimInstance -CimSession $Session -ClassName Win32_LogicalDisk -Filter "DriveType=3" -ErrorAction SilentlyContinue
    foreach ($ld in $logical) {
        if (-not $ld.Size -or [double]$ld.Size -le 0) { continue }
        $t = [double]$ld.Size / 1GB
        $f = [double]$ld.FreeSpace / 1GB
        $pct = Round1 ((($t - $f) / $t) * 100)
        $sumTotal += $t; $sumFree += $f
        if ($maxPct -eq $null -or $pct -gt $maxPct) { $maxPct = $pct }
        $predict = $false
        if ($smartMap.ContainsKey([string]$ld.DeviceID)) { $predict = $true }
        $disks += @{
            drive = [string]$ld.DeviceID; label = [string]$ld.VolumeName
            total_gb = Round1 $t; free_gb = Round1 $f; used_gb = Round1 ($t - $f)
            usage_pct = $pct; predict_failure = $predict
        }
    }
    $data.disks = $disks
    if ($sumTotal -gt 0) {
        $data.disk_total_gb = Round1 $sumTotal
        $data.disk_free_gb = Round1 $sumFree
        $data.disk_used_gb = Round1 ($sumTotal - $sumFree)
        $data.disk_usage_pct = $maxPct
    }

    # Serviços
    $services = @()
    $all = @(Get-CimInstance -CimSession $Session -ClassName Win32_Service -ErrorAction SilentlyContinue)
    $seen = @{}
    foreach ($svc in $all) {
        $name = [string]$svc.Name
        $inList = $SERVICES_TO_MONITOR -contains $name
        $autoStopped = $false
        if ($ServicosAutomaticos -and $svc.StartMode -eq "Auto" -and $svc.State -ne "Running" -and -not ($SERVICE_NOISE -contains $name)) {
            $autoStopped = $true
        }
        if (-not ($inList -or $autoStopped)) { continue }
        if ($svc.StartMode -eq "Disabled") { continue }
        if ($seen.ContainsKey($name)) { continue }
        $seen[$name] = $true
        $services += @{ name = $name; display_name = [string]$svc.DisplayName; status = [string]$svc.State; start_mode = [string]$svc.StartMode }
    }
    $data.services_status = $services

    # Top processos
    $top = @()
    try {
        $perf = @(Get-CimInstance -CimSession $Session -ClassName Win32_PerfFormattedData_PerfProc_Process -ErrorAction Stop |
            Where-Object { $_.Name -ne "_Total" -and $_.Name -ne "Idle" })
        $div = 1
        if ($cores -gt 0) { $div = $cores }
        $byCpu = $perf | Sort-Object PercentProcessorTime -Descending | Select-Object -First 5
        foreach ($p in $byCpu) {
            $top += @{ name = [string]$p.Name; pid = [int]$p.IDProcess; by = "cpu"
                cpu_pct = Round1 ([double]$p.PercentProcessorTime / $div); mem_mb = Round1 ([double]$p.WorkingSetPrivate / 1MB) }
        }
        $byMem = $perf | Sort-Object WorkingSetPrivate -Descending | Select-Object -First 5
        foreach ($p in $byMem) {
            $top += @{ name = [string]$p.Name; pid = [int]$p.IDProcess; by = "memory"
                cpu_pct = Round1 ([double]$p.PercentProcessorTime / $div); mem_mb = Round1 ([double]$p.WorkingSetPrivate / 1MB) }
        }
    } catch {}
    $data.top_processes = $top

    # Eventos Critical/Error do log System desde a última coleta
    $events = @()
    $since = (Get-Date).AddMinutes(-15)
    if ($State.ContainsKey($ServerId)) {
        try { $since = [datetime]::Parse($State[$ServerId]) } catch {}
    }
    $now = Get-Date
    try {
        $filter = @{ LogName = "System"; Level = 1, 2; StartTime = $since }
        $isLocal = ($Computer -eq "localhost" -or $Computer -eq "127.0.0.1" -or $Computer -ieq $env:COMPUTERNAME)
        if ($isLocal) {
            $evs = Get-WinEvent -FilterHashtable $filter -MaxEvents 50 -ErrorAction Stop
        } else {
            $evs = Get-WinEvent -ComputerName $Computer -FilterHashtable $filter -MaxEvents 50 -ErrorAction Stop
        }
        foreach ($e in $evs) {
            $lvl = "Error"
            if ($e.Level -eq 1) { $lvl = "Critical" }
            $msg = [string]$e.Message
            if ($msg.Length -gt 300) { $msg = $msg.Substring(0, 300) }
            $events += @{ level = $lvl; source = [string]$e.ProviderName; event_id = [int]$e.Id
                time = $e.TimeCreated.ToUniversalTime().ToString("o"); message = $msg }
        }
    } catch {
        # "Nenhum evento encontrado" também cai aqui — ignorar.
    }
    $State[$ServerId] = $now.ToString("o")
    $data.event_errors = $events

    # Reinicialização pendente
    $pending = (Test-RegKey -Session $Session -SubKey "SOFTWARE\Microsoft\Windows\CurrentVersion\Component Based Servicing\RebootPending") -or
               (Test-RegKey -Session $Session -SubKey "SOFTWARE\Microsoft\Windows\CurrentVersion\WindowsUpdate\Auto Update\RebootRequired")
    $data.pending_reboot = [bool]$pending

    return $data
}

function Invoke-Collection {
    Send-AgentVersion
    try {
        $servers = @(Invoke-Api -Function "server-monitor-ingest" -Body @{ type = "list-windows" })
    } catch {
        Write-Log "Erro ao buscar servidores (verifique o token): $($_.Exception.Message)" "ERROR"
        return
    }
    if ($servers.Count -eq 0) { Write-Log "Nenhum servidor Windows cadastrado para este token." "WARN"; return }

    $state = Read-State
    Write-Log "Coletando $($servers.Count) servidor(es)..."

    foreach ($srv in $servers) {
        $computer = [string]$srv.host
        $payload = @{ type = "windows"; server_id = [string]$srv.id; agent_version = $AGENT_VERSION }
        $session = $null
        try {
            $session = New-RemoteSession -Computer $computer
            if ($session -eq $null) {
                $ping = Test-Connection -ComputerName $computer -Count 1 -Quiet -ErrorAction SilentlyContinue
                if ($ping) {
                    $payload.status = "warning"
                    $payload.last_error = "Responde ao ping, mas WMI/WinRM inacessivel (verifique firewall, WinRM e permissoes)."
                } else {
                    $payload.status = "offline"
                    $payload.last_error = "Sem resposta (CIM e ping falharam)."
                }
                Write-Log "$($srv.name): $($payload.status) - $($payload.last_error)" "WARN"
            } else {
                $data = Get-ServerData -Session $session -Computer $computer -State $state -ServerId ([string]$srv.id)
                foreach ($k in $data.Keys) { $payload[$k] = $data[$k] }
                $payload.status = "online"
                Write-Log ("{0}: OK - CPU {1}% RAM {2}% Disco max {3}%" -f $srv.name, $data.cpu_usage, $data.ram_usage_pct, $data.disk_usage_pct)
            }
        } catch {
            $payload.status = "warning"
            $payload.last_error = "Falha na coleta: $($_.Exception.Message)"
            Write-Log "$($srv.name): $($payload.last_error)" "ERROR"
        } finally {
            if ($session -ne $null) { Remove-CimSession -CimSession $session -ErrorAction SilentlyContinue }
        }

        try {
            Invoke-Api -Function "server-monitor-ingest" -Body $payload | Out-Null
        } catch {
            Write-Log "$($srv.name): erro ao enviar dados: $($_.Exception.Message)" "ERROR"
        }
    }
    Save-State -State $state
}

Write-Log "Coletor Windows v$AGENT_VERSION iniciado (intervalo ${Intervalo}s)."
if ($UmaVez) {
    Invoke-Collection
    exit 0
}
while ($true) {
    $start = Get-Date
    try { Invoke-Collection } catch { Write-Log "Erro inesperado: $($_.Exception.Message)" "ERROR" }
    $elapsed = ((Get-Date) - $start).TotalSeconds
    $wait = [int]($Intervalo - $elapsed)
    if ($wait -lt 5) { $wait = 5 }
    Start-Sleep -Seconds $wait
}
