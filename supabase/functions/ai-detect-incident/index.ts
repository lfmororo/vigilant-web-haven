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
    const { title, description, client_id } = await req.json();

    if (!title || !description) {
      return new Response(JSON.stringify({ error: "title and description are required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // 1. Check for active incidents
    const { data: activeIncidents } = await supabaseAdmin
      .from("tickets")
      .select("id, title, description, incident_message, created_at")
      .eq("is_incident", true)
      .in("status", ["open", "in_progress"])
      .order("created_at", { ascending: false })
      .limit(10);

    if (!activeIncidents || activeIncidents.length === 0) {
      // 2. Check for similar recent tickets (same problem, many reporters)
      const oneDayAgo = new Date();
      oneDayAgo.setHours(oneDayAgo.getHours() - 24);

      const { data: recentTickets } = await supabaseAdmin
        .from("tickets")
        .select("id, title, description, client_id")
        .in("status", ["open", "in_progress"])
        .eq("is_incident", false)
        .is("parent_incident_id", null)
        .gte("created_at", oneDayAgo.toISOString())
        .order("created_at", { ascending: false })
        .limit(30);

      if (!recentTickets || recentTickets.length < 3) {
        return new Response(JSON.stringify({ match: false }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Use AI to detect if this ticket is similar to a cluster of recent tickets
      const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
      if (!LOVABLE_API_KEY) {
        return new Response(JSON.stringify({ match: false }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const ticketsList = recentTickets.map((t: any) =>
        `- "${t.title}": ${t.description?.substring(0, 100)}`
      ).join("\n");

      const clusterPrompt = `Analise o novo ticket e a lista de tickets abertos recentes. Determine se existe um padrão de VÁRIOS tickets sobre o MESMO problema (indicando um incidente em massa).

NOVO TICKET:
Título: ${title}
Descrição: ${description}

TICKETS ABERTOS RECENTES (últimas 24h):
${ticketsList}

Responda APENAS com JSON:
{
  "is_cluster": true/false,
  "similar_count": número de tickets semelhantes ao novo,
  "cluster_topic": "descrição curta do problema em comum",
  "suggested_incident_title": "título sugerido para o incidente",
  "suggested_message": "mensagem curta para informar os clientes"
}`;

      const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-3-flash-preview",
          messages: [
            { role: "system", content: "Você é um detector de incidentes de TI. Responda apenas JSON válido, sem markdown." },
            { role: "user", content: clusterPrompt },
          ],
        }),
      });

      if (!aiResp.ok) {
        return new Response(JSON.stringify({ match: false }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const aiData = await aiResp.json();
      const content = aiData.choices?.[0]?.message?.content || "";

      try {
        const cleaned = content.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();
        const jsonStart = cleaned.indexOf("{");
        const jsonEnd = cleaned.lastIndexOf("}");
        const parsed = JSON.parse(cleaned.substring(jsonStart, jsonEnd + 1));

        if (parsed.is_cluster && parsed.similar_count >= 3) {
          // Find the IDs of similar tickets for potential linking
          return new Response(JSON.stringify({
            match: false,
            cluster_detected: true,
            similar_count: parsed.similar_count,
            cluster_topic: parsed.cluster_topic,
            suggested_incident_title: parsed.suggested_incident_title,
            suggested_message: parsed.suggested_message,
            similar_ticket_ids: recentTickets.slice(0, parsed.similar_count).map((t: any) => t.id),
          }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      } catch {
        // Ignore parse errors
      }

      return new Response(JSON.stringify({ match: false }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // There are active incidents — check if this ticket matches one
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ match: false }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const incidentsList = activeIncidents.map((inc: any) =>
      `ID: ${inc.id}\nTítulo: ${inc.title}\nDescrição: ${inc.description?.substring(0, 200)}\nMensagem: ${inc.incident_message || "N/A"}`
    ).join("\n---\n");

    const matchPrompt = `Verifique se o novo ticket do cliente é sobre o MESMO problema de algum incidente ativo.

NOVO TICKET:
Título: ${title}
Descrição: ${description}

INCIDENTES ATIVOS:
${incidentsList}

Responda APENAS com JSON:
{
  "matches_incident": true/false,
  "incident_id": "UUID do incidente que combina ou null"
}`;

    const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: "Você é um detector de incidentes de TI. Responda apenas JSON válido, sem markdown." },
          { role: "user", content: matchPrompt },
        ],
      }),
    });

    if (!aiResp.ok) {
      return new Response(JSON.stringify({ match: false }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiData = await aiResp.json();
    const content = aiData.choices?.[0]?.message?.content || "";

    try {
      const cleaned = content.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();
      const jsonStart = cleaned.indexOf("{");
      const jsonEnd = cleaned.lastIndexOf("}");
      const parsed = JSON.parse(cleaned.substring(jsonStart, jsonEnd + 1));

      if (parsed.matches_incident && parsed.incident_id) {
        const matchedIncident = activeIncidents.find((i: any) => i.id === parsed.incident_id);
        return new Response(JSON.stringify({
          match: true,
          incident_id: parsed.incident_id,
          incident_title: matchedIncident?.title || "",
          incident_message: matchedIncident?.incident_message || "Já estamos cientes deste problema e trabalhando na solução.",
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    } catch {
      // Ignore parse errors
    }

    return new Response(JSON.stringify({ match: false }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("ai-detect-incident error:", e);
    return new Response(JSON.stringify({ match: false }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
