package main

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	_ "github.com/microsoft/go-mssqldb"
)

// Porte do public/sqlserver-collector.ps1 (mesmas consultas e o mesmo formato de envio).

const qInfo = `SELECT CAST(SERVERPROPERTY('ProductVersion') AS nvarchar(64)), CAST(SERVERPROPERTY('Edition') AS nvarchar(128)),
 CAST(SERVERPROPERTY('EngineEdition') AS int), DATEDIFF(SECOND, sqlserver_start_time, SYSDATETIME()) FROM sys.dm_os_sys_info;`

const qCounters = `SELECT RTRIM(counter_name), cntr_value FROM sys.dm_os_performance_counters
WHERE (counter_name = 'Page life expectancy' AND object_name LIKE '%Buffer Manager%')
   OR (counter_name IN ('Buffer cache hit ratio','Buffer cache hit ratio base') AND object_name LIKE '%Buffer Manager%')
   OR (counter_name = 'User Connections' AND object_name LIKE '%General Statistics%')
   OR (counter_name = 'Batch Requests/sec' AND object_name LIKE '%SQL Statistics%');`

const qCPU = `SELECT TOP 1 x.record.value('(./Record/SchedulerMonitorEvent/SystemHealth/ProcessUtilization)[1]','int')
FROM (SELECT CONVERT(xml, record) AS record, [timestamp] FROM sys.dm_os_ring_buffers
      WHERE ring_buffer_type = N'RING_BUFFER_SCHEDULER_MONITOR' AND record LIKE '%<SystemHealth>%') AS x ORDER BY x.[timestamp] DESC;`

const qMemory = `SELECT (SELECT physical_memory_in_use_kb / 1024 FROM sys.dm_os_process_memory),
 (SELECT CAST(value_in_use AS bigint) FROM sys.configurations WHERE name = 'max server memory (MB)');`

const qBlocking = `SELECT COUNT(*), ISNULL(MAX(wait_time), 0) / 1000 FROM sys.dm_exec_requests WHERE blocking_session_id <> 0;`

const qLong = `SELECT TOP 5 r.session_id, DATEDIFF(SECOND, r.start_time, GETDATE()), r.status, r.command, DB_NAME(r.database_id),
 r.blocking_session_id, r.wait_type, s.login_name, s.host_name, s.program_name, LEFT(t.text, 500)
FROM sys.dm_exec_requests r JOIN sys.dm_exec_sessions s ON s.session_id = r.session_id
OUTER APPLY sys.dm_exec_sql_text(r.sql_handle) t
WHERE r.session_id <> @@SPID AND s.is_user_process = 1 AND DATEDIFF(SECOND, r.start_time, GETDATE()) > 60
ORDER BY r.start_time ASC;`

const qDatabases = `SELECT d.name, d.state_desc, d.recovery_model_desc, d.log_reuse_wait_desc,
 CAST(SUM(CASE WHEN mf.type = 0 THEN mf.size END) * 8.0 / 1024 AS decimal(18,1)),
 CAST(SUM(CASE WHEN mf.type = 1 THEN mf.size END) * 8.0 / 1024 AS decimal(18,1)),
 (SELECT MAX(b.backup_finish_date) FROM msdb.dbo.backupset b WHERE b.database_name = d.name AND b.type = 'D'),
 (SELECT MAX(b.backup_finish_date) FROM msdb.dbo.backupset b WHERE b.database_name = d.name AND b.type = 'I'),
 (SELECT MAX(b.backup_finish_date) FROM msdb.dbo.backupset b WHERE b.database_name = d.name AND b.type = 'L')
FROM sys.databases d LEFT JOIN sys.master_files mf ON mf.database_id = d.database_id
WHERE d.database_id <> 2 OR d.name = 'tempdb'
GROUP BY d.name, d.state_desc, d.recovery_model_desc, d.log_reuse_wait_desc;`

const qJobs = `SELECT j.name, h.run_date, h.run_time, LEFT(h.message, 400)
FROM msdb.dbo.sysjobs j
CROSS APPLY (SELECT TOP 1 jh.run_status, jh.run_date, jh.run_time, jh.message, msdb.dbo.agent_datetime(jh.run_date, jh.run_time) AS run_at
             FROM msdb.dbo.sysjobhistory jh WHERE jh.job_id = j.job_id AND jh.step_id = 0 ORDER BY jh.instance_id DESC) h
WHERE j.enabled = 1 AND h.run_status = 0 AND h.run_at >= DATEADD(HOUR, -24, GETDATE());`

const qAgent = `SELECT CASE WHEN EXISTS (SELECT 1 FROM sys.dm_server_services WHERE servicename LIKE 'SQL Server Agent%' AND status_desc = 'Running') THEN 1 ELSE 0 END;`

const qWaits = `SELECT TOP 5 wait_type, wait_time_ms, waiting_tasks_count FROM sys.dm_os_wait_stats
WHERE wait_type NOT IN ('BROKER_EVENTHANDLER','BROKER_RECEIVE_WAITFOR','BROKER_TASK_STOP','BROKER_TO_FLUSH','BROKER_TRANSMITTER',
 'CHECKPOINT_QUEUE','CHKPT','CLR_AUTO_EVENT','CLR_MANUAL_EVENT','CLR_SEMAPHORE','DBMIRROR_DBM_EVENT','DBMIRROR_EVENTS_QUEUE',
 'DBMIRROR_WORKER_QUEUE','DBMIRRORING_CMD','DIRTY_PAGE_POLL','DISPATCHER_QUEUE_SEMAPHORE','EXECSYNC','FSAGENT',
 'FT_IFTS_SCHEDULER_IDLE_WAIT','FT_IFTSHC_MUTEX','HADR_CLUSAPI_CALL','HADR_FILESTREAM_IOMGR_IOCOMPLETION','HADR_LOGCAPTURE_WAIT',
 'HADR_NOTIFICATION_DEQUEUE','HADR_TIMER_TASK','HADR_WORK_QUEUE','KSOURCE_WAKEUP','LAZYWRITER_SLEEP','LOGMGR_QUEUE',
 'MEMORY_ALLOCATION_EXT','ONDEMAND_TASK_QUEUE','PARALLEL_REDO_DRAIN_WORKER','PARALLEL_REDO_LOG_CACHE','PARALLEL_REDO_TRAN_LIST',
 'PARALLEL_REDO_WORKER_SYNC','PARALLEL_REDO_WORKER_WAIT_WORK','PREEMPTIVE_XE_GETTARGETSTATE','PWAIT_ALL_COMPONENTS_INITIALIZED',
 'PWAIT_DIRECTLOGCONSUMER_GETNEXT','QDS_PERSIST_TASK_MAIN_LOOP_SLEEP','QDS_ASYNC_QUEUE','QDS_CLEANUP_STALE_QUERIES_TASK_MAIN_LOOP_SLEEP',
 'QDS_SHUTDOWN_QUEUE','REDO_THREAD_PENDING_WORK','REQUEST_FOR_DEADLOCK_SEARCH','RESOURCE_QUEUE','SERVER_IDLE_CHECK',
 'SLEEP_BPOOL_FLUSH','SLEEP_DBSTARTUP','SLEEP_DCOMSTARTUP','SLEEP_MASTERDBREADY','SLEEP_MASTERMDREADY','SLEEP_MASTERUPGRADED',
 'SLEEP_MSDBSTARTUP','SLEEP_SYSTEMTASK','SLEEP_TASK','SLEEP_TEMPDBSTARTUP','SNI_HTTP_ACCEPT','SOS_WORK_DISPATCHER',
 'SP_SERVER_DIAGNOSTICS_SLEEP','SQLTRACE_BUFFER_FLUSH','SQLTRACE_INCREMENTAL_FLUSH_SLEEP','SQLTRACE_WAIT_ENTRIES','VDI_CLIENT_OTHER',
 'WAIT_FOR_RESULTS','WAITFOR','WAITFOR_TASKSHUTDOWN','WAIT_XTP_RECOVERY','WAIT_XTP_HOST_WAIT','WAIT_XTP_OFFLINE_CKPT_NEW_LOG',
 'WAIT_XTP_CKPT_CLOSE','XE_DISPATCHER_JOIN','XE_DISPATCHER_WAIT','XE_TIMER_EVENT','XE_LIVE_TARGET_TVF','SOS_SCHEDULER_YIELD_IDLE')
 AND wait_type NOT LIKE 'PREEMPTIVE_OS_%' AND wait_type NOT LIKE 'SLEEP_%' AND waiting_tasks_count > 0
ORDER BY wait_time_ms DESC;`

const qIO = `SELECT DB_NAME(vfs.database_id), mf.type_desc, SUM(vfs.num_of_reads), SUM(vfs.io_stall_read_ms), SUM(vfs.num_of_writes), SUM(vfs.io_stall_write_ms)
FROM sys.dm_io_virtual_file_stats(NULL, NULL) vfs JOIN sys.master_files mf ON mf.database_id = vfs.database_id AND mf.file_id = vfs.file_id
GROUP BY DB_NAME(vfs.database_id), mf.type_desc;`

// Estado do delta de I/O entre coletas.
var sqlIOState = struct {
	sync.Mutex
	m map[string]map[string][4]int64
}{m: map[string]map[string][4]int64{}}

func sqlConnString(d map[string]any) string {
	inst := sval(d, "instance")
	if inst == "" {
		inst = sval(d, "host")
	}
	server, port := inst, ""
	if h, p, ok := strings.Cut(inst, ","); ok {
		server, port = strings.TrimSpace(h), strings.TrimSpace(p)
	}
	parts := []string{
		"server=" + server, "database=master", "app name=Mororo.Tech Monitor", "connection timeout=10",
		"encrypt=false", "TrustServerCertificate=true",
	}
	if port != "" {
		parts = append(parts, "port="+port)
	}
	if sval(d, "auth_mode") == "sql" {
		parts = append(parts, "user id="+sval(d, "username"), "password="+strings.ReplaceAll(sval(d, "password"), ";", ";;"))
	}
	return strings.Join(parts, ";")
}

func sqlTest(d map[string]any) error {
	db, err := sql.Open("sqlserver", sqlConnString(d))
	if err != nil {
		return err
	}
	defer db.Close()
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	return db.PingContext(ctx)
}

func nullStr(v sql.NullString) any {
	if !v.Valid {
		return nil
	}
	return v.String
}

func nullTime(v sql.NullTime) any {
	if !v.Valid {
		return nil
	}
	return v.Time.UTC().Format(time.RFC3339)
}

func nullF(v sql.NullFloat64) any {
	if !v.Valid {
		return nil
	}
	return round1(v.Float64)
}

func collectSQLServer(d map[string]any) map[string]any {
	id := sval(d, "id")
	p := map[string]any{"type": "sqlserver", "instance_id": id, "agent_version": "mororo-agent " + Version}
	db, err := sql.Open("sqlserver", sqlConnString(d))
	if err != nil {
		return offline("sqlserver", "instance_id", id, "Falha de conexão: "+err.Error())
	}
	defer db.Close()
	db.SetMaxOpenConns(1)
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
	defer cancel()
	if err := db.PingContext(ctx); err != nil {
		return offline("sqlserver", "instance_id", id, "Falha de conexão: "+err.Error())
	}

	info := map[string]any{}
	var version, edition string
	var engine int
	var uptime int64
	if err := db.QueryRowContext(ctx, qInfo).Scan(&version, &edition, &engine, &uptime); err != nil {
		p["status"], p["last_error"] = "warning", "Erro na coleta: "+err.Error()
		return p
	}
	info["version"], info["edition"], info["uptime_seconds"] = version, edition, uptime
	isExpress := engine == 4 || strings.Contains(strings.ToLower(edition), "express")

	counters := func() map[string]float64 {
		out := map[string]float64{}
		rows, err := db.QueryContext(ctx, qCounters)
		if err != nil {
			return out
		}
		defer rows.Close()
		for rows.Next() {
			var n string
			var v float64
			if rows.Scan(&n, &v) == nil {
				if _, seen := out[n]; !seen {
					out[n] = v
				}
			}
		}
		return out
	}
	c1 := counters()
	time.Sleep(2 * time.Second)
	c2 := counters()
	info["ple_seconds"] = int64(c2["Page life expectancy"])
	if base := c2["Buffer cache hit ratio base"]; base > 0 {
		info["buffer_cache_hit_pct"] = round1(c2["Buffer cache hit ratio"] * 100 / base)
	}
	info["user_connections"] = int64(c2["User Connections"])
	br := round1((c2["Batch Requests/sec"] - c1["Batch Requests/sec"]) / 2)
	if br < 0 {
		br = 0
	}
	info["batch_requests_sec"] = br

	var cpu sql.NullFloat64
	if db.QueryRowContext(ctx, qCPU).Scan(&cpu) == nil && cpu.Valid {
		info["sql_cpu_pct"] = cpu.Float64
	}
	var memUsed, memMax sql.NullInt64
	if db.QueryRowContext(ctx, qMemory).Scan(&memUsed, &memMax) == nil {
		if memUsed.Valid {
			info["memory_used_mb"] = memUsed.Int64
		}
		if memMax.Valid {
			info["max_server_memory_mb"] = memMax.Int64
		}
	}
	var blocked, longest int64
	if db.QueryRowContext(ctx, qBlocking).Scan(&blocked, &longest) == nil {
		info["blocked_sessions"], info["longest_block_seconds"] = blocked, longest
	}

	long := []map[string]any{}
	if rows, err := db.QueryContext(ctx, qLong); err == nil {
		for rows.Next() {
			var sid, blk int64
			var secs int64
			var status, command string
			var dbn, wait, login, host, prog, text sql.NullString
			if rows.Scan(&sid, &secs, &status, &command, &dbn, &blk, &wait, &login, &host, &prog, &text) == nil {
				long = append(long, map[string]any{"session_id": sid, "seconds": secs, "status": status, "command": command,
					"db": nullStr(dbn), "blocking_session_id": blk, "wait_type": nullStr(wait), "login": nullStr(login),
					"host": nullStr(host), "program": nullStr(prog), "text": nullStr(text)})
			}
		}
		rows.Close()
	}
	p["long_running_queries"] = long

	logPct := map[string]float64{}
	if rows, err := db.QueryContext(ctx, "DBCC SQLPERF(LOGSPACE) WITH NO_INFOMSGS;"); err == nil {
		for rows.Next() {
			var name string
			var size, pct float64
			var st int
			if rows.Scan(&name, &size, &pct, &st) == nil {
				logPct[name] = round1(pct)
			}
		}
		rows.Close()
	}

	dbs := []map[string]any{}
	if rows, err := db.QueryContext(ctx, qDatabases); err == nil {
		for rows.Next() {
			var name, state, recovery, reuse string
			var dataMB, logMB sql.NullFloat64
			var full, diff, logb sql.NullTime
			if rows.Scan(&name, &state, &recovery, &reuse, &dataMB, &logMB, &full, &diff, &logb) != nil {
				continue
			}
			cover := full
			if diff.Valid && (!cover.Valid || diff.Time.After(cover.Time)) {
				cover = diff
			}
			e := map[string]any{"name": name, "state": state, "recovery": recovery, "log_reuse_wait": reuse,
				"data_mb": nullF(dataMB), "log_mb": nullF(logMB), "log_used_pct": nil,
				"last_full_backup": nullTime(cover), "last_full_only": nullTime(full), "last_diff_backup": nullTime(diff), "last_log_backup": nullTime(logb)}
			if v, ok := logPct[name]; ok {
				e["log_used_pct"] = v
			}
			dbs = append(dbs, e)
		}
		rows.Close()
	} else {
		p["status"], p["last_error"] = "warning", "Erro ao listar bancos: "+err.Error()
	}
	p["databases"] = dbs

	jobs := []map[string]any{}
	if !isExpress {
		var running int
		if db.QueryRowContext(ctx, qAgent).Scan(&running) == nil {
			info["agent_running"] = running == 1
		}
		if rows, err := db.QueryContext(ctx, qJobs); err == nil {
			for rows.Next() {
				var name, msg string
				var rd, rt int64
				if rows.Scan(&name, &rd, &rt, &msg) == nil {
					jobs = append(jobs, map[string]any{"name": name, "run_date": fmt.Sprint(rd), "run_time": fmt.Sprint(rt), "message": msg})
				}
			}
			rows.Close()
		}
	}
	p["failed_jobs"] = jobs

	waits := []map[string]any{}
	if rows, err := db.QueryContext(ctx, qWaits); err == nil {
		for rows.Next() {
			var wt string
			var ms, tasks int64
			if rows.Scan(&wt, &ms, &tasks) == nil {
				waits = append(waits, map[string]any{"wait_type": wt, "wait_time_ms": ms, "tasks": tasks})
			}
		}
		rows.Close()
	}
	p["top_waits"] = waits

	io := []map[string]any{}
	cur := map[string][4]int64{}
	if rows, err := db.QueryContext(ctx, qIO); err == nil {
		sqlIOState.Lock()
		prev := sqlIOState.m[id]
		if prev == nil {
			prev = loadSQLIOState(id)
		}
		for rows.Next() {
			var dbn, ft sql.NullString
			var v [4]int64
			if rows.Scan(&dbn, &ft, &v[0], &v[1], &v[2], &v[3]) != nil {
				continue
			}
			key := dbn.String + "|" + ft.String
			cur[key] = v
			pv, ok := prev[key]
			if !ok {
				continue
			}
			dr, drs, dw, dws := v[0]-pv[0], v[1]-pv[1], v[2]-pv[2], v[3]-pv[3]
			if dr < 0 || dw < 0 || dr+dw < 50 {
				continue
			}
			e := map[string]any{"db": dbn.String, "type": "data", "read_ms": nil, "write_ms": nil, "reads": dr, "writes": dw}
			if ft.String == "LOG" {
				e["type"] = "log"
			}
			if dr > 0 {
				e["read_ms"] = round1(float64(drs) / float64(dr))
			}
			if dw > 0 {
				e["write_ms"] = round1(float64(dws) / float64(dw))
			}
			io = append(io, e)
		}
		rows.Close()
		sqlIOState.m[id] = cur
		saveSQLIOState(id, cur)
		sqlIOState.Unlock()
	}
	p["io_latency"] = io
	p["info"] = info
	if p["status"] == nil {
		p["status"] = "online"
	}
	return p
}

func sqlIOPath(id string) string { return filepath.Join(stateDir(), "sqlio-"+id+".json") }

func loadSQLIOState(id string) map[string][4]int64 {
	out := map[string][4]int64{}
	if b, err := os.ReadFile(sqlIOPath(id)); err == nil {
		_ = json.Unmarshal(b, &out)
	}
	return out
}

func saveSQLIOState(id string, m map[string][4]int64) {
	b, _ := json.Marshal(m)
	_ = os.MkdirAll(stateDir(), 0o755)
	_ = os.WriteFile(sqlIOPath(id), b, 0o644)
}
