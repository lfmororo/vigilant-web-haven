import { createClient } from "npm:@supabase/supabase-js@2";

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
  const { error } = await supabase.from("ad_diagnostic_reports").insert({
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
  if (error) return json(500, { error: error.message });
  return json(200, { success: true });
});
