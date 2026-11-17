import { createClient } from "npm:@supabase/supabase-js@2";
import { AI_NOT_CONFIGURED, aiChatUrl, aiKey, aiModel } from "../_shared/ai.ts";

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

    const AI_KEY = aiKey();
    if (!AI_KEY) throw new Error(AI_NOT_CONFIGURED);

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Fetch ticket details
    const { data: ticket } = await supabaseAdmin
      .from("tickets")
      .select("title, description, priority, status, created_at, equipment_info, client:clients!tickets_client_id_fkey(full_name), assigned:profiles!tickets_assigned_to_fkey(full_name), equipment_type:equipment_types(name)")
      .eq("id", ticket_id)
      .single();

    if (!ticket) {
      return new Response(JSON.stringify({ error: "Ticket not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch all messages
    const { data: messages } = await supabaseAdmin
      .from("ticket_messages")
      .select("message, is_internal, created_at, sender:profiles!ticket_messages_sender_id_fkey(full_name)")
      .eq("ticket_id", ticket_id)
      .order("created_at", { ascending: true });

    const chatHistory = (messages || [])
      .map((m: any) => `[${m.sender?.full_name || "Sistema"}${m.is_internal ? " (interno)" : ""}]: ${m.message}`)
      .join("\n");

    const systemPrompt = `Você é um assistente que gera resumos profissionais de atendimentos de suporte técnico de TI.

Gere um resumo conciso e estruturado do atendimento, incluindo:
1. **Problema reportado**: O que o cliente relatou
2. **Diagnóstico**: O que foi identificado como causa
3. **Solução aplicada**: O que foi feito para resolver
4. **Tempo de atendimento**: Duração aproximada baseada nas datas
5. **Observações**: Qualquer ponto relevante adicional

Regras:
- Responda SEMPRE em português brasileiro
- Seja conciso mas completo
- Use formatação com marcadores para clareza
- Se não houver informação suficiente para algum item, indique "Não informado"
- Não invente informações que não estão no histórico`;

    const userPrompt = `Chamado: ${ticket.title}
Descrição inicial: ${ticket.description}
Prioridade: ${ticket.priority}
Cliente: ${(ticket as any).client?.full_name || "N/A"}
Técnico: ${(ticket as any).assigned?.full_name || "N/A"}
Equipamento: ${(ticket as any).equipment_type?.name || "N/A"} ${ticket.equipment_info || ""}
Data de abertura: ${new Date(ticket.created_at).toLocaleString("pt-BR")}
Data de encerramento: ${new Date().toLocaleString("pt-BR")}

Histórico completo do atendimento:
${chatHistory || "(sem mensagens)"}

Gere o resumo do atendimento:`;

    const response = await fetch(aiChatUrl(), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${AI_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: aiModel("google/gemini-3-flash-preview"),
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
    const summary = aiData.choices?.[0]?.message?.content || "Não foi possível gerar o resumo.";

    return new Response(JSON.stringify({ summary }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("ai-ticket-summary error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
