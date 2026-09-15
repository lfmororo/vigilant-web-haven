/**
 * Ponte entre o painel e o agente instalado no controlador de domínio.
 *
 * Ações:
 *  - claim:  o agente busca pedidos pendentes (retorna o modelo do setor e a senha inicial,
 *            que é apagada do banco imediatamente após a entrega).
 *  - report: o agente devolve o resultado da execução (etapas + log).
 *
 * Autenticação: header `x-agent-key` comparado com system_settings.provisioning_agent_key.
 */
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const responseHeaders = {
  ...corsHeaders,
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-agent-key",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...responseHeaders, "Content-Type": "application/json" },
  });

interface ReportPayload {
  request_id?: string;
  status?: string;
  steps?: unknown;
  log?: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: responseHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    const action = String((body as Record<string, unknown>).action || "claim");
    const agentKey = String(
      req.headers.get("x-agent-key") || (body as Record<string, unknown>).agent_key || "",
    ).trim();

    if (!agentKey) return json({ error: "Chave do agente ausente" }, 401);

    const { data: setting } = await supabase
      .from("system_settings")
      .select("value")
      .eq("key", "provisioning_agent_key")
      .maybeSingle();

    if (!setting?.value || setting.value !== agentKey) {
      console.warn("provisioning-agent: chave inválida");
      return json({ error: "Chave do agente inválida" }, 401);
    }

    const agentHost = String((body as Record<string, unknown>).host || "").trim() || null;

    if (action === "claim") {
      const { data: pending, error } = await supabase
        .from("provisioning_requests")
        .select("*")
        .eq("status", "pending")
        .order("created_at", { ascending: true })
        .limit(5);

      if (error) {
        console.error("claim select error:", error);
        return json({ error: error.message }, 500);
      }

      const tasks: Record<string, unknown>[] = [];

      for (const request of pending ?? []) {
        if (!/^[a-zA-Z0-9._-]{2,64}$/.test(request.username)) {
          await supabase.from("provisioning_requests").update({
            status: "error",
            log: "Login inválido: use somente letras, números, ponto, hífen e sublinhado.",
            initial_password: null,
            finished_at: new Date().toISOString(),
          }).eq("id", request.id).eq("status", "pending");
          continue;
        }
        // Busca o modelo do setor; se não houver, tenta o modelo geral do cliente.
        const { data: templates } = await supabase
          .from("provisioning_templates")
          .select("*")
          .eq("client_id", request.client_id);

        const template =
          (templates ?? []).find((t) => t.sector_id === request.sector_id) ??
          (templates ?? []).find((t) => !t.sector_id) ??
          null;

        const { data: claimed, error: claimError } = await supabase
          .from("provisioning_requests")
          .update({
            status: "running",
            claimed_at: new Date().toISOString(),
            agent_key: agentHost,
            initial_password: null,
          })
          .eq("id", request.id)
          .eq("status", "pending")
          .select("id")
          .maybeSingle();

        if (claimError || !claimed) {
          console.error("claim update error:", claimError);
          continue;
        }

        tasks.push({
          id: request.id,
          full_name: request.full_name,
          username: request.username,
          email: request.email,
          phone: request.phone,
          job_title: request.job_title,
          password: request.initial_password,
          template: template
            ? {
                ad_ou: template.ad_ou,
                ad_groups: template.ad_groups ?? [],
                base_path: template.base_path,
                subfolders: template.subfolders ?? [],
                home_drive: template.home_drive,
              }
            : null,
        });
      }

      return json({ success: true, tasks });
    }

    if (action === "report") {
      const payload = body as ReportPayload;
      const requestId = String(payload.request_id || "").trim();
      if (!requestId) return json({ error: "request_id é obrigatório" }, 400);

      const allowed = ["done", "error", "partial", "running"];
      const status = allowed.includes(String(payload.status))
        ? String(payload.status)
        : "error";

      const { error } = await supabase
        .from("provisioning_requests")
        .update({
          status,
          steps: payload.steps ?? [],
          log: typeof payload.log === "string" ? payload.log.slice(0, 20000) : null,
          finished_at: status === "running" ? null : new Date().toISOString(),
        })
        .eq("id", requestId);

      if (error) {
        console.error("report update error:", error);
        return json({ error: error.message }, 500);
      }

      return json({ success: true });
    }

    return json({ error: "Ação desconhecida" }, 400);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Erro desconhecido";
    console.error("provisioning-agent erro:", err);
    return json({ error: message }, 500);
  }
});
