import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function cleanPhone(phone: string): string {
  return phone.replace(/[\s\-\(\)\+]/g, "");
}

function buildMessage(
  type: string,
  ticketNumber: number,
  title: string,
  category: string,
  priority: string,
  message: string,
  senderName: string,
  resolutionSummary?: string
): string {
  const priorityEmojis: Record<string, string> = {
    Baixa: "🟢 Baixa",
    Média: "🟡 Média",
    Alta: "🟠 Alta",
    Urgente: "🔴 Urgente",
  };
  const priText = priorityEmojis[priority] || `⚪ ${priority}`;

  if (type === "ticket_opened") {
    return [
      `🆕 *Novo Chamado*`,
      ``,
      `📋 *Ticket:* #${ticketNumber}`,
      `📝 *Assunto:* ${title}`,
      category ? `🏷️ *Categoria:* ${category}` : "",
      `⚡ *Prioridade:* ${priText}`,
      `👤 *Por:* ${senderName}`,
      ``,
      `💬 *Descrição:*`,
      message,
    ]
      .filter(Boolean)
      .join("\n");
  }

  if (type === "ticket_updated") {
    return [
      `🔄 *Chamado Atualizado*`,
      ``,
      `📋 *Ticket:* #${ticketNumber}`,
      `📝 *Assunto:* ${title}`,
      `👤 *Por:* ${senderName}`,
      ``,
      `💬 *Mensagem:*`,
      message,
    ].join("\n");
  }

  if (type === "ticket_resolved") {
    const lines = [
      `✅ *Chamado Resolvido*`,
      ``,
      `📋 *Ticket:* #${ticketNumber}`,
      `📝 *Assunto:* ${title}`,
      `👤 *Por:* ${senderName}`,
    ];
    if (resolutionSummary) {
      lines.push("", `📄 *Resumo da Resolução:*`, resolutionSummary);
    }
    return lines.join("\n");
  }

  if (type === "ticket_closed") {
    const lines = [
      `📁 *Chamado Encerrado*`,
      ``,
      `📋 *Ticket:* #${ticketNumber}`,
      `📝 *Assunto:* ${title}`,
      `👤 *Por:* ${senderName}`,
    ];
    if (resolutionSummary) {
      lines.push("", `📄 *Resumo:*`, resolutionSummary);
    }
    return lines.join("\n");
  }

  return `🔔 *Notificação do Chamado #${ticketNumber}*\n\n${message}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const {
      ticket_id,
      notification_type,
      message,
      sender_name,
      resolution_summary,
    } = await req.json();

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Load WhatsApp settings
    const { data: settingsData } = await supabaseAdmin
      .from("system_settings")
      .select("key, value");

    const settings: Record<string, string> = {};
    settingsData?.forEach((s: any) => {
      settings[s.key] = s.value || "";
    });

    const enabled = settings.whatsapp_enabled === "true";
    const apiUrl = settings.whatsapp_api_url;
    const apiToken = settings.whatsapp_api_token;

    if (!enabled || !apiUrl || !apiToken) {
      console.log("WhatsApp notifications disabled or not configured");
      return new Response(
        JSON.stringify({ success: true, skipped: "disabled" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch ticket
    const { data: ticket } = await supabaseAdmin
      .from("tickets")
      .select(
        "ticket_number, title, client_id, assigned_to, priority, equipment_type_id"
      )
      .eq("id", ticket_id)
      .single();

    if (!ticket) {
      return new Response(JSON.stringify({ error: "Ticket not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch category
    let category = "";
    if (ticket.equipment_type_id) {
      const { data: eqType } = await supabaseAdmin
        .from("equipment_types")
        .select("name")
        .eq("id", ticket.equipment_type_id)
        .single();
      category = eqType?.name || "";
    }

    // Priority label
    const priorityLabels: Record<string, string> = {
      low: "Baixa",
      medium: "Média",
      high: "Alta",
      urgent: "Urgente",
    };
    const priority = priorityLabels[ticket.priority] || "Média";

    // Collect recipient IDs
    const recipientIds = new Set<string>();
    if (ticket.client_id) recipientIds.add(ticket.client_id);
    if (ticket.assigned_to) recipientIds.add(ticket.assigned_to);

    const { data: adminRoles } = await supabaseAdmin
      .from("user_roles")
      .select("user_id")
      .eq("role", "admin");

    if (adminRoles) {
      for (const r of adminRoles) {
        recipientIds.add(r.user_id);
      }
    }

    if (recipientIds.size === 0) {
      return new Response(JSON.stringify({ success: true, sent: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch recipient phones
    const { data: recipients } = await supabaseAdmin
      .from("profiles")
      .select("id, phone, full_name")
      .in("id", Array.from(recipientIds));

    const senderName = sender_name || "Sistema";

    const text = buildMessage(
      notification_type || "ticket_updated",
      ticket.ticket_number,
      ticket.title,
      category,
      priority,
      message || `${senderName} enviou uma atualização.`,
      senderName,
      resolution_summary
    );

    // Fetch client's WhatsApp group ID
    let groupId = "";
    if (ticket.client_id) {
      const { data: clientProfile } = await supabaseAdmin
        .from("profiles")
        .select("whatsapp_group_id")
        .eq("id", ticket.client_id)
        .single();
      groupId = clientProfile?.whatsapp_group_id || "";
    }

    let sent = 0;
    const sendUrl = `${apiUrl.replace(/\/+$/, "")}/send/text`;

    // Send to individual recipients
    for (const recipient of recipients || []) {
      if (!recipient.phone) continue;

      const phone = cleanPhone(recipient.phone);
      if (!phone || phone.length < 10) continue;

      try {
        const resp = await fetch(sendUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            token: apiToken,
          },
          body: JSON.stringify({ number: phone, text }),
        });

        if (resp.ok) {
          sent++;
          console.log(`WhatsApp sent to ${phone}`);
        } else {
          const errBody = await resp.text();
          console.error(`WhatsApp failed for ${phone}: ${resp.status} ${errBody}`);
        }
      } catch (err) {
        console.error(`WhatsApp error for ${phone}:`, err);
      }
    }

    // Send to client's WhatsApp group
    if (groupId) {
      try {
        const resp = await fetch(sendUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            token: apiToken,
          },
          body: JSON.stringify({ number: groupId, text }),
        });

        if (resp.ok) {
          sent++;
          console.log(`WhatsApp sent to group ${groupId}`);
        } else {
          const errBody = await resp.text();
          console.error(`WhatsApp group failed for ${groupId}: ${resp.status} ${errBody}`);
        }
      } catch (err) {
        console.error(`WhatsApp group error for ${groupId}:`, err);
      }
    }

    return new Response(JSON.stringify({ success: true, sent }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("notify-whatsapp error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
