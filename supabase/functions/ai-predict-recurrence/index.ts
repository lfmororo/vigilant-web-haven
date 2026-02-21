import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { ticket_id } = await req.json();
    if (!ticket_id) {
      return new Response(JSON.stringify({ error: "ticket_id is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Fetch current ticket
    const { data: ticket } = await supabaseAdmin
      .from("tickets")
      .select("id, title, description, priority, client_id, equipment_type_id, equipment_info, created_at, client:clients!tickets_client_id_fkey(full_name), equipment_type:equipment_types(name)")
      .eq("id", ticket_id)
      .single();

    if (!ticket) {
      return new Response(JSON.stringify({ error: "Ticket not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch historical tickets for same client (last 6 months, max 50)
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

    const { data: history } = await supabaseAdmin
      .from("tickets")
      .select("title, description, priority, status, equipment_info, created_at, equipment_type:equipment_types(name)")
      .eq("client_id", ticket.client_id)
      .neq("id", ticket_id)
      .gte("created_at", sixMonthsAgo.toISOString())
      .order("created_at", { ascending: false })
      .limit(50);

    if (!history || history.length < 2) {
      return new Response(JSON.stringify({
        is_recurring: false,
        message: "Histórico insuficiente para análise de recorrência.",
        similar_count: 0,
        suggestions: [],
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const historyText = history.map((t: any, i: number) =>
      `${i + 1}. [${new Date(t.created_at).toLocaleDateString("pt-BR")}] "${t.title}" - ${t.description?.substring(0, 150)} (Prioridade: ${t.priority}, Status: ${t.status}, Equip: ${t.equipment_type?.name || "N/A"})`
    ).join("\n");

    const systemPrompt = `Você é um analista de suporte técnico de TI especializado em identificar padrões de tickets recorrentes.

Analise o ticket atual comparando-o com o histórico de tickets do mesmo cliente e determine:
1. Se é um problema recorrente (similar a tickets anteriores)
2. Quantos tickets semelhantes existem no histórico
3. Qual a frequência aproximada de ocorrência
4. Sugestões de ação preventiva

Responda APENAS com JSON válido no formato:
{
  "is_recurring": true/false,
  "confidence": "alta"/"média"/"baixa",
  "similar_count": número,
  "pattern_description": "descrição curta do padrão identificado",
  "frequency": "descrição da frequência (ex: semanal, mensal)",
  "root_cause_hypothesis": "possível causa raiz",
  "suggestions": ["sugestão 1", "sugestão 2", "sugestão 3"]
}

Sem markdown, sem explicações extras, APENAS o JSON.`;

    const userPrompt = `TICKET ATUAL:
Título: ${ticket.title}
Descrição: ${ticket.description}
Prioridade: ${ticket.priority}
Equipamento: ${(ticket as any).equipment_type?.name || "N/A"} ${ticket.equipment_info || ""}
Cliente: ${(ticket as any).client?.full_name}
Data: ${new Date(ticket.created_at).toLocaleDateString("pt-BR")}

HISTÓRICO DO CLIENTE (${history.length} tickets nos últimos 6 meses):
${historyText}`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded" }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Insufficient AI credits" }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      throw new Error("AI gateway error");
    }

    const aiData = await response.json();
    const content = aiData.choices?.[0]?.message?.content || "";

    let result: any;
    try {
      const cleaned = content.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();
      const jsonStart = cleaned.indexOf("{");
      const jsonEnd = cleaned.lastIndexOf("}");
      if (jsonStart === -1 || jsonEnd === -1) throw new Error("No JSON");
      result = JSON.parse(cleaned.substring(jsonStart, jsonEnd + 1));
    } catch {
      console.error("Failed to parse AI response:", content);
      result = {
        is_recurring: false,
        message: "Não foi possível analisar recorrência.",
        similar_count: 0,
        suggestions: [],
      };
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("ai-predict-recurrence error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
