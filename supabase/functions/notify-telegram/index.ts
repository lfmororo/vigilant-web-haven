import { createClient } from "npm:@supabase/supabase-js@2";
import { isServiceRole, denied } from "../_shared/caller.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface TelegramPayload {
  ticket_id: string;
  notification_type: "ticket_opened" | "ticket_updated" | "ticket_resolved" | "ticket_closed" | "signature_requested";
  message?: string;
  sender_name?: string;
  resolution_summary?: string;
}

function escapeMarkdown(text: string): string {
  return text.replace(/([_*\[\]()~`>#+\-=|{}.!\\])/g, "\\$1");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Só o próprio servidor (outras funções/crons com a service_role) pode chamar.
  if (!isServiceRole(req)) return denied(corsHeaders);

  try {
    const botToken = Deno.env.get("TELEGRAM_BOT_TOKEN");
    const chatId = Deno.env.get("TELEGRAM_CHAT_ID");

    if (!botToken || !chatId) {
      console.error("Telegram not configured: missing TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID");
      return new Response(JSON.stringify({ error: "Telegram not configured" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { ticket_id, notification_type, message, sender_name, resolution_summary }: TelegramPayload = await req.json();

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Load base URL from settings
    const { data: settingsData } = await supabaseAdmin.from("system_settings").select("key, value");
    const settings: Record<string, string> = {};
    settingsData?.forEach((s: any) => { settings[s.key] = s.value || ""; });
    const baseUrl = settings.app_base_url || Deno.env.get("APP_BASE_URL") || "https://vigilant-web-haven.lovable.app";

    const { data: ticket } = await supabaseAdmin
      .from("tickets")
      .select("ticket_number, title, priority, status, equipment_type_id")
      .eq("id", ticket_id)
      .single();

    if (!ticket) {
      return new Response(JSON.stringify({ error: "Ticket not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch equipment type name
    let category = "";
    if (ticket.equipment_type_id) {
      const { data: eqType } = await supabaseAdmin
        .from("equipment_types")
        .select("name")
        .eq("id", ticket.equipment_type_id)
        .single();
      category = eqType?.name || "";
    }

    const priorityEmoji: Record<string, string> = {
      low: "🟢 Baixa",
      medium: "🟡 Média",
      high: "🟠 Alta",
      urgent: "🔴 Urgente",
    };

    const typeConfig: Record<string, { emoji: string; heading: string }> = {
      ticket_opened:   { emoji: "🆕", heading: "Novo Chamado" },
      ticket_updated:  { emoji: "🔄", heading: "Chamado Atualizado" },
      ticket_resolved: { emoji: "✅", heading: "Chamado Resolvido" },
      ticket_closed:        { emoji: "📁", heading: "Chamado Encerrado" },
      signature_requested:  { emoji: "✍️", heading: "Assinatura Solicitada" },
    };

    const config = typeConfig[notification_type] || typeConfig.ticket_updated;
    const pri = priorityEmoji[ticket.priority] || "⚪ Indefinida";

    const safeTitle = escapeMarkdown(ticket.title);
    const safeSender = sender_name ? escapeMarkdown(sender_name) : "";
    const safeCategory = category ? escapeMarkdown(category) : "";
    const safeMessage = message ? escapeMarkdown(message) : "";
    const safeResolution = resolution_summary ? escapeMarkdown(resolution_summary) : "";

    let text = `${config.emoji} *${escapeMarkdown(config.heading)}*\n\n`;
    text += `📋 *Ticket:* \\#${ticket.ticket_number}\n`;
    text += `📝 *Assunto:* ${safeTitle}\n`;
    if (safeCategory) text += `🏷️ *Categoria:* ${safeCategory}\n`;
    text += `⚡ *Prioridade:* ${escapeMarkdown(pri)}\n`;
    if (safeSender) text += `👤 *Por:* ${safeSender}\n`;

    if (notification_type === "ticket_opened" && safeMessage) {
      text += `\n💬 *Descrição:*\n${safeMessage}`;
    } else if (notification_type === "ticket_updated" && safeMessage) {
      text += `\n💬 *Mensagem:*\n${safeMessage}`;
    } else if ((notification_type === "ticket_resolved" || notification_type === "ticket_closed") && safeResolution) {
      text += `\n📋 *Resolução:*\n${safeResolution}`;
    } else if (notification_type === "signature_requested") {
      text += `\n${escapeMarkdown("O técnico finalizou o atendimento e registrou sua assinatura.")}`;
      text += `\n${escapeMarkdown("Aguardando assinatura do cliente para encerramento.")}`;
    }

    // Add ticket link
    const ticketLink = `${baseUrl}/admin/tickets/${ticket_id}`;
    text += `\n\n🔗 [Abrir Chamado](${escapeMarkdown(ticketLink).replace(/\\\//g, "/")})`;

    const telegramUrl = `https://api.telegram.org/bot${botToken}/sendMessage`;
    const resp = await fetch(telegramUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: "MarkdownV2",
      }),
    });

    const result = await resp.json();

    if (!resp.ok) {
      console.error("Telegram API error:", result);
      return new Response(JSON.stringify({ error: "Telegram send failed", details: result }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("notify-telegram error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
