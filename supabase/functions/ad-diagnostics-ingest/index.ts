import { createClient } from "npm:@supabase/supabase-js@2";
import { getEvolutionConfig, sendText } from "../_shared/whatsapp.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const UUID = /^[0-9a-f-]{36}$/i;
const STATUS = new Set(["ok", "warning", "error", "fixed"]);

/** Recebe o relatório dos scripts de diagnóstico (servidor AD e estações). */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "method not allowed" });

  let body: any;
  try { body = await req.json(); } catch { return json(400, { error: "JSON inválido" }); }

  const hostname = String(body?.hostname || "").trim().substring(0, 200);
  const scope = body?.scope === "server" ? "server" : "workstation";
  if (!hostname) return json(400, { error: "hostname obrigatório" });
  if (!Array.isArray(body?.findings)) return json(400, { error: "findings deve ser lista" });

  const findings = body.findings.slice(0, 200).map((f: any) => ({
    check: String(f?.check || "—").substring(0, 200),
    status: STATUS.has(String(f?.status)) ? String(f.status) : "warning",
    detail: String(f?.detail || "").substring(0, 2000),
    solution: String(f?.solution || "").substring(0, 2000),
  }));
  const count = (s: string) => findings.filter((f: any) => f.status === s).length;
  const clientId = UUID.test(String(body?.client_id || "")) ? String(body.client_id) : null;

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  // Problemas graves: o aviso sai IMEDIATAMENTE, em paralelo ao salvamento,
  // e é enviado mesmo que o salvamento do relatório falhe.
  const errors = findings.filter((f: any) => f.status === "error");
  const notify = async () => {
    if (errors.length === 0) return;
    try {
      const [cfg, clientRes, rolesRes] = await Promise.all([
        getEvolutionConfig(),
        clientId
          ? supabase.from("clients").select("full_name, whatsapp_group_id").eq("id", clientId).maybeSingle()
          : Promise.resolve({ data: null }),
        supabase.from("user_roles").select("user_id").eq("role", "admin"),
      ]);
      const companyName = (clientRes as any)?.data?.full_name || "Sem empresa";
      const adminIds = (rolesRes.data || []).map((r: any) => r.user_id);
      if (!adminIds.length) return;
      const { data: profiles } = await supabase.from("profiles").select("phone").in("id", adminIds);
      const phones = new Set<string>(
        (profiles || []).map((p: any) => String(p.phone || "").replace(/[\s\-()+]/g, "")).filter((p: string) => p.length >= 10),
      );
      const text = [
        `🚨 *Diagnóstico com ${errors.length} problema(s) grave(s)*`,
        `🖥️ ${hostname} (${scope === "server" ? "Servidor" : "Estação"}) — ${companyName}`,
        `📅 ${new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}`,
        "",
        ...errors.slice(0, 8).map((f: any) => `• *${f.check}*: ${f.detail}`),
        errors.length > 8 ? `… e mais ${errors.length - 8} problema(s).` : "",
        "",
        "Abra Servidores > Diagnósticos para ver as soluções sugeridas.",
      ].filter(Boolean).join("\n");
      // Envia para todos os administradores ao mesmo tempo; 1 nova tentativa por número.
      await Promise.all([...phones].map(async (phone) => {
        try { await sendText(cfg, phone, text); }
        catch { try { await sendText(cfg, phone, text); } catch (e) { console.error("notify fail", phone.slice(-4), e); } }
      }));
    } catch (err) {
      console.error("diagnostics notify error:", err);
    }
  };

  const save = supabase.from("ad_diagnostic_reports").insert({
    client_id: clientId,
    scope,
    hostname,
    domain: body?.domain ? String(body.domain).substring(0, 200) : null,
    ok_count: count("ok"),
    warning_count: count("warning"),
    error_count: count("error"),
    fixed_count: count("fixed"),
    findings,
  });

  const [{ error }] = await Promise.all([save, notify()]);
  if (error) return json(500, { error: error.message, alert_sent: errors.length > 0 });
  return json(200, { success: true });
});
