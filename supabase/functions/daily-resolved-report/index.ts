import { createClient } from "npm:@supabase/supabase-js@2";
import { waFetch } from "../_shared/whatsapp.ts";
import { AI_NOT_CONFIGURED, aiChatUrl, aiKey, aiModel } from "../_shared/ai.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

async function generateAiSummary(
  ticket: any,
  messages: any[],
  lovableApiKey: string
): Promise<string> {
  const chatHistory = messages
    .map(
      (m: any) =>
        `[${m.sender?.full_name || "Sistema"}${m.is_internal ? " (interno)" : ""}]: ${m.message}`
    )
    .join("\n");

  const prompt = `Resuma em no máximo 3 linhas curtas o atendimento deste chamado de suporte de TI.
Chamado: ${ticket.title}
Descrição: ${ticket.description}
Histórico:
${chatHistory || "(sem mensagens)"}

Responda em português brasileiro, de forma direta e objetiva. Sem marcadores, sem títulos.`;

  try {
    const response = await fetch(
      aiChatUrl(),
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${lovableApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: aiModel("google/gemini-2.5-flash-lite"),
          messages: [{ role: "user", content: prompt }],
        }),
      }
    );

    if (!response.ok) {
      console.error("AI summary error:", response.status);
      return "Resumo não disponível.";
    }

    const data = await response.json();
    return (
      data.choices?.[0]?.message?.content?.trim() || "Resumo não disponível."
    );
  } catch (err) {
    console.error("AI summary exception:", err);
    return "Resumo não disponível.";
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const AI_KEY = aiKey();
    if (!AI_KEY) throw new Error(AI_NOT_CONFIGURED);

    // Load settings
    const { data: settingsData } = await supabaseAdmin
      .from("system_settings")
      .select("key, value");
    const settings: Record<string, string> = {};
    settingsData?.forEach((s: any) => {
      settings[s.key] = s.value || "";
    });

    const whatsappEnabled = settings.whatsapp_enabled === "true";
    const waApiUrl = settings.whatsapp_api_url;
    const waApiToken = settings.whatsapp_api_token;

    if (!whatsappEnabled || !waApiUrl || !waApiToken) {
      console.log("WhatsApp not configured, skipping daily resolved report");
      return new Response(
        JSON.stringify({ success: true, skipped: "whatsapp_disabled" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const baseUrl =
      settings.app_base_url || Deno.env.get("APP_BASE_URL") || "https://vigilant-web-haven.lovable.app";

    // Get today's date range in BRT (UTC-3)
    const now = new Date();
    const brtOffset = -3 * 60 * 60 * 1000;
    const brtNow = new Date(now.getTime() + brtOffset);
    const todayStart = new Date(brtNow);
    todayStart.setUTCHours(0, 0, 0, 0);
    const todayStartUtc = new Date(todayStart.getTime() - brtOffset);
    const todayEndUtc = new Date(todayStartUtc.getTime() + 24 * 60 * 60 * 1000);

    // Fetch tickets resolved or closed today
    const { data: resolvedTickets } = await supabaseAdmin
      .from("tickets")
      .select(
        "id, ticket_number, title, description, status, priority, client_id, assigned_to, updated_at"
      )
      .in("status", ["resolved", "closed"])
      .gte("updated_at", todayStartUtc.toISOString())
      .lt("updated_at", todayEndUtc.toISOString())
      .order("updated_at", { ascending: true });

    if (!resolvedTickets?.length) {
      console.log("No resolved tickets today");
      return new Response(
        JSON.stringify({ success: true, sent: 0, message: "No resolved tickets today" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get unique client IDs
    const clientIds = [...new Set(resolvedTickets.map((t) => t.client_id))];

    // Fetch clients with WhatsApp
    const { data: clients } = await supabaseAdmin
      .from("clients")
      .select("id, full_name, phone, whatsapp_group_id")
      .in("id", clientIds);

    if (!clients?.length) {
      return new Response(
        JSON.stringify({ success: true, sent: 0, message: "No clients found" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch technician names
    const techIds = [
      ...new Set(resolvedTickets.filter((t) => t.assigned_to).map((t) => t.assigned_to!)),
    ];
    const techNames: Record<string, string> = {};
    if (techIds.length > 0) {
      const { data: techProfiles } = await supabaseAdmin
        .from("profiles")
        .select("id, full_name")
        .in("id", techIds);
      techProfiles?.forEach((p) => {
        techNames[p.id] = p.full_name;
      });
    }

    // Generate AI summaries for each ticket (with concurrency limit)
    const ticketSummaries: Record<string, string> = {};
    for (const ticket of resolvedTickets) {
      const { data: messages } = await supabaseAdmin
        .from("ticket_messages")
        .select(
          "message, is_internal, created_at, sender:profiles!ticket_messages_sender_id_fkey(full_name)"
        )
        .eq("ticket_id", ticket.id)
        .eq("is_internal", false)
        .order("created_at", { ascending: true })
        .limit(20);

      ticketSummaries[ticket.id] = await generateAiSummary(
        ticket,
        messages || [],
        AI_KEY
      );
    }

    const dateStr = brtNow.toLocaleDateString("pt-BR");
    const sendUrl = `${waApiUrl.replace(/\/+$/, "")}/send/text`;
    let sent = 0;

    const priorityEmoji: Record<string, string> = {
      low: "🟢",
      medium: "🟡",
      high: "🟠",
      urgent: "🔴",
    };

    for (const client of clients) {
      const myTickets = resolvedTickets.filter(
        (t) => t.client_id === client.id
      );
      if (myTickets.length === 0) continue;

      const destination =
        client.whatsapp_group_id ||
        client.phone?.replace(/[\s\-\(\)\+]/g, "");
      if (!destination || destination.length < 10) continue;

      let msg = `📊 *Relatório de Atendimentos do Dia*\n`;
      msg += `📅 ${dateStr}\n\n`;
      msg += `Olá *${client.full_name}*, segue o resumo dos chamados atendidos hoje:\n\n`;
      msg += `✅ *${myTickets.length} chamado(s) finalizado(s)*\n`;
      msg += `━━━━━━━━━━━━━━━━━━━━━\n\n`;

      for (const t of myTickets) {
        const pri = priorityEmoji[t.priority] || "⚪";
        const tech = t.assigned_to ? techNames[t.assigned_to] || "" : "";
        const statusLabel = t.status === "closed" ? "Fechado" : "Resolvido";

        msg += `${pri} *#${t.ticket_number} - ${t.title}*\n`;
        msg += `   📌 Status: ${statusLabel}`;
        if (tech) msg += ` | 🔧 Técnico: ${tech}`;
        msg += `\n`;
        msg += `   💡 ${ticketSummaries[t.id]}\n\n`;
      }

      msg += `━━━━━━━━━━━━━━━━━━━━━\n`;
      msg += `🔗 Portal de Suporte: ${baseUrl}/helpdesk`;

      try {
        const resp = await waFetch(sendUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json", token: waApiToken },
          body: JSON.stringify({
            number: destination,
            text: msg,
            linkPreview: false,
          }),
        });
        if (resp.ok) {
          sent++;
          console.log(`Daily resolved report sent to ${client.full_name}`);
        } else {
          const errBody = await resp.text();
          console.error(
            `WhatsApp failed for ${client.full_name}: ${resp.status} ${errBody}`
          );
        }
      } catch (err) {
        console.error(`WhatsApp error for ${client.full_name}:`, err);
      }
    }

    console.log(`Daily resolved report: ${sent} messages sent`);
    return new Response(JSON.stringify({ success: true, sent }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("daily-resolved-report error:", error);
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
