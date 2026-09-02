import { createClient } from "https://esm.sh/@supabase/supabase-js@2.58.0";
import { waFetch } from "../_shared/whatsapp.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-api-key",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const formatBytes = (bytes: number): string => {
  if (!bytes || bytes < 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
};

const formatDuration = (seconds: number | null | undefined): string => {
  if (seconds === null || seconds === undefined || !isFinite(seconds) || seconds < 0) return "—";
  const s = Math.round(seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}h ${m}min`;
  if (m > 0) return `${m}min ${sec}s`;
  return `${sec}s`;
};

const cleanPhone = (phone: string) => phone.replace(/[\s\-()+]/g, "");

/**
 * Sends a plain-text WhatsApp message through the Evolution API instance configured
 * in system_settings. Never throws — notification failures must not break the
 * backup telemetry pipeline.
 */
async function sendWhatsApp(
  supabase: ReturnType<typeof createClient>,
  phone: string | null | undefined,
  text: string,
): Promise<void> {
  try {
    if (!phone) return;
    const { data: settingsData } = await supabase.from("system_settings").select("key, value");
    const settings: Record<string, string> = {};
    (settingsData ?? []).forEach((s: { key: string; value: string | null }) => {
      settings[s.key] = s.value ?? "";
    });

    if (settings.whatsapp_enabled !== "true") return;
    const apiUrl = settings.whatsapp_api_url;
    const apiToken = settings.whatsapp_api_token;
    if (!apiUrl || !apiToken) return;

    const number = cleanPhone(phone);
    const resp = await waFetch(`${apiUrl.replace(/\/+$/, "")}/send/text`, {
      method: "POST",
      headers: { "Content-Type": "application/json", token: apiToken },
      body: JSON.stringify({ number, text, linkPreview: false }),
    });

    const ok = resp.ok;
    const errBody = ok ? null : await resp.text();
    if (!ok) console.error(`Backup WhatsApp failed [${resp.status}]: ${errBody}`);

    await supabase.from("whatsapp_notification_logs").insert({
      notification_type: "backup_alert",
      recipient_phone: number,
      message_preview: text.slice(0, 300),
      status: ok ? "sent" : "failed",
      error_message: errBody ? `${resp.status}: ${errBody}`.slice(0, 500) : null,
    });
  } catch (err) {
    console.error("sendWhatsApp error", err);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const apiKey = req.headers.get("x-api-key") ?? "";
  if (!apiKey || apiKey.length < 16) return json({ error: "Missing x-api-key" }, 401);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data: agent } = await supabase
    .from("backup_agents")
    .select("id, name, active")
    .eq("api_key", apiKey)
    .maybeSingle();

  if (!agent || !agent.active) return json({ error: "Invalid agent key" }, 401);

  let payload: Record<string, unknown>;
  try {
    payload = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const action = String(payload.action ?? "");
  const runId = payload.run_id ? String(payload.run_id) : null;

  await supabase
    .from("backup_agents")
    .update({ last_seen_at: new Date().toISOString(), hostname: payload.hostname ?? null })
    .eq("id", agent.id);

  const num = (v: unknown, fallback = 0) => (typeof v === "number" && isFinite(v) ? v : fallback);
  const numOrNull = (v: unknown) => (typeof v === "number" && isFinite(v) ? Math.round(v) : null);
  const str = (v: unknown, max = 500) => (typeof v === "string" ? v.slice(0, max) : null);

  /** Loads the job linked to a run (if any) so we know the alert preferences. */
  const loadJobForRun = async (id: string) => {
    const { data: run } = await supabase
      .from("backup_runs")
      .select("job_id, source_dir, dest_dir, backup_type, last_notified_pct, started_at")
      .eq("id", id)
      .maybeSingle();
    if (!run) return { run: null, job: null };
    if (!run.job_id) return { run, job: null };
    const { data: job } = await supabase
      .from("backup_jobs")
      .select(
        "name, notify_phone, notify_on_start, notify_on_progress, notify_on_finish, notify_on_error, progress_step_pct",
      )
      .eq("id", run.job_id)
      .maybeSingle();
    return { run, job };
  };

  try {
    // Agent pulls its configured local backup jobs
    if (action === "jobs") {
      const { data, error } = await supabase
        .from("backup_jobs")
        .select("id, name, job_type, source_path, dest_path, mirror, threads, schedule_cron, is_active")
        .eq("agent_id", agent.id)
        .eq("is_active", true)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return json({ jobs: data ?? [] });
    }

    if (action === "start") {
      const jobId = payload.job_id ? String(payload.job_id) : null;
      const backupType = ["local", "cloud"].includes(String(payload.backup_type))
        ? String(payload.backup_type)
        : "cloud";

      const { data, error } = await supabase
        .from("backup_runs")
        .insert({
          agent_id: agent.id,
          job_id: jobId,
          backup_type: backupType,
          status: "running",
          source_dir: str(payload.source_dir),
          dest_dir: str(payload.dest_dir),
          providers: str(payload.providers, 100),
          total_files: num(payload.total_files),
        })
        .select("id")
        .single();
      if (error) throw error;

      if (jobId) {
        const { data: job } = await supabase
          .from("backup_jobs")
          .select("name, notify_phone, notify_on_start")
          .eq("id", jobId)
          .maybeSingle();
        if (job?.notify_on_start) {
          await sendWhatsApp(
            supabase,
            job.notify_phone,
            [
              "🚀 *Backup iniciado*",
              "",
              `🗂️ *Tarefa:* ${job.name}`,
              `🖥️ *Servidor:* ${agent.name}`,
              `📁 *Origem:* ${payload.source_dir ?? "—"}`,
              `📥 *Destino:* ${payload.dest_dir ?? "—"}`,
              `📊 *Arquivos:* ${num(payload.total_files)}`,
              "",
              `🕒 ${new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}`,
            ].join("\n"),
          );
        }
      }

      return json({ run_id: data.id });
    }

    if (!runId) return json({ error: "run_id is required" }, 400);

    if (action === "progress") {
      const processed = num(payload.processed_files);
      const total = num(payload.total_files);
      const etaSeconds = numOrNull(payload.eta_seconds);
      const speedBps = numOrNull(payload.speed_bps);

      const updatePayload: Record<string, unknown> = {
        processed_files: processed,
        uploaded: num(payload.uploaded),
        updated: num(payload.updated),
        skipped: num(payload.skipped),
        failed: num(payload.failed),
        bytes: num(payload.bytes),
        current_file: str(payload.current_file),
        speed_bps: speedBps,
        eta_seconds: etaSeconds,
      };
      if (total > 0) updatePayload.total_files = total;

      const { error } = await supabase
        .from("backup_runs")
        .update(updatePayload)
        .eq("id", runId)
        .eq("agent_id", agent.id);
      if (error) throw error;

      // Threshold-based progress alerts (e.g. every 25%)
      const { run, job } = await loadJobForRun(runId);
      if (run && job?.notify_on_progress && job.progress_step_pct > 0) {
        const totalForPct = total || run.total_files || 0;
        const pct = totalForPct > 0 ? Math.floor((processed / totalForPct) * 100) : 0;
        const step = job.progress_step_pct;
        const milestone = Math.floor(pct / step) * step;
        if (milestone > 0 && milestone < 100 && milestone > (run.last_notified_pct ?? 0)) {
          await supabase.from("backup_runs").update({ last_notified_pct: milestone }).eq("id", runId);
          await sendWhatsApp(
            supabase,
            job.notify_phone,
            [
              `📈 *Backup em andamento — ${milestone}%*`,
              "",
              `🗂️ *Tarefa:* ${job.name}`,
              `📊 *Arquivos:* ${processed}/${totalForPct}`,
              `💾 *Volume:* ${formatBytes(num(payload.bytes))}`,
              speedBps ? `⚡ *Velocidade:* ${formatBytes(speedBps)}/s` : "",
              `⏳ *Tempo estimado:* ${formatDuration(etaSeconds)}`,
            ]
              .filter(Boolean)
              .join("\n"),
          );
        }
      }

      return json({ ok: true });
    }

    if (action === "log") {
      const level = ["info", "warn", "error"].includes(String(payload.level))
        ? String(payload.level)
        : "info";
      const { error } = await supabase.from("backup_run_logs").insert({
        run_id: runId,
        level,
        message: str(payload.message, 2000) ?? "",
      });
      if (error) throw error;

      if (level === "error") {
        const { job } = await loadJobForRun(runId);
        if (job?.notify_on_error) {
          await sendWhatsApp(
            supabase,
            job.notify_phone,
            ["⚠️ *Erro no backup*", "", `🗂️ *Tarefa:* ${job.name}`, "", str(payload.message, 500) ?? ""].join("\n"),
          );
        }
      }
      return json({ ok: true });
    }

    if (action === "finish") {
      const status = ["success", "partial", "failed"].includes(String(payload.status))
        ? String(payload.status)
        : "success";
      const finishedAt = new Date();
      const { error } = await supabase
        .from("backup_runs")
        .update({
          status,
          processed_files: num(payload.processed_files),
          uploaded: num(payload.uploaded),
          updated: num(payload.updated),
          skipped: num(payload.skipped),
          failed: num(payload.failed),
          bytes: num(payload.bytes),
          current_file: null,
          eta_seconds: 0,
          speed_bps: numOrNull(payload.speed_bps),
          error_message: str(payload.error_message, 2000),
          finished_at: finishedAt.toISOString(),
        })
        .eq("id", runId)
        .eq("agent_id", agent.id);
      if (error) throw error;

      const { run, job } = await loadJobForRun(runId);
      const shouldNotify = status === "failed" ? job?.notify_on_error : job?.notify_on_finish;
      if (job && shouldNotify) {
        const elapsed = run?.started_at
          ? (finishedAt.getTime() - new Date(run.started_at).getTime()) / 1000
          : null;
        const icon = status === "success" ? "✅" : status === "partial" ? "🟡" : "❌";
        const label = status === "success" ? "concluído" : status === "partial" ? "concluído com avisos" : "falhou";
        await sendWhatsApp(
          supabase,
          job.notify_phone,
          [
            `${icon} *Backup ${label}*`,
            "",
            `🗂️ *Tarefa:* ${job.name}`,
            `🖥️ *Servidor:* ${agent.name}`,
            `📁 *Origem:* ${run?.source_dir ?? "—"}`,
            `📥 *Destino:* ${run?.dest_dir ?? "—"}`,
            `📊 *Enviados:* ${num(payload.uploaded) + num(payload.updated)} · *Pulados:* ${num(payload.skipped)} · *Falhas:* ${num(payload.failed)}`,
            `💾 *Volume:* ${formatBytes(num(payload.bytes))}`,
            `⏱️ *Duração:* ${formatDuration(elapsed)}`,
            payload.error_message ? `\n⚠️ ${str(payload.error_message, 400)}` : "",
          ]
            .filter(Boolean)
            .join("\n"),
        );
      }

      return json({ ok: true });
    }

    return json({ error: "Unknown action" }, 400);
  } catch (err) {
    console.error("backup-report error", err);
    return json({ error: "Internal error" }, 500);
  }
});
