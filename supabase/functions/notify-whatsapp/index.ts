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
  ticketLink: string,
  resolutionSummary?: string,
  surveyLink?: string
): string {
  const priorityEmojis: Record<string, string> = {
    Baixa: "🟢 Baixa",
    Média: "🟡 Média",
    Alta: "🟠 Alta",
    Urgente: "🔴 Urgente",
  };
  const priText = priorityEmojis[priority] || `⚪ ${priority}`;

  const linkLine = ticketLink ? `\n\n🔗 ${ticketLink}` : "";

  if (type === "ticket_opened" || type === "technician_assigned") {
    const heading = type === "technician_assigned" ? `🔧 *Chamado Atribuído a Você*` : `🆕 *Novo Chamado*`;
    return [
      heading,
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
      .join("\n") + linkLine;
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
    ].join("\n") + linkLine;
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
    return lines.join("\n") + linkLine;
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
    if (surveyLink) {
      lines.push(
        "",
        `━━━━━━━━━━━━━━━━━━━━━`,
        `⭐ *Avalie nosso atendimento!*`,
        `━━━━━━━━━━━━━━━━━━━━━`,
        ``,
        `Sua opinião é muito importante para nós.`,
        `Clique no link abaixo para avaliar:`,
        ``,
        `👉 ${surveyLink}`
      );
    }
    return lines.join("\n") + linkLine;
  }

  if (type === "signature_requested") {
    return [
      `✍️ *Assinatura Solicitada*`,
      ``,
      `📋 *Ticket:* #${ticketNumber}`,
      `📝 *Assunto:* ${title}`,
      `👤 *Técnico:* ${senderName}`,
      ``,
      `O técnico finalizou o atendimento e registrou sua assinatura.`,
      `Por favor, acesse o chamado para assinar e encerrar o atendimento.`,
    ].join("\n") + linkLine;
  }

  return `🔔 *Notificação do Chamado #${ticketNumber}*\n\n${message}` + linkLine;
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
      pdf_url,
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
        "ticket_number, title, description, client_id, assigned_to, created_by, priority, equipment_type_id, sector_id"
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

    // Collect individual phones: assigned technician + ticket creator
    const individualPhones = new Set<string>();

    if (ticket.assigned_to) {
      const { data: assignedProfile } = await supabaseAdmin
        .from("profiles")
        .select("phone")
        .eq("id", ticket.assigned_to)
        .single();
      if (assignedProfile?.phone) {
        individualPhones.add(cleanPhone(assignedProfile.phone));
      }
    }

    if (ticket.created_by && ticket.created_by !== ticket.assigned_to) {
      const { data: creatorProfile } = await supabaseAdmin
        .from("profiles")
        .select("phone")
        .eq("id", ticket.created_by)
        .single();
      if (creatorProfile?.phone) {
        individualPhones.add(cleanPhone(creatorProfile.phone));
      }
    }

    // Add admin phones
    const { data: adminRoles } = await supabaseAdmin
      .from("user_roles")
      .select("user_id")
      .eq("role", "admin");

    if (adminRoles) {
      for (const r of adminRoles) {
        if (r.user_id !== ticket.created_by && r.user_id !== ticket.assigned_to) {
          const { data: adminProfile } = await supabaseAdmin
            .from("profiles")
            .select("phone")
            .eq("id", r.user_id)
            .maybeSingle();
          if (adminProfile?.phone) {
            individualPhones.add(cleanPhone(adminProfile.phone));
          }
        }
      }
    }

    const senderName = sender_name || "Sistema";

    // Build ticket link using app_base_url from settings
    const baseUrl = settings.app_base_url || "https://vigilant-web-haven.lovable.app";
    const ticketLink = `${baseUrl}/helpdesk/tickets/${ticket_id}`;

    // Fetch satisfaction survey link for closed tickets
    let surveyLink = "";
    if ((notification_type || "ticket_updated") === "ticket_closed") {
      const { data: ratingRecord } = await supabaseAdmin
        .from("ticket_ratings")
        .select("rating_token")
        .eq("ticket_id", ticket_id)
        .is("rating", null)
        .maybeSingle();
      if (ratingRecord?.rating_token) {
        surveyLink = `${Deno.env.get("SUPABASE_URL")}/functions/v1/submit-rating?token=${ratingRecord.rating_token}`;
      }
    }

    // For technician_assigned, use ticket description as the message content
    const notifType = notification_type || "ticket_updated";
    const messageContent = notifType === "technician_assigned"
      ? (ticket.description || message || `${senderName} enviou uma atualização.`)
      : (message || `${senderName} enviou uma atualização.`);

    const text = buildMessage(
      notifType,
      ticket.ticket_number,
      ticket.title,
      category,
      priority,
      messageContent,
      senderName,
      ticketLink,
      resolution_summary,
      surveyLink
    );

    // Fetch client's WhatsApp group ID from clients table
    let groupId = "";
    if (ticket.client_id) {
      const { data: clientRecord } = await supabaseAdmin
        .from("clients")
        .select("whatsapp_group_id")
        .eq("id", ticket.client_id)
        .single();
      groupId = clientRecord?.whatsapp_group_id || "";
    }

    // Fetch sector phone if ticket has a sector
    if (ticket.sector_id) {
      const { data: sectorRecord } = await supabaseAdmin
        .from("client_sectors")
        .select("phone")
        .eq("id", ticket.sector_id)
        .single();
      if (sectorRecord?.phone) {
        individualPhones.add(cleanPhone(sectorRecord.phone));
      }
    }

    let sent = 0;
    const baseApiUrl = apiUrl.replace(/\/+$/, "");
    const sendTextUrl = `${baseApiUrl}/send/text`;
    const sendMediaUrl = `${baseApiUrl}/send/media`;
    const sendMenuUrl = `${baseApiUrl}/send/menu`;

    // Helper to send text + button + optional PDF document
    const sendToNumber = async (number: string) => {
      try {
        // Send text message
        const textResp = await fetch(sendTextUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json", token: apiToken },
          body: JSON.stringify({ number, text, linkPreview: false }),
        });
        if (textResp.ok) {
          sent++;
          console.log(`WhatsApp text sent to ${number}`);
        } else {
          const errBody = await textResp.text();
          console.error(`WhatsApp text failed for ${number}: ${textResp.status} ${errBody}`);
        }

        // Send support button
        try {
          const menuResp = await fetch(sendMenuUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json", token: apiToken },
            body: JSON.stringify({
              number,
              type: "button",
              text: "Precisa de Suporte?",
              choices: ["Falar com Suporte|https://wa.me/5585986801458?text=Preciso%20de%20Suporte"],
              footerText: "Escolha uma opção",
            }),
          });
          if (menuResp.ok) {
            console.log(`WhatsApp button sent to ${number}`);
          } else {
            const errBody = await menuResp.text();
            console.error(`WhatsApp button failed for ${number}: ${menuResp.status} ${errBody}`);
          }
        } catch (btnErr) {
          console.error(`WhatsApp button error for ${number}:`, btnErr);
        }

        // Send PDF document if available (only for resolved/closed tickets)
        if (pdf_url && (notification_type === "ticket_resolved" || notification_type === "ticket_closed")) {
          const docResp = await fetch(sendMediaUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json", token: apiToken },
            body: JSON.stringify({
              number,
              type: "document",
              file: pdf_url,
              docName: `chamado-${ticket.ticket_number}.pdf`,
              text: `📄 Relatório do Chamado #${ticket.ticket_number}`,
            }),
          });
          if (docResp.ok) {
            console.log(`WhatsApp PDF sent to ${number}`);
          } else {
            const errBody = await docResp.text();
            console.error(`WhatsApp PDF failed for ${number}: ${docResp.status} ${errBody}`);
          }
        }
      } catch (err) {
        console.error(`WhatsApp error for ${number}:`, err);
      }
    };

    // Send to assigned technician and ticket creator
    for (const phone of individualPhones) {
      if (phone.length >= 10) {
        await sendToNumber(phone);
      }
    }

    // Send to client's WhatsApp group
    if (groupId) {
      await sendToNumber(groupId);
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
