# === Windows Servers Collector (Centralizado) ===
# Roda em UMA máquina Windows e monitora TODOS os servidores da rede via WMI
# Agende via Task Scheduler para rodar a cada 5 minutos
# Requisito: Conta com permissão WMI nos servidores remotos
# ================================================

# ---- CONFIGURAÇÃO ----
$SUPABASE_URL = "https://egbusmegupjfxqswdlxq.supabase.co"
$SUPABASE_ANON_KEY = "COLE_SUA_ANON_KEY_AQUI"

# Serviços a monitorar em cada servidor
$SERVICES_TO_MONITOR = @(
    "MSSQLSERVER",
    "MSSQL`$SQLEXPRESS",
    "W3SVC",
    "Spooler",
    "wuauserv",
    "MpsSvc",
    "DNS",
    "DHCP",
    "NTDS"
)
# ---- FIM CONFIGURAÇÃO ----

$ErrorActionPreference = "SilentlyContinue"
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$LOG_FILE = Join-Path $PSScriptRoot "windows-collector.log"

function Write-Log($msg) {
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    "$timestamp | $msg" | Out-File -Append -FilePath $LOG_FILE -Encoding UTF8
    Write-Host "$timestamp | $msg"
}

function Get-ServerList {
    try {
        $headers = @{
            "Content-Type"  = "application/json"
            "Authorization" = "Bearer $SUPABASE_ANON_KEY"
            "apikey"        = $SUPABASE_ANON_KEY
        }
        $body = @{ type = "list-windows" } | ConvertTo-Json
        $response = Invoke-RestMethod -Uri "$SUPABASE_URL/functions/v1/server-monitor-ingest" -Method POST -Body $body -Headers $headers -TimeoutSec 15
        return $response
    }
    catch {
        Write-Log "ERRO ao buscar lista de servidores: $($_.Exception.Message)"
        return @()
    }
}

function Test-ServerOnline($ip) {
    return (Test-Connection -ComputerName $ip -Count 2 -Quiet -TimeoutSeconds 3)
}

function Collect-ServerData($server) {
    $ip = $server.host
    $serverId = $server.id
    $name = $server.name

    Write-Log "Coletando: $name ($ip)..."

    # Verificar se está online via ping
    if (-not (Test-ServerOnline $ip)) {
        Write-Log "  ❌ $name OFFLINE"
        # Reportar offline
        try {
            $headers = @{
                "Content-Type"  = "application/json"
                "Authorization" = "Bearer $SUPABASE_ANON_KEY"
                "apikey"        = $SUPABASE_ANON_KEY
            }
            $payload = @{
                type      = "windows"
                server_id = $serverId
                status    = "offline"
            } | ConvertTo-Json
            Invoke-RestMethod -Uri "$SUPABASE_URL/functions/v1/server-monitor-ingest" -Method POST -Body $payload -Headers $headers -TimeoutSec 15 | Out-Null
        } catch {}
        return
    }

    try {
        # CPU via WMI remoto
        $cpuLoad = (Get-WmiObject Win32_Processor -ComputerName $ip -ErrorAction Stop | Measure-Object -Property LoadPercentage -Average).Average

        # RAM via WMI remoto
        $os = Get-WmiObject Win32_OperatingSystem -ComputerName $ip -ErrorAction Stop
        $ramTotalGB = [math]::Round($os.TotalVisibleMemorySize / 1MB, 2)
        $ramFreeGB = [math]::Round($os.FreePhysicalMemory / 1MB, 2)
        $ramUsedGB = [math]::Round($ramTotalGB - $ramFreeGB, 2)
        $ramUsagePct = if ($ramTotalGB -gt 0) { [math]::Round(($ramUsedGB / $ramTotalGB) * 100, 1) } else { 0 }

        # Disco C: via WMI remoto
        $disk = Get-WmiObject Win32_LogicalDisk -ComputerName $ip -Filter "DeviceID='C:'" -ErrorAction Stop
        $diskTotalGB = [math]::Round($disk.Size / 1GB, 2)
        $diskFreeGB = [math]::Round($disk.FreeSpace / 1GB, 2)
        $diskUsedGB = [math]::Round($diskTotalGB - $diskFreeGB, 2)
        $diskUsagePct = if ($diskTotalGB -gt 0) { [math]::Round(($diskUsedGB / $diskTotalGB) * 100, 1) } else { 0 }

        # Uptime
        $bootTime = $os.ConvertToDateTime($os.LastBootUpTime)
        $uptimeSeconds = [math]::Floor(((Get-Date) - $bootTime).TotalSeconds)
        $lastBootISO = $bootTime.ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")

        # OS Version
        $osVersion = $os.Caption

        # Serviços remotos
        $servicesStatus = @()
        foreach ($svcName in $SERVICES_TO_MONITOR) {
            $svc = Get-Service -ComputerName $ip -Name $svcName -ErrorAction SilentlyContinue
            if ($svc) {
                $servicesStatus += @{
                    name         = $svc.ServiceName
                    display_name = $svc.DisplayName
                    status       = $svc.Status.ToString()
                }
            }
        }

        # Enviar dados
        $headers = @{
            "Content-Type"  = "application/json"
            "Authorization" = "Bearer $SUPABASE_ANON_KEY"
            "apikey"        = $SUPABASE_ANON_KEY
        }

        $payload = @{
            type             = "windows"
            server_id        = $serverId
            cpu_usage        = $cpuLoad
            ram_total_gb     = $ramTotalGB
            ram_used_gb      = $ramUsedGB
            ram_usage_pct    = $ramUsagePct
            disk_total_gb    = $diskTotalGB
            disk_used_gb     = $diskUsedGB
            disk_free_gb     = $diskFreeGB
            disk_usage_pct   = $diskUsagePct
            uptime_seconds   = $uptimeSeconds
            last_boot_time   = $lastBootISO
            os_version       = $osVersion
            services_status  = $servicesStatus
        } | ConvertTo-Json -Depth 5

        Invoke-RestMethod -Uri "$SUPABASE_URL/functions/v1/server-monitor-ingest" -Method POST -Body $payload -Headers $headers -TimeoutSec 15 | Out-Null

        Write-Log "  ✅ $name | CPU: ${cpuLoad}% | RAM: ${ramUsagePct}% | Disco: ${diskUsagePct}%"
    }
    catch {
        Write-Log "  ⚠ $name: WMI falhou - $($_.Exception.Message) (marcando como online via ping)"
        # Servidor responde ping mas WMI falhou - reportar online com erro
        try {
            $headers = @{
                "Content-Type"  = "application/json"
                "Authorization" = "Bearer $SUPABASE_ANON_KEY"
                "apikey"        = $SUPABASE_ANON_KEY
            }
            $payload = @{
                type      = "windows"
                server_id = $serverId
                status    = "warning"
                last_error = "WMI access denied or unavailable"
            } | ConvertTo-Json
            Invoke-RestMethod -Uri "$SUPABASE_URL/functions/v1/server-monitor-ingest" -Method POST -Body $payload -Headers $headers -TimeoutSec 15 | Out-Null
        } catch {}
    }
}

# === EXECUÇÃO ===
Write-Log "=== Ciclo de coleta Windows Servers ==="

$servers = Get-ServerList

if ($servers.Count -eq 0) {
    Write-Log "Nenhum servidor Windows ativo encontrado no painel."
    exit
}

Write-Log "$($servers.Count) servidor(es) encontrado(s)"

foreach ($srv in $servers) {
    Collect-ServerData $srv
}

Write-Log "=== Ciclo finalizado ===`n"
