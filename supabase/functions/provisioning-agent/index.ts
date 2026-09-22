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
import { getEvolutionConfig, sendText } from "../_shared/whatsapp.ts";

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

const MINIMUM_AGENT_VERSION = "1.4.0";

const compareVersions = (current: string, minimum: string): number => {
  const currentParts = current.split(".").map((part) => Number.parseInt(part, 10) || 0);
  const minimumParts = minimum.split(".").map((part) => Number.parseInt(part, 10) || 0);
  const length = Math.max(currentParts.length, minimumParts.length);
  for (let index = 0; index < length; index += 1) {
    const difference = (currentParts[index] ?? 0) - (minimumParts[index] ?? 0);
    if (difference !== 0) return difference;
  }
  return 0;
};

interface ReportPayload {
  request_id?: string;
  client_id?: string;
  status?: string;
  steps?: unknown;
  log?: string;
  temporary_password?: string;
}

const notifyProvisioningCompleted = async (
  supabase: ReturnType<typeof createClient>,
  requestId: string,
  temporaryPassword: string,
): Promise<void> => {
  const { data: claimed } = await supabase
    .from("provisioning_requests")
    .update({ whatsapp_notification_status: "sending", whatsapp_notification_error: null })
    .eq("id", requestId)
    .in("whatsapp_notification_status", ["pending", "failed"])
    .select("id, client_id, full_name, username, email, operation, notify_on_completion")
    .maybeSingle();

  if (!claimed) return;

  try {
    const { data: settingsRows } = await supabase.from("system_settings").select("key, value");
    const settings: Record<string, string> = {};
    settingsRows?.forEach((row: { key: string; value: string | null }) => {
      settings[row.key] = row.value || "";
    });
    const config = await getEvolutionConfig(settings);
    if (!config.enabled || !config.baseUrl || !config.apiKey) {
      await supabase.from("provisioning_requests").update({
        whatsapp_notification_status: "skipped",
        whatsapp_notification_error: "WhatsApp desativado ou não configurado.",
      }).eq("id", requestId);
      return;
    }

    if (!claimed.notify_on_completion) {
      await supabase.from("provisioning_requests").update({
        whatsapp_notification_status: "skipped",
        whatsapp_notification_error: null,
      }).eq("id", requestId);
      return;
    }

    const { data: client, error: clientError } = await supabase
      .from("clients")
      .select("full_name, whatsapp_group_id")
      .eq("id", claimed.client_id)
      .maybeSingle();
    if (clientError) throw clientError;

    const { data: adminRoles } = await supabase.from("user_roles").select("user_id").eq("role", "admin");
    const adminIds = (adminRoles ?? []).map((role: { user_id: string }) => role.user_id);
    const { data: adminProfiles } = adminIds.length
      ? await supabase.from("profiles").select("phone").in("id", adminIds).eq("is_active", true)
      : { data: [] };

    const recipients = new Map<string, "admin" | "group">();
    adminProfiles?.forEach((profile: { phone: string | null }) => {
      if (profile.phone) recipients.set(profile.phone, "admin");
    });
    const groupId = client?.whatsapp_group_id?.trim();
    if (groupId) recipients.set(groupId, "group");

    const message = [
      claimed.operation === "reset_password"
        ? "✅ *Senha do usuário alterada no Active Directory*"
        : "✅ *Usuário criado no Active Directory*", "",
      `🏢 *Empresa:* ${client?.full_name || "Não informada"}`,
      `👤 *Nome:* ${claimed.full_name}`,
      `🔐 *Usuário:* ${claimed.username}`,
      claimed.email ? `✉️ *E-mail:* ${claimed.email}` : "",
      `🔑 *Senha provisória:* ${temporaryPassword}`, "",
      "⚠️ A troca da senha será exigida no primeiro acesso.",
    ].filter(Boolean).join("\n");

    let sent = 0;
    const failures: string[] = [];
    let groupSent = false;
    for (const [recipient, kind] of recipients) {
      try {
        if (await sendText(config, recipient, message)) {
          sent += 1;
          if (kind === "group") groupSent = true;
        } else failures.push(kind === "group" ? "grupo da empresa" : "administrador");
      } catch (error: unknown) {
        failures.push(kind === "group" ? "grupo da empresa" : "administrador");
        console.error("provisioning-agent: falha ao notificar destinatário", error);
      }
    }

    await supabase.from("provisioning_requests").update({
      whatsapp_notification_status: sent > 0 && groupSent ? "sent" : "failed",
      whatsapp_notified_at: sent > 0 && groupSent ? new Date().toISOString() : null,
      whatsapp_notification_error: !groupId
        ? "Grupo de WhatsApp não configurado para a empresa."
        : failures.length > 0
        ? `Falha ao enviar para: ${Array.from(new Set(failures)).join(", ")}.`
        : null,
    }).eq("id", requestId);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Falha desconhecida";
    console.error("provisioning-agent: erro na notificação de conclusão", error);
    await supabase.from("provisioning_requests").update({
      whatsapp_notification_status: "failed",
      whatsapp_notification_error: message.slice(0, 500),
    }).eq("id", requestId);
  }
};

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
    const clientId = String((body as Record<string, unknown>).client_id || "").trim();
    if (!/^[0-9a-fA-F-]{36}$/.test(clientId)) {
      return json({ error: "Empresa do agente ausente ou inválida" }, 400);
    }

    if (action === "claim") {
      const agentVersion = String((body as Record<string, unknown>).version || "0.0.0").trim();
      if (compareVersions(agentVersion, MINIMUM_AGENT_VERSION) < 0) {
        console.warn(
          `provisioning-agent: versão ${agentVersion || "desconhecida"} bloqueada em ${agentHost ?? "host desconhecido"}`,
        );
        return json({
          success: false,
          tasks: [],
          error: `Agente desatualizado. Instale a versão ${MINIMUM_AGENT_VERSION} ou superior.`,
          upgrade_required: true,
          minimum_version: MINIMUM_AGENT_VERSION,
        }, 409);
      }

      const { data: pending, error } = await supabase
        .from("provisioning_requests")
        .select("*")
        .eq("client_id", clientId)
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
          operation: request.operation || "create",
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
      const temporaryPassword = typeof payload.temporary_password === "string"
        ? payload.temporary_password
        : "";
      if (temporaryPassword && (temporaryPassword.length < 6 || temporaryPassword.length > 128)) {
        return json({ error: "Senha provisória inválida" }, 400);
      }

      const { error } = await supabase
        .from("provisioning_requests")
        .update({
          status,
          steps: payload.steps ?? [],
          log: typeof payload.log === "string" ? payload.log.slice(0, 20000) : null,
          finished_at: status === "running" ? null : new Date().toISOString(),
        })
        .eq("id", requestId)
        .eq("client_id", clientId);

      if (error) {
        console.error("report update error:", error);
        return json({ error: error.message }, 500);
      }

      if (status === "done" && temporaryPassword) {
        await notifyProvisioningCompleted(supabase, requestId, temporaryPassword);
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
