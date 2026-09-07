/**
 * Recebe o "sinal de vida" dos agentes coletores com a versão instalada.
 * Cada agente envia: { agent_type, version, host?, name?, agent_key? }
 */
import { createClient } from "npm:@supabase/supabase-js@2";
import { AGENT_VERSIONS, isOutdated } from "../_shared/agentVersions.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const agentType = String(body.agent_type || "").trim();
    if (!agentType) return json({ error: "agent_type é obrigatório" }, 400);

    const host = String(body.host || "").trim() || null;
    const agentKey = String(body.agent_key || host || "default").trim();
    const version = String(body.version || "").trim() || null;

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { error } = await supabase.from("collector_agent_status").upsert(
      {
        agent_type: agentType,
        agent_key: agentKey,
        name: String(body.name || AGENT_VERSIONS[agentType]?.label || agentType),
        version,
        host,
        last_seen_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "agent_type,agent_key" },
    );

    if (error) {
      console.error("agent-heartbeat upsert error:", error);
      return json({ error: error.message }, 500);
    }

    const expected = AGENT_VERSIONS[agentType]?.version ?? null;
    return json({
      success: true,
      latest_version: expected,
      outdated: expected ? isOutdated(version, expected) : false,
    });
  } catch (err) {
    console.error("agent-heartbeat error:", err);
    return json({ error: String(err) }, 500);
  }
});
