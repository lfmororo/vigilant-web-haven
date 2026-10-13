import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const GATEWAY_URL = "https://connector-gateway.lovable.dev/parallel";
const UUID = /^[0-9a-f-]{36}$/i;

/** Pesquisa na internet soluções para os problemas de um relatório de diagnóstico. */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "method not allowed" });

  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  const PARALLEL_API_KEY = Deno.env.get("PARALLEL_API_KEY");
  if (!LOVABLE_API_KEY || !PARALLEL_API_KEY) return json(500, { error: "Pesquisa na internet não configurada." });

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const token = (req.headers.get("Authorization") || "").replace("Bearer ", "");
  const { data: userData } = await supabase.auth.getUser(token);
  if (!userData?.user) return json(401, { error: "Não autenticado" });
  const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: userData.user.id, _role: "admin" });
  if (!isAdmin) return json(403, { error: "Apenas administradores" });

  let body: any;
  try { body = await req.json(); } catch { return json(400, { error: "JSON inválido" }); }
  const reportId = String(body?.report_id || "");
  if (!UUID.test(reportId)) return json(400, { error: "report_id inválido" });

  const { data: report, error } = await supabase.from("ad_diagnostic_reports")
    .select("hostname, scope, findings").eq("id", reportId).maybeSingle();
  if (error || !report) return json(404, { error: "Relatório não encontrado" });

  const problems = ((report.findings as any[]) || [])
    .filter((f) => f.status === "error" || f.status === "warning").slice(0, 10);
  if (!problems.length) return json(200, { items: [] });

  const list = problems.map((f, i) => `${i + 1}. [${f.check}] ${f.detail}`).join("\n");
  const input = `Você é especialista em Windows Server e Active Directory. Para cada problema abaixo, encontrado em ${report.scope === "server" ? "um controlador de domínio" : "uma estação do domínio"} (${report.hostname}), pesquise na internet (preferir docs da Microsoft, Microsoft Learn e fóruns técnicos confiáveis) a causa provável e os passos de solução, com comandos PowerShell quando aplicável. Responda em português do Brasil. Inclua as URLs das fontes usadas. Retorne null em vez de inventar.\n\n${list}`;

  const resp = await fetch(`${GATEWAY_URL}/v1/responses`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      "X-Connection-Api-Key": PARALLEL_API_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "parallel",
      reasoning: { effort: "low" },
      input,
      text: { format: { type: "json_schema", name: "solucoes", schema: {
        type: "object", required: ["items"], additionalProperties: false,
        properties: { items: { type: "array", items: {
          type: "object", required: ["check", "cause", "steps", "sources"], additionalProperties: false,
          properties: {
            check: { type: "string" },
            cause: { type: ["string", "null"] },
            steps: { type: ["string", "null"] },
            sources: { type: "array", items: { type: "string" } },
          },
        } } },
      } } },
    }),
  });

  if (!resp.ok) {
    const details = await resp.text();
    console.error(`Parallel [${resp.status}]: ${details}`);
    return json(resp.status, { error: "Falha na pesquisa na internet", details });
  }
  const data = await resp.json();
  const text = data.output_text
    ?? data.output?.flatMap((o: any) => o.content || []).find((c: any) => c.type === "output_text")?.text;
  try {
    return json(200, JSON.parse(text));
  } catch {
    return json(502, { error: "Resposta inesperada da pesquisa" });
  }
});
