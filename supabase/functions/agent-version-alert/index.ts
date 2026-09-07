/**
 * Alerta diário (08:00 BRT) por WhatsApp quando algum agente coletor estiver
 * rodando uma versão anterior à publicada no painel.
 */
import { createClient } from "npm:@supabase/supabase-js@2";
import { getEvolutionConfig, waFetch } from "../_shared/whatsapp.ts";
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

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    const { data: agents } = await supabase
      .from("collector_agent_status")
      .select("agent_type, agent_key, name, version, host, last_seen_at")
      .order("agent_type");

    const outdated = (agents || []).filter((a: any) => {
      const expected = AGENT_VERSIONS[a.agent_type]?.version;
      return expected ? isOutdated(a.version, expected) : false;
    });

    if (outdated.length === 0) {
      return json({ success: true, outdated: 0 });
    }

    const cfg = await getEvolutionConfig();
    if (!cfg.enabled || !cfg.baseUrl || !cfg.apiKey) {
      return json({ success: true, outdated: outdated.length, whatsapp_disabled: true });
    }

    const lines: string[] = [
      "⚠️ *AGENTES COLETORES DESATUALIZADOS*",
      "",
      `${outdated.length} agente(s) estão rodando uma versão antiga:`,
      "",
    ];
    for (const a of outdated) {
      const expected = AGENT_VERSIONS[a.agent_type]?.version ?? "—";
      const label = AGENT_VERSIONS[a.agent_type]?.label ?? a.agent_type;
      lines.push(`🔸 *${label}*`);
      lines.push(`   💻 Máquina: ${a.host || a.agent_key}`);
      lines.push(`   📦 Instalada: ${a.version || "desconhecida"} → Atual: ${expected}`);
      lines.push("");
    }
    lines.push("⚙️ Baixe o pacote atualizado no painel e reinstale o serviço.");
    lines.push("_🤖 Aviso automático diário do monitoramento_");
    const text = lines.join("\n");

    const { data: adminRoles } = await supabase
      .from("user_roles")
      .select("user_id")
      .eq("role", "admin");
    const ids = (adminRoles || []).map((r: any) => r.user_id);
    const { data: profiles } = await supabase
      .from("profiles")
      .select("phone")
      .in("id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"])
      .not("phone", "is", null);

    const phones = [
      ...new Set(
        (profiles || [])
          .map((p: any) => String(p.phone || "").replace(/[\s\-()+]/g, ""))
          .filter((p: string) => p.length >= 10),
      ),
    ];

    let sent = 0;
    for (const number of phones) {
      try {
        const res = await waFetch(`${cfg.baseUrl}/send/text`, {
          method: "POST",
          headers: { "Content-Type": "application/json", token: cfg.apiKey },
          body: JSON.stringify({ number, text, linkPreview: false }),
        });
        if (res.ok) sent++;
        await supabase.from("whatsapp_notification_logs").insert({
          notification_type: "agent_version_alert",
          recipient_phone: number,
          message_preview: text.substring(0, 200),
          status: res.ok ? "sent" : "failed",
          error_message: res.ok ? null : await res.text(),
        });
      } catch (err: any) {
        await supabase.from("whatsapp_notification_logs").insert({
          notification_type: "agent_version_alert",
          recipient_phone: number,
          message_preview: text.substring(0, 200),
          status: "failed",
          error_message: err.message,
        });
      }
    }

    return json({ success: true, outdated: outdated.length, whatsapp_sent: sent });
  } catch (err: any) {
    console.error("agent-version-alert error:", err);
    return json({ error: err.message }, 500);
  }
});
