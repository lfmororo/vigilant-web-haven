# === Windows Server Monitor Agent ===
# Instale via Task Scheduler para rodar a cada 5 minutos
# =============================================

# ---- CONFIGURAÇÃO ----
$SUPABASE_URL = "https://egbusmegupjfxqswdlxq.supabase.co"
$SUPABASE_ANON_KEY = "COLE_SUA_ANON_KEY_AQUI"
$SERVER_ID = "COLE_O_ID_DO_SERVIDOR_AQUI"

# Serviços a monitorar (nomes curtos do Windows)
$SERVICES_TO_MONITOR = @(
    "MSSQLSERVER",
    "MSSQL`$SQLEXPRESS",
    "W3SVC",
    "Spooler",
    "wuauserv",
    "MpsSvc"
)
# ---- FIM CONFIGURAÇÃO ----

$ErrorActionPreference = "SilentlyContinue"
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$LOG_FILE = "C:\Scripts\server-agent.log"

function Write-Log($msg) {
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    "$timestamp | $msg" | Out-File -Append -FilePath $LOG_FILE -Encoding UTF8
}

try {
    Write-Log "Iniciando coleta..."

    # CPU
    $cpuLoad = (Get-WmiObject Win32_Processor | Measure-Object -Property LoadPercentage -Average).Average

    # RAM
    $os = Get-WmiObject Win32_OperatingSystem
    $ramTotalGB = [math]::Round($os.TotalVisibleMemorySize / 1MB, 2)
    $ramFreeGB = [math]::Round($os.FreePhysicalMemory / 1MB, 2)
    $ramUsedGB = [math]::Round($ramTotalGB - $ramFreeGB, 2)
    $ramUsagePct = if ($ramTotalGB -gt 0) { [math]::Round(($ramUsedGB / $ramTotalGB) * 100, 1) } else { 0 }

    # Disco (C:)
    $disk = Get-WmiObject Win32_LogicalDisk -Filter "DeviceID='C:'"
    $diskTotalGB = [math]::Round($disk.Size / 1GB, 2)
    $diskFreeGB = [math]::Round($disk.FreeSpace / 1GB, 2)
    $diskUsedGB = [math]::Round($diskTotalGB - $diskFreeGB, 2)
    $diskUsagePct = if ($diskTotalGB -gt 0) { [math]::Round(($diskUsedGB / $diskTotalGB) * 100, 1) } else { 0 }

    # Uptime
    $bootTime = $os.ConvertToDateTime($os.LastBootUpTime)
    $uptimeSeconds = [math]::Floor(((Get-Date) - $bootTime).TotalSeconds)
    $lastBootISO = $bootTime.ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")

    # OS Version
    $osVersion = (Get-WmiObject Win32_OperatingSystem).Caption

    # Serviços
    $servicesStatus = @()
    foreach ($svcName in $SERVICES_TO_MONITOR) {
        $svc = Get-Service -Name $svcName -ErrorAction SilentlyContinue
        if ($svc) {
            $servicesStatus += @{
                name = $svc.ServiceName
                display_name = $svc.DisplayName
                status = $svc.Status.ToString()
            }
        }
    }

    $payload = @{
        type = "windows"
        server_id = $SERVER_ID
        cpu_usage = $cpuLoad
        ram_total_gb = $ramTotalGB
        ram_used_gb = $ramUsedGB
        ram_usage_pct = $ramUsagePct
        disk_total_gb = $diskTotalGB
        disk_used_gb = $diskUsedGB
        disk_free_gb = $diskFreeGB
        disk_usage_pct = $diskUsagePct
        uptime_seconds = $uptimeSeconds
        last_boot_time = $lastBootISO
        os_version = $osVersion
        services_status = $servicesStatus
    } | ConvertTo-Json -Depth 5

    $headers = @{
        "Content-Type" = "application/json"
        "Authorization" = "Bearer $SUPABASE_ANON_KEY"
        "apikey" = $SUPABASE_ANON_KEY
    }

    $response = Invoke-RestMethod -Uri "$SUPABASE_URL/functions/v1/server-monitor-ingest" -Method POST -Body $payload -Headers $headers

    Write-Log "Coleta enviada com sucesso. CPU: ${cpuLoad}% | RAM: ${ramUsagePct}% | Disco: ${diskUsagePct}%"

} catch {
    Write-Log "ERRO: $($_.Exception.Message)"
}
