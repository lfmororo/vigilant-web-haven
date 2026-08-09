#!/usr/bin/env node
/**
 * local-backup.js — Backup LOCAL / REDE com telemetria e alertas WhatsApp.
 *
 * Copia uma pasta de origem para uma pasta de destino (disco local, HD externo
 * ou caminho de rede UNC \\servidor\share / ponto de montagem SMB-NFS), usando
 * várias cópias em paralelo para aproveitar o máximo de banda disponível.
 *
 * Reporta início, progresso, tempo estimado, erros e término para o painel
 * "Backup" do sistema, que dispara as notificações via WhatsApp.
 *
 * Uso:
 *   node local-backup.js --source "D:\\Dados" --dest "\\\\NAS\\backup\\Dados" [opções]
 *   node local-backup.js --job <id-da-tarefa>       (busca a config no painel)
 *   node local-backup.js --list-jobs
 *
 * Opções:
 *   --source <caminho>     Pasta de origem
 *   --dest <caminho>       Pasta de destino (aceita rede)
 *   --threads <n>          Cópias simultâneas (padrão 8; use 16-32 em rede 1Gb+)
 *   --mirror               Remove no destino arquivos que não existem na origem
 *   --exclude <padrões>    Lista separada por vírgula (ex.: "*.tmp,node_modules")
 *   --dry-run              Simula, sem escrever nada
 *
 * Variáveis de ambiente (telemetria — opcional, mas necessária p/ alertas):
 *   BACKUP_API_URL   https://<projeto>.functions.supabase.co/functions/v1/backup-report
 *   BACKUP_API_KEY   chave do agente gerada no painel
 *
 * Requer apenas Node.js 18+ (sem dependências externas).
 */

"use strict";

const fs = require("fs");
const fsp = fs.promises;
const path = require("path");
const os = require("os");

// ---------------------------------------------------------------- utilidades

const API_URL = process.env.BACKUP_API_URL || "";
const API_KEY = process.env.BACKUP_API_KEY || "";

const log = (...args) => console.log(`[${new Date().toISOString()}]`, ...args);

function parseArgs(argv) {
  const args = { threads: 8, mirror: false, dryRun: false, exclude: [] };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    switch (a) {
      case "--source":
      case "--dir":
        args.source = argv[++i];
        break;
      case "--dest":
        args.dest = argv[++i];
        break;
      case "--threads":
        args.threads = Math.max(1, Math.min(64, parseInt(argv[++i], 10) || 8));
        break;
      case "--mirror":
        args.mirror = true;
        break;
      case "--exclude":
        args.exclude = String(argv[++i] || "")
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);
        break;
      case "--dry-run":
        args.dryRun = true;
        break;
      case "--job":
        args.job = argv[++i];
        break;
      case "--list-jobs":
        args.listJobs = true;
        break;
      case "--help":
      case "-h":
        args.help = true;
        break;
      default:
        if (a.startsWith("--")) console.warn(`Opção desconhecida ignorada: ${a}`);
    }
  }
  return args;
}

function formatBytes(bytes) {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}

function matchesExclude(name, patterns) {
  return patterns.some((p) => {
    const rx = new RegExp("^" + p.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\?/g, ".") + "$", "i");
    return rx.test(name);
  });
}

// ------------------------------------------------------------- API telemetria

async function api(action, body = {}) {
  if (!API_URL || !API_KEY) return null;
  try {
    const resp = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": API_KEY },
      body: JSON.stringify({ action, hostname: os.hostname(), ...body }),
    });
    if (!resp.ok) {
      console.error(`Telemetria falhou [${resp.status}]: ${await resp.text()}`);
      return null;
    }
    return await resp.json();
  } catch (err) {
    console.error("Telemetria indisponível:", err.message);
    return null;
  }
}

// ------------------------------------------------------------------ varredura

async function scan(root, exclude) {
  const files = [];
  let totalBytes = 0;

  async function walk(dir, rel) {
    let entries;
    try {
      entries = await fsp.readdir(dir, { withFileTypes: true });
    } catch (err) {
      console.error(`Não foi possível ler ${dir}: ${err.message}`);
      return;
    }
    for (const entry of entries) {
      if (matchesExclude(entry.name, exclude)) continue;
      const full = path.join(dir, entry.name);
      const relPath = rel ? path.join(rel, entry.name) : entry.name;
      if (entry.isDirectory()) {
        await walk(full, relPath);
      } else if (entry.isFile()) {
        try {
          const st = await fsp.stat(full);
          files.push({ rel: relPath, size: st.size, mtimeMs: st.mtimeMs });
          totalBytes += st.size;
        } catch {
          /* arquivo removido durante a varredura — ignorar */
        }
      }
    }
  }

  await walk(root, "");
  return { files, totalBytes };
}

// -------------------------------------------------------------------- backup

async function runBackup(cfg) {
  const stats = { uploaded: 0, updated: 0, skipped: 0, failed: 0, bytes: 0, processed: 0 };
  const startedAt = Date.now();

  const source = path.resolve(cfg.source);
  const dest = cfg.dest; // pode ser UNC — não resolver para não quebrar \\server\share

  if (!fs.existsSync(source)) throw new Error(`Origem inexistente: ${source}`);
  if (!cfg.dryRun) await fsp.mkdir(dest, { recursive: true });

  log(`Varrendo origem: ${source}`);
  const { files, totalBytes } = await scan(source, cfg.exclude);
  log(`${files.length} arquivos · ${formatBytes(totalBytes)}`);

  const started = await api("start", {
    job_id: cfg.jobId || null,
    backup_type: "local",
    source_dir: source,
    dest_dir: dest,
    providers: "local",
    total_files: files.length,
  });
  const runId = started?.run_id || null;

  const report = (action, body) => (runId ? api(action, { run_id: runId, ...body }) : Promise.resolve(null));

  let lastReport = 0;
  let currentFile = "";

  const sendProgress = async (force = false) => {
    const now = Date.now();
    if (!force && now - lastReport < 4000) return;
    lastReport = now;
    const elapsed = (now - startedAt) / 1000;
    const speed = elapsed > 0 ? stats.bytes / elapsed : 0;
    const remainingBytes = Math.max(0, totalBytes - stats.bytes);
    const eta = speed > 0 ? remainingBytes / speed : null;
    await report("progress", {
      processed_files: stats.processed,
      total_files: files.length,
      uploaded: stats.uploaded,
      updated: stats.updated,
      skipped: stats.skipped,
      failed: stats.failed,
      bytes: stats.bytes,
      current_file: currentFile,
      speed_bps: Math.round(speed),
      eta_seconds: eta === null ? null : Math.round(eta),
    });
  };

  // pool de cópias paralelas — maximiza o uso da banda em destinos de rede
  let index = 0;
  const worker = async () => {
    while (index < files.length) {
      const file = files[index++];
      const src = path.join(source, file.rel);
      const dst = path.join(dest, file.rel);
      currentFile = file.rel;
      try {
        let needsCopy = true;
        let isUpdate = false;
        try {
          const dstStat = await fsp.stat(dst);
          isUpdate = true;
          // incremental: mesmo tamanho e destino não mais antigo → pula
          if (dstStat.size === file.size && dstStat.mtimeMs >= file.mtimeMs - 2000) needsCopy = false;
        } catch {
          /* destino não existe */
        }

        if (!needsCopy) {
          stats.skipped++;
        } else if (cfg.dryRun) {
          stats.uploaded++;
          stats.bytes += file.size;
        } else {
          await fsp.mkdir(path.dirname(dst), { recursive: true });
          await fsp.copyFile(src, dst);
          await fsp.utimes(dst, new Date(), new Date(file.mtimeMs));
          if (isUpdate) stats.updated++;
          else stats.uploaded++;
          stats.bytes += file.size;
        }
      } catch (err) {
        stats.failed++;
        const msg = `Falha ao copiar ${file.rel}: ${err.message}`;
        console.error(msg);
        await report("log", { level: "error", message: msg });
      } finally {
        stats.processed++;
        await sendProgress();
      }
    }
  };

  await Promise.all(Array.from({ length: cfg.threads }, worker));

  // espelhamento: remove no destino o que não existe mais na origem
  if (cfg.mirror && !cfg.dryRun) {
    const keep = new Set(files.map((f) => f.rel));
    const { files: destFiles } = await scan(dest, cfg.exclude);
    for (const f of destFiles) {
      if (!keep.has(f.rel)) {
        try {
          await fsp.unlink(path.join(dest, f.rel));
          log(`Removido no destino (mirror): ${f.rel}`);
        } catch (err) {
          console.error(`Falha ao remover ${f.rel}: ${err.message}`);
        }
      }
    }
  }

  await sendProgress(true);

  const elapsed = (Date.now() - startedAt) / 1000;
  const status = stats.failed === 0 ? "success" : stats.processed > stats.failed ? "partial" : "failed";
  await report("finish", {
    status,
    processed_files: stats.processed,
    uploaded: stats.uploaded,
    updated: stats.updated,
    skipped: stats.skipped,
    failed: stats.failed,
    bytes: stats.bytes,
    speed_bps: elapsed > 0 ? Math.round(stats.bytes / elapsed) : 0,
    error_message: stats.failed ? `${stats.failed} arquivo(s) com falha` : null,
  });

  log(
    `Concluído em ${elapsed.toFixed(1)}s · ${stats.uploaded} novos · ${stats.updated} atualizados · ` +
      `${stats.skipped} inalterados · ${stats.failed} falhas · ${formatBytes(stats.bytes)}`,
  );
  return status;
}

// ---------------------------------------------------------------------- main

(async () => {
  const args = parseArgs(process.argv);

  if (args.help) {
    console.log(fs.readFileSync(__filename, "utf8").split("*/")[0]);
    process.exit(0);
  }

  if (args.listJobs) {
    const res = await api("jobs");
    if (!res) {
      console.error("Configure BACKUP_API_URL e BACKUP_API_KEY para listar as tarefas.");
      process.exit(1);
    }
    console.table(res.jobs);
    process.exit(0);
  }

  let cfg = {
    source: args.source,
    dest: args.dest,
    threads: args.threads,
    mirror: args.mirror,
    exclude: args.exclude,
    dryRun: args.dryRun,
    jobId: null,
  };

  if (args.job) {
    const res = await api("jobs");
    const job = res?.jobs?.find((j) => j.id === args.job || j.name === args.job);
    if (!job) {
      console.error(`Tarefa "${args.job}" não encontrada para este agente.`);
      process.exit(1);
    }
    cfg = {
      ...cfg,
      jobId: job.id,
      source: job.source_path,
      dest: job.dest_path,
      threads: job.threads || cfg.threads,
      mirror: !!job.mirror,
    };
    log(`Tarefa: ${job.name}`);
  }

  if (!cfg.source || !cfg.dest) {
    console.error('Informe --source e --dest (ou --job <id>). Use --help para detalhes.');
    process.exit(1);
  }

  try {
    const status = await runBackup(cfg);
    process.exit(status === "failed" ? 1 : 0);
  } catch (err) {
    console.error("Erro fatal:", err.message);
    await api("log", { level: "error", message: `Erro fatal: ${err.message}` });
    process.exit(1);
  }
})();
