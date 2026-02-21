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
    const { title, description } = await req.json();

    if (!title || !description) {
      return new Response(JSON.stringify({ error: "title and description are required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    // Fetch equipment types from DB
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: equipmentTypes } = await supabaseAdmin
      .from("equipment_types")
      .select("id, name")
      .order("name");

    const typesList = (equipmentTypes || [])
      .map((t: any) => `- "${t.name}" (id: ${t.id})`)
      .join("\n");

    const systemPrompt = `Você é um classificador de chamados de suporte técnico de TI. Analise o título e a descrição do chamado e classifique-o.

Você deve retornar EXATAMENTE um JSON com dois campos:
- "priority": uma das opções "low", "medium", "high", "urgent"
- "equipment_type_id": o UUID do tipo de equipamento mais adequado, ou null se não for possível determinar

Critérios de prioridade:
- "low": problemas cosméticos, dúvidas simples, sem impacto na produtividade
- "medium": problemas que afetam parcialmente o trabalho, com workaround disponível
- "high": problemas que impedem tarefas importantes, afetam múltiplos usuários
- "urgent": sistema fora do ar, perda de dados, segurança comprometida, empresa parada

Tipos de equipamento disponíveis:
${typesList}

Responda APENAS com o JSON, sem markdown, sem explicações.`;

    const userPrompt = `Título: ${title}\nDescrição: ${description}`;

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
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Insufficient AI credits" }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      throw new Error("AI gateway error");
    }

    const aiData = await response.json();
    const content = aiData.choices?.[0]?.message?.content || "";

    // Extract JSON from response
    let classification: { priority: string; equipment_type_id: string | null };
    try {
      const cleaned = content.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();
      const jsonStart = cleaned.indexOf("{");
      const jsonEnd = cleaned.lastIndexOf("}");
      if (jsonStart === -1 || jsonEnd === -1) throw new Error("No JSON found");
      classification = JSON.parse(cleaned.substring(jsonStart, jsonEnd + 1));
    } catch {
      console.error("Failed to parse AI response:", content);
      classification = { priority: "medium", equipment_type_id: null };
    }

    // Validate priority
    const validPriorities = ["low", "medium", "high", "urgent"];
    if (!validPriorities.includes(classification.priority)) {
      classification.priority = "medium";
    }

    // Validate equipment_type_id
    if (classification.equipment_type_id) {
      const validIds = (equipmentTypes || []).map((t: any) => t.id);
      if (!validIds.includes(classification.equipment_type_id)) {
        classification.equipment_type_id = null;
      }
    }

    return new Response(JSON.stringify(classification), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("ai-classify-ticket error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
