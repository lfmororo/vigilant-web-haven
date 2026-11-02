<#
=== Coletor SQL Server (centralizado) — Mororo.tech — v1.0.0 ===
Roda em UMA máquina Windows e monitora todas as instâncias SQL cadastradas no painel
(list-sqlserver) via System.Data.SqlClient. Compatível com Windows PowerShell 5.1.

Uso:
  powershell -ExecutionPolicy Bypass -File sqlserver-collector.ps1 -Token <MONITOR_TOKEN>
  powershell -ExecutionPolicy Bypass -File sqlserver-collector.ps1 -Token <MONITOR_TOKEN> -UmaVez
  ... -Intervalo 300

Parâmetros:
  -SupabaseUrl (-Url)   Endereço do painel (padrão já preenchido)
  -SupabaseKey (-Key)   Chave pública (opcional)
  -Token                Token do agente (ou variável de ambiente MONITOR_TOKEN) — OBRIGATÓRIO
  -Intervalo            Segundos entre coletas (padrão 300)
  -UmaVez               Faz uma coleta e sai

Autenticação por instância (definida no painel):
  windows -> Integrated Security (conta do serviço que roda este coletor)
  sql     -> usuário/senha SQL cadastrados

PERMISSÕES MÍNIMAS DO LOGIN DE MONITORAMENTO:
  USE master;
  GRANT VIEW SERVER STATE TO [login];
  GRANT VIEW ANY DEFINITION TO [login];
  USE msdb;
  CREATE USER [login] FOR LOGIN [login];
  ALTER ROLE SQLAgentReaderRole ADD MEMBER [login];
  GRANT SELECT ON msdb.dbo.backupset TO [login];
  (DBCC SQLPERF(LOGSPACE) requer VIEW SERVER STATE.)

Falha de conexão = status "offline" (o painel só confirma após falhas consecutivas).
#>
[CmdletBinding()]
param(
    [Alias("Url")][string]$SupabaseUrl = "https://egbusmegupjfxqswdlxq.supabase.co",
    [Alias("Key")][string]$SupabaseKey = "",
    [string]$Token = "",
    [int]$Intervalo = 300,
    [switch]$UmaVez
)

$ErrorActionPreference = "Continue"
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

# Versao deste coletor. Mantenha igual a src/lib/agentVersions.ts.
$AGENT_VERSION = "1.0.0"

if (-not $Token) { $Token = $env:MONITOR_TOKEN }
if (-not $Token) {
    Write-Host "ERRO: informe -Token <MONITOR_TOKEN> (ou defina a variavel de ambiente MONITOR_TOKEN)." -ForegroundColor Red
    exit 1
}
$SupabaseUrl = $SupabaseUrl.TrimEnd("/")
if ($Intervalo -lt 30) { $Intervalo = 30 }

$ScriptDir = $PSScriptRoot
if (-not $ScriptDir) { $ScriptDir = (Get-Location).Path }
$LOG_FILE = Join-Path $ScriptDir "sqlserver-collector.log"
$STATE_FILE = Join-Path $ScriptDir "sqlserver-collector.state.json"
$LOG_MAX_BYTES = 5MB

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
        Invoke-Api -Function "agent-heartbeat" -Body @{ agent_type = "sqlserver"; version = $AGENT_VERSION; host = $env:COMPUTERNAME } | Out-Null
    } catch {
        Write-Log "Falha ao reportar a versao do agente: $($_.Exception.Message)" "WARN"
    }
}

# ------------------------------------------------------------ estado (I/O delta)
function Read-State {
    $state = @{}
    if (Test-Path $STATE_FILE) {
        try {
            $obj = Get-Content $STATE_FILE -Raw -Encoding UTF8 | ConvertFrom-Json
            foreach ($p in $obj.PSObject.Properties) {
                $inner = @{}
                foreach ($q in $p.Value.PSObject.Properties) { $inner[$q.Name] = $q.Value }
                $state[$p.Name] = $inner
            }
        } catch {}
    }
    return $state
}

function Save-State {
    param([hashtable]$State)
    try { ConvertTo-Json -InputObject $State -Depth 5 -Compress | Set-Content -Path $STATE_FILE -Encoding UTF8 } catch {}
}

# ------------------------------------------------------------ SQL helpers
function New-SqlConnection {
    param($Inst)
    $b = New-Object System.Data.SqlClient.SqlConnectionStringBuilder
    $b["Data Source"] = [string]$Inst.instance
    $b["Initial Catalog"] = "master"
    $b["Application Name"] = "Mororo.tech Monitor"
    $b["Connect Timeout"] = 10
    if ([string]$Inst.auth_mode -eq "sql") {
        $b["Integrated Security"] = $false
        $b["User ID"] = [string]$Inst.username
        $b["Password"] = [string]$Inst.password
    } else {
        $b["Integrated Security"] = $true
    }
    $conn = New-Object System.Data.SqlClient.SqlConnection $b.ConnectionString
    $conn.Open()
    return $conn
}

function Invoke-Sql {
    param($Conn, [string]$Query, [int]$Timeout = 30)
    $cmd = $Conn.CreateCommand()
    $cmd.CommandText = $Query
    $cmd.CommandTimeout = $Timeout
    $da = New-Object System.Data.SqlClient.SqlDataAdapter $cmd
    $dt = New-Object System.Data.DataTable
    [void]$da.Fill($dt)
    return ,$dt
}

function Get-Val {
    param($v)
    if ($v -eq $null -or $v -is [System.DBNull]) { return $null }
    return $v
}

function To-Iso {
    param($v)
    if ($v -eq $null -or $v -is [System.DBNull]) { return $null }
    return ([datetime]$v).ToUniversalTime().ToString("o")
}

function Round1 { param($v) if ($v -eq $null -or $v -is [System.DBNull]) { return $null }; return [math]::Round([double]$v, 1) }

# ------------------------------------------------------------ queries
$Q_INFO = @"
SELECT CAST(SERVERPROPERTY('ProductVersion') AS nvarchar(64)) AS version,
       CAST(SERVERPROPERTY('Edition') AS nvarchar(128)) AS edition,
       CAST(SERVERPROPERTY('EngineEdition') AS int) AS engine_edition,
       DATEDIFF(SECOND, sqlserver_start_time, SYSDATETIME()) AS uptime_seconds
FROM sys.dm_os_sys_info;
"@

$Q_COUNTERS = @"
SELECT RTRIM(counter_name) AS counter_name, RTRIM(object_name) AS object_name, cntr_value
FROM sys.dm_os_performance_counters
WHERE (counter_name = 'Page life expectancy' AND object_name LIKE '%Buffer Manager%')
   OR (counter_name IN ('Buffer cache hit ratio','Buffer cache hit ratio base') AND object_name LIKE '%Buffer Manager%')
   OR (counter_name = 'User Connections' AND object_name LIKE '%General Statistics%')
   OR (counter_name = 'Batch Requests/sec' AND object_name LIKE '%SQL Statistics%');
"@

$Q_CPU = @"
SELECT TOP 1 x.record.value('(./Record/SchedulerMonitorEvent/SystemHealth/ProcessUtilization)[1]','int') AS sql_cpu
FROM (SELECT CONVERT(xml, record) AS record, [timestamp]
      FROM sys.dm_os_ring_buffers
      WHERE ring_buffer_type = N'RING_BUFFER_SCHEDULER_MONITOR' AND record LIKE '%<SystemHealth>%') AS x
ORDER BY x.[timestamp] DESC;
"@

$Q_MEMORY = @"
SELECT (SELECT physical_memory_in_use_kb / 1024 FROM sys.dm_os_process_memory) AS memory_used_mb,
       (SELECT CAST(value_in_use AS bigint) FROM sys.configurations WHERE name = 'max server memory (MB)') AS max_server_memory_mb;
"@

$Q_BLOCKING = @"
SELECT COUNT(*) AS blocked, ISNULL(MAX(wait_time), 0) / 1000 AS longest_seconds
FROM sys.dm_exec_requests WHERE blocking_session_id <> 0;
"@

$Q_LONG = @"
SELECT TOP 5 r.session_id, DATEDIFF(SECOND, r.start_time, GETDATE()) AS seconds, r.status, r.command,
       DB_NAME(r.database_id) AS db, r.blocking_session_id, r.wait_type,
       s.login_name, s.host_name, s.program_name,
       LEFT(t.text, 500) AS query_text
FROM sys.dm_exec_requests r
JOIN sys.dm_exec_sessions s ON s.session_id = r.session_id
OUTER APPLY sys.dm_exec_sql_text(r.sql_handle) t
WHERE r.session_id <> @@SPID AND s.is_user_process = 1
  AND DATEDIFF(SECOND, r.start_time, GETDATE()) > 60
ORDER BY r.start_time ASC;
"@

$Q_DATABASES = @"
SELECT d.name, d.state_desc, d.recovery_model_desc, d.log_reuse_wait_desc,
       CAST(SUM(CASE WHEN mf.type = 0 THEN mf.size END) * 8.0 / 1024 AS decimal(18,1)) AS data_mb,
       CAST(SUM(CASE WHEN mf.type = 1 THEN mf.size END) * 8.0 / 1024 AS decimal(18,1)) AS log_mb,
       (SELECT MAX(b.backup_finish_date) FROM msdb.dbo.backupset b WHERE b.database_name = d.name AND b.type = 'D') AS last_full,
       (SELECT MAX(b.backup_finish_date) FROM msdb.dbo.backupset b WHERE b.database_name = d.name AND b.type = 'I') AS last_diff,
       (SELECT MAX(b.backup_finish_date) FROM msdb.dbo.backupset b WHERE b.database_name = d.name AND b.type = 'L') AS last_log
FROM sys.databases d
LEFT JOIN sys.master_files mf ON mf.database_id = d.database_id
WHERE d.database_id <> 2 OR d.name = 'tempdb'
GROUP BY d.name, d.state_desc, d.recovery_model_desc, d.log_reuse_wait_desc;
"@

$Q_LOGSPACE = "DBCC SQLPERF(LOGSPACE) WITH NO_INFOMSGS;"

$Q_JOBS = @"
SELECT j.name, h.run_date, h.run_time, LEFT(h.message, 400) AS message
FROM msdb.dbo.sysjobs j
CROSS APPLY (SELECT TOP 1 jh.run_status, jh.run_date, jh.run_time, jh.message,
                    msdb.dbo.agent_datetime(jh.run_date, jh.run_time) AS run_at
             FROM msdb.dbo.sysjobhistory jh
             WHERE jh.job_id = j.job_id AND jh.step_id = 0
             ORDER BY jh.instance_id DESC) h
WHERE j.enabled = 1 AND h.run_status = 0
  AND h.run_at >= DATEADD(HOUR, -24, GETDATE());
"@

$Q_AGENT = @"
SELECT CASE WHEN EXISTS (SELECT 1 FROM sys.dm_server_services WHERE servicename LIKE 'SQL Server Agent%' AND status_desc = 'Running')
            THEN 1 ELSE 0 END AS agent_running;
"@

$Q_WAITS = @"
SELECT TOP 5 wait_type, wait_time_ms, waiting_tasks_count
FROM sys.dm_os_wait_stats
WHERE wait_type NOT IN (
  'BROKER_EVENTHANDLER','BROKER_RECEIVE_WAITFOR','BROKER_TASK_STOP','BROKER_TO_FLUSH','BROKER_TRANSMITTER',
  'CHECKPOINT_QUEUE','CHKPT','CLR_AUTO_EVENT','CLR_MANUAL_EVENT','CLR_SEMAPHORE','DBMIRROR_DBM_EVENT',
  'DBMIRROR_EVENTS_QUEUE','DBMIRROR_WORKER_QUEUE','DBMIRRORING_CMD','DIRTY_PAGE_POLL','DISPATCHER_QUEUE_SEMAPHORE',
  'EXECSYNC','FSAGENT','FT_IFTS_SCHEDULER_IDLE_WAIT','FT_IFTSHC_MUTEX','HADR_CLUSAPI_CALL','HADR_FILESTREAM_IOMGR_IOCOMPLETION',
  'HADR_LOGCAPTURE_WAIT','HADR_NOTIFICATION_DEQUEUE','HADR_TIMER_TASK','HADR_WORK_QUEUE','KSOURCE_WAKEUP','LAZYWRITER_SLEEP',
  'LOGMGR_QUEUE','MEMORY_ALLOCATION_EXT','ONDEMAND_TASK_QUEUE','PARALLEL_REDO_DRAIN_WORKER','PARALLEL_REDO_LOG_CACHE',
  'PARALLEL_REDO_TRAN_LIST','PARALLEL_REDO_WORKER_SYNC','PARALLEL_REDO_WORKER_WAIT_WORK','PREEMPTIVE_XE_GETTARGETSTATE',
  'PWAIT_ALL_COMPONENTS_INITIALIZED','PWAIT_DIRECTLOGCONSUMER_GETNEXT','QDS_PERSIST_TASK_MAIN_LOOP_SLEEP','QDS_ASYNC_QUEUE',
  'QDS_CLEANUP_STALE_QUERIES_TASK_MAIN_LOOP_SLEEP','QDS_SHUTDOWN_QUEUE','REDO_THREAD_PENDING_WORK','REQUEST_FOR_DEADLOCK_SEARCH',
  'RESOURCE_QUEUE','SERVER_IDLE_CHECK','SLEEP_BPOOL_FLUSH','SLEEP_DBSTARTUP','SLEEP_DCOMSTARTUP','SLEEP_MASTERDBREADY',
  'SLEEP_MASTERMDREADY','SLEEP_MASTERUPGRADED','SLEEP_MSDBSTARTUP','SLEEP_SYSTEMTASK','SLEEP_TASK','SLEEP_TEMPDBSTARTUP',
  'SNI_HTTP_ACCEPT','SOS_WORK_DISPATCHER','SP_SERVER_DIAGNOSTICS_SLEEP','SQLTRACE_BUFFER_FLUSH','SQLTRACE_INCREMENTAL_FLUSH_SLEEP',
  'SQLTRACE_WAIT_ENTRIES','VDI_CLIENT_OTHER','WAIT_FOR_RESULTS','WAITFOR','WAITFOR_TASKSHUTDOWN','WAIT_XTP_RECOVERY',
  'WAIT_XTP_HOST_WAIT','WAIT_XTP_OFFLINE_CKPT_NEW_LOG','WAIT_XTP_CKPT_CLOSE','XE_DISPATCHER_JOIN','XE_DISPATCHER_WAIT',
  'XE_TIMER_EVENT','XE_LIVE_TARGET_TVF','SOS_SCHEDULER_YIELD_IDLE')
  AND wait_type NOT LIKE 'PREEMPTIVE_OS_%' AND wait_type NOT LIKE 'SLEEP_%'
  AND waiting_tasks_count > 0
ORDER BY wait_time_ms DESC;
"@

$Q_IO = @"
SELECT DB_NAME(vfs.database_id) AS db, mf.type_desc AS file_type,
       SUM(vfs.num_of_reads) AS reads, SUM(vfs.io_stall_read_ms) AS read_stall,
       SUM(vfs.num_of_writes) AS writes, SUM(vfs.io_stall_write_ms) AS write_stall
FROM sys.dm_io_virtual_file_stats(NULL, NULL) vfs
JOIN sys.master_files mf ON mf.database_id = vfs.database_id AND mf.file_id = vfs.file_id
GROUP BY DB_NAME(vfs.database_id), mf.type_desc;
"@

function Get-Counters {
    param($Conn)
    $r = @{}
    foreach ($row in (Invoke-Sql -Conn $Conn -Query $Q_COUNTERS).Rows) {
        $name = [string]$row.counter_name
        # Em instâncias nomeadas pode haver mais de um nó NUMA — fica o primeiro (Buffer Manager, não Buffer Node).
        if (-not $r.ContainsKey($name)) { $r[$name] = [double]$row.cntr_value }
    }
    return $r
}

function Get-InstanceData {
    param($Conn, [hashtable]$State, [string]$InstanceId)
    $data = @{}
    $info = @{}

    $row = (Invoke-Sql -Conn $Conn -Query $Q_INFO).Rows[0]
    $info.version = [string]$row.version
    $info.edition = [string]$row.edition
    $info.uptime_seconds = [long]$row.uptime_seconds
    $isExpress = ([int]$row.engine_edition -eq 4) -or ($info.edition -like "*Express*")

    # Contadores (2 amostras com 2s para Batch Requests/sec)
    $c1 = Get-Counters -Conn $Conn
    Start-Sleep -Seconds 2
    $c2 = Get-Counters -Conn $Conn
    $info.ple_seconds = [long]$c2["Page life expectancy"]
    $base = $c2["Buffer cache hit ratio base"]
    if ($base -gt 0) { $info.buffer_cache_hit_pct = Round1 ($c2["Buffer cache hit ratio"] * 100.0 / $base) }
    $info.user_connections = [int]$c2["User Connections"]
    $info.batch_requests_sec = Round1 (($c2["Batch Requests/sec"] - $c1["Batch Requests/sec"]) / 2.0)
    if ($info.batch_requests_sec -lt 0) { $info.batch_requests_sec = 0 }

    try {
        $cpuRows = (Invoke-Sql -Conn $Conn -Query $Q_CPU).Rows
        if ($cpuRows.Count -gt 0) { $info.sql_cpu_pct = [double](Get-Val $cpuRows[0].sql_cpu) }
    } catch { Write-Log "CPU (ring buffer) indisponivel: $($_.Exception.Message)" "WARN" }

    try {
        $m = (Invoke-Sql -Conn $Conn -Query $Q_MEMORY).Rows[0]
        $info.memory_used_mb = [long](Get-Val $m.memory_used_mb)
        $info.max_server_memory_mb = [long](Get-Val $m.max_server_memory_mb)
    } catch { Write-Log "Memoria indisponivel: $($_.Exception.Message)" "WARN" }

    $b = (Invoke-Sql -Conn $Conn -Query $Q_BLOCKING).Rows[0]
    $info.blocked_sessions = [int]$b.blocked
    $info.longest_block_seconds = [long]$b.longest_seconds

    # Consultas longas
    $long = @()
    foreach ($r in (Invoke-Sql -Conn $Conn -Query $Q_LONG).Rows) {
        $long += @{
            session_id = [int]$r.session_id; seconds = [long]$r.seconds; status = [string]$r.status
            command = [string]$r.command; db = [string]$r.db; blocking_session_id = [int]$r.blocking_session_id
            wait_type = [string](Get-Val $r.wait_type); login = [string]$r.login_name; host = [string](Get-Val $r.host_name)
            program = [string](Get-Val $r.program_name); text = [string](Get-Val $r.query_text)
        }
    }
    $data.long_running_queries = $long

    # Bancos + % do log
    $logPct = @{}
    try {
        foreach ($r in (Invoke-Sql -Conn $Conn -Query $Q_LOGSPACE).Rows) {
            $logPct[[string]$r[0]] = Round1 $r[2]
        }
    } catch { Write-Log "DBCC SQLPERF(LOGSPACE) falhou: $($_.Exception.Message)" "WARN" }

    $dbs = @()
    foreach ($r in (Invoke-Sql -Conn $Conn -Query $Q_DATABASES).Rows) {
        $full = Get-Val $r.last_full
        $diff = Get-Val $r.last_diff
        # Diferencial mais recente que o FULL conta como cobertura do FULL.
        $cover = $full
        if ($diff -ne $null -and ($cover -eq $null -or [datetime]$diff -gt [datetime]$cover)) { $cover = $diff }
        $name = [string]$r.name
        $lp = $null
        if ($logPct.ContainsKey($name)) { $lp = $logPct[$name] }
        $dbs += @{
            name = $name; state = [string]$r.state_desc; recovery = [string]$r.recovery_model_desc
            log_reuse_wait = [string]$r.log_reuse_wait_desc
            data_mb = Round1 $r.data_mb; log_mb = Round1 $r.log_mb; log_used_pct = $lp
            last_full_backup = (To-Iso $cover); last_full_only = (To-Iso $full)
            last_diff_backup = (To-Iso $diff); last_log_backup = (To-Iso $r.last_log)
        }
    }
    $data.databases = $dbs

    # Jobs e SQL Agent (pulados no Express)
    $jobs = @()
    if (-not $isExpress) {
        try {
            $info.agent_running = ([int](Invoke-Sql -Conn $Conn -Query $Q_AGENT).Rows[0].agent_running -eq 1)
        } catch { Write-Log "Estado do SQL Agent indisponivel: $($_.Exception.Message)" "WARN" }
        try {
            foreach ($r in (Invoke-Sql -Conn $Conn -Query $Q_JOBS).Rows) {
                $jobs += @{ name = [string]$r.name; run_date = [string]$r.run_date; run_time = [string]$r.run_time; message = [string]$r.message }
            }
        } catch { Write-Log "Jobs indisponiveis (permissao em msdb?): $($_.Exception.Message)" "WARN" }
    }
    $data.failed_jobs = $jobs

    # Esperas
    $waits = @()
    foreach ($r in (Invoke-Sql -Conn $Conn -Query $Q_WAITS).Rows) {
        $waits += @{ wait_type = [string]$r.wait_type; wait_time_ms = [long]$r.wait_time_ms; tasks = [long]$r.waiting_tasks_count }
    }
    $data.top_waits = $waits

    # Latência de I/O (delta desde a coleta anterior)
    $prev = @{}
    if ($State.ContainsKey($InstanceId)) { $prev = $State[$InstanceId] }
    $current = @{}
    $io = @()
    foreach ($r in (Invoke-Sql -Conn $Conn -Query $Q_IO).Rows) {
        $key = "{0}|{1}" -f $r.db, $r.file_type
        $cur = @([long]$r.reads, [long]$r.read_stall, [long]$r.writes, [long]$r.write_stall)
        $current[$key] = ($cur -join ",")
        if ($prev.ContainsKey($key)) {
            $p = @(([string]$prev[$key]).Split(",") | ForEach-Object { [long]$_ })
            $dr = $cur[0] - $p[0]; $drs = $cur[1] - $p[1]; $dw = $cur[2] - $p[2]; $dws = $cur[3] - $p[3]
            if ($dr -lt 0 -or $dw -lt 0) { continue }   # reinício da instância
            if (($dr + $dw) -lt 50) { continue }
            $readMs = $null; $writeMs = $null
            if ($dr -gt 0) { $readMs = Round1 ($drs / $dr) }
            if ($dw -gt 0) { $writeMs = Round1 ($dws / $dw) }
            $type = "data"
            if ([string]$r.file_type -eq "LOG") { $type = "log" }
            $io += @{ db = [string]$r.db; type = $type; read_ms = $readMs; write_ms = $writeMs; reads = $dr; writes = $dw }
        }
    }
    $State[$InstanceId] = $current
    $data.io_latency = $io

    $data.info = $info
    return $data
}

# ------------------------------------------------------------ ciclo
function Invoke-Collection {
    Send-AgentVersion
    try {
        $instances = @(Invoke-Api -Function "server-monitor-ingest" -Body @{ type = "list-sqlserver" })
    } catch {
        Write-Log "Erro ao buscar instancias (verifique o token): $($_.Exception.Message)" "ERROR"
        return
    }
    if ($instances.Count -eq 0) { Write-Log "Nenhuma instancia SQL cadastrada para este token." "WARN"; return }

    $state = Read-State
    Write-Log "Coletando $($instances.Count) instancia(s) SQL..."

    foreach ($inst in $instances) {
        $payload = @{ type = "sqlserver"; instance_id = [string]$inst.id; agent_version = $AGENT_VERSION }
        $conn = $null
        try {
            try {
                $conn = New-SqlConnection -Inst $inst
            } catch {
                $payload.status = "offline"
                $payload.last_error = "Falha de conexao: $($_.Exception.Message)"
                Write-Log "$($inst.name): offline - $($_.Exception.Message)" "WARN"
            }
            if ($conn -ne $null) {
                $data = Get-InstanceData -Conn $conn -State $state -InstanceId ([string]$inst.id)
                foreach ($k in $data.Keys) { $payload[$k] = $data[$k] }
                $payload.status = "online"
                Write-Log ("{0}: OK - CPU {1}% PLE {2}s bloqueios {3} bancos {4}" -f $inst.name, $data.info.sql_cpu_pct, $data.info.ple_seconds, $data.info.blocked_sessions, @($data.databases).Count)
            }
        } catch {
            $payload.status = "warning"
            $payload.last_error = "Erro na coleta: $($_.Exception.Message)"
            Write-Log "$($inst.name): erro na coleta - $($_.Exception.Message)" "ERROR"
        } finally {
            if ($conn -ne $null) { try { $conn.Close(); $conn.Dispose() } catch {} }
        }
        try {
            Invoke-Api -Function "server-monitor-ingest" -Body $payload | Out-Null
        } catch {
            Write-Log "$($inst.name): falha ao enviar - $($_.Exception.Message)" "ERROR"
        }
    }
    Save-State -State $state
}

Write-Log "Coletor SQL Server v$AGENT_VERSION iniciado (intervalo $Intervalo s)."
if ($UmaVez) { Invoke-Collection; exit 0 }
while ($true) {
    $inicio = Get-Date
    try { Invoke-Collection } catch { Write-Log "Erro no ciclo: $($_.Exception.Message)" "ERROR" }
    $espera = $Intervalo - [int]((Get-Date) - $inicio).TotalSeconds
    if ($espera -lt 5) { $espera = 5 }
    Start-Sleep -Seconds $espera
}
