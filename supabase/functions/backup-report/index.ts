import { createClient } from "https://esm.sh/@supabase/supabase-js@2.58.0";

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
    .select("id, active")
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
  const str = (v: unknown, max = 500) =>
    typeof v === "string" ? v.slice(0, max) : null;

  try {
    if (action === "start") {
      const { data, error } = await supabase
        .from("backup_runs")
        .insert({
          agent_id: agent.id,
          status: "running",
          source_dir: str(payload.source_dir),
          providers: str(payload.providers, 100),
          total_files: num(payload.total_files),
        })
        .select("id")
        .single();
      if (error) throw error;
      return json({ run_id: data.id });
    }

    if (!runId) return json({ error: "run_id is required" }, 400);

    if (action === "progress") {
      const { error } = await supabase
        .from("backup_runs")
        .update({
          processed_files: num(payload.processed_files),
          uploaded: num(payload.uploaded),
          updated: num(payload.updated),
          skipped: num(payload.skipped),
          failed: num(payload.failed),
          bytes: num(payload.bytes),
          current_file: str(payload.current_file),
        })
        .eq("id", runId)
        .eq("agent_id", agent.id);
      if (error) throw error;
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
      return json({ ok: true });
    }

    if (action === "finish") {
      const status = ["success", "partial", "failed"].includes(String(payload.status))
        ? String(payload.status)
        : "success";
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
          error_message: str(payload.error_message, 2000),
          finished_at: new Date().toISOString(),
        })
        .eq("id", runId)
        .eq("agent_id", agent.id);
      if (error) throw error;
      return json({ ok: true });
    }

    return json({ error: "Unknown action" }, 400);
  } catch (err) {
    console.error("backup-report error", err);
    return json({ error: "Internal error" }, 500);
  }
});
