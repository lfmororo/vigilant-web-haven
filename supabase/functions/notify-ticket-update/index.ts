import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ---------- HTML Email Builder ----------

interface EmailParams {
  type: "ticket_opened" | "ticket_updated" | "ticket_resolved" | "ticket_closed" | "signature_requested";
  recipientName: string;
  ticketNumber: number;
  title: string;
  category: string;
  priority: string;
  message: string;
  ticketLink: string;
  companyName: string;
  senderName?: string;
  resolutionSummary?: string;
}

function buildEmailHtml(p: EmailParams): string {
  const themes: Record<string, { heading: string; emoji: string; color: string; bgLight: string }> = {
    ticket_opened:        { heading: "Novo Chamado Aberto",       emoji: "🎫", color: "#2563eb", bgLight: "#eff6ff" },
    ticket_updated:       { heading: "Chamado Atualizado",        emoji: "🔄", color: "#7c3aed", bgLight: "#f5f3ff" },
    ticket_resolved:      { heading: "Chamado Resolvido",         emoji: "✅", color: "#16a34a", bgLight: "#f0fdf4" },
    ticket_closed:        { heading: "Chamado Encerrado",         emoji: "📁", color: "#6b7280", bgLight: "#f9fafb" },
    signature_requested:  { heading: "Assinatura Solicitada",     emoji: "✍️", color: "#d97706", bgLight: "#fffbeb" },
  };

  const theme = themes[p.type] || themes.ticket_updated;

  const priorityConfig: Record<string, { color: string; bg: string; icon: string }> = {
    Baixa:   { color: "#15803d", bg: "#dcfce7", icon: "🟢" },
    Média:   { color: "#a16207", bg: "#fef9c3", icon: "🟡" },
    Alta:    { color: "#c2410c", bg: "#ffedd5", icon: "🟠" },
    Urgente: { color: "#dc2626", bg: "#fee2e2", icon: "🔴" },
  };
  const pri = priorityConfig[p.priority] || { color: "#6b7280", bg: "#f3f4f6", icon: "⚪" };

  const now = new Date();
  const dateStr = now.toLocaleDateString("pt-BR", { day: "numeric", month: "long", year: "numeric", timeZone: "America/Sao_Paulo" });
  const timeStr = now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });

  const senderInfo = p.senderName ? `<p style="margin:0 0 16px;color:#64748b;font-size:13px;">Ação realizada por: <strong style="color:#334155;">${p.senderName}</strong></p>` : "";

  // Build info table rows
  const tableRow = (label: string, value: string) => `
    <tr>
      <td style="padding:12px 16px;background:#f8fafc;font-weight:600;color:#475569;border-bottom:1px solid #e2e8f0;width:140px;font-size:14px;">${label}</td>
      <td style="padding:12px 16px;border-bottom:1px solid #e2e8f0;color:#1e293b;font-size:14px;">${value}</td>
    </tr>`;

  const priorityBadge = `<span style="display:inline-block;background:${pri.bg};color:${pri.color};padding:4px 14px;border-radius:20px;font-size:13px;font-weight:700;">${pri.icon} ${p.priority}</span>`;

  let bodyContent = "";

  if (p.type === "ticket_opened") {
    bodyContent = `
      <p style="margin:0 0 8px;color:#334155;font-size:15px;line-height:1.6;">Olá <strong>${p.recipientName}</strong>,</p>
      <p style="margin:0 0 20px;color:#475569;font-size:15px;line-height:1.6;">Um novo chamado foi registrado no sistema:</p>
      ${senderInfo}
      <table style="width:100%;border-collapse:collapse;margin-bottom:20px;border-radius:8px;overflow:hidden;border:1px solid #e2e8f0;">
        ${tableRow("Nº do Ticket", `<strong>#${p.ticketNumber}</strong>`)}
        ${tableRow("Assunto", p.title)}
        ${p.category ? tableRow("Categoria", p.category) : ""}
        ${tableRow("Prioridade", priorityBadge)}
      </table>
      <div style="background:#eff6ff;border-left:4px solid #2563eb;border-radius:0 8px 8px 0;padding:16px 20px;margin-bottom:20px;">
        <p style="margin:0 0 6px;font-weight:700;color:#2563eb;font-size:13px;text-transform:uppercase;letter-spacing:0.5px;">Descrição do Chamado</p>
        <p style="margin:0;color:#334155;font-size:14px;line-height:1.6;">${p.message}</p>
      </div>`;
  } else if (p.type === "ticket_resolved") {
    bodyContent = `
      <p style="margin:0 0 8px;color:#334155;font-size:15px;line-height:1.6;">Olá <strong>${p.recipientName}</strong>,</p>
      <p style="margin:0 0 20px;color:#475569;font-size:15px;line-height:1.6;">O seu chamado <strong>#${p.ticketNumber}</strong> foi resolvido com sucesso!</p>
      ${senderInfo}
      <table style="width:100%;border-collapse:collapse;margin-bottom:20px;border-radius:8px;overflow:hidden;border:1px solid #e2e8f0;">
        ${tableRow("Nº do Ticket", `<strong>#${p.ticketNumber}</strong>`)}
        ${tableRow("Assunto", p.title)}
        ${p.category ? tableRow("Categoria", p.category) : ""}
      </table>
      ${p.resolutionSummary ? `
      <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:16px 20px;margin-bottom:20px;">
        <p style="margin:0 0 6px;font-weight:700;color:#166534;font-size:13px;text-transform:uppercase;letter-spacing:0.5px;">Resumo da Resolução</p>
        <p style="margin:0;color:#15803d;font-size:14px;line-height:1.5;">${p.resolutionSummary}</p>
      </div>` : ""}`;
  } else if (p.type === "ticket_closed") {
    bodyContent = `
      <p style="margin:0 0 8px;color:#334155;font-size:15px;line-height:1.6;">Olá <strong>${p.recipientName}</strong>,</p>
      <p style="margin:0 0 20px;color:#475569;font-size:15px;line-height:1.6;">O chamado <strong>#${p.ticketNumber} - ${p.title}</strong> foi encerrado.</p>
      ${senderInfo}
      ${p.resolutionSummary ? `
      <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:16px 20px;margin-bottom:20px;">
        <p style="margin:0 0 6px;font-weight:700;color:#475569;font-size:13px;text-transform:uppercase;letter-spacing:0.5px;">Resumo</p>
        <p style="margin:0;color:#334155;font-size:14px;line-height:1.5;">${p.resolutionSummary}</p>
      </div>` : ""}
      <p style="margin:0 0 20px;color:#475569;font-size:14px;line-height:1.6;">Agradecemos por utilizar nosso suporte. Caso precise de algo mais, não hesite em abrir um novo chamado.</p>`;
  } else {
    bodyContent = `
      <p style="margin:0 0 8px;color:#334155;font-size:15px;line-height:1.6;">Olá <strong>${p.recipientName}</strong>,</p>
      <p style="margin:0 0 20px;color:#475569;font-size:15px;line-height:1.6;">Houve uma atualização no chamado <strong>#${p.ticketNumber} - ${p.title}</strong>:</p>
      ${senderInfo}
      <table style="width:100%;border-collapse:collapse;margin-bottom:20px;border-radius:8px;overflow:hidden;border:1px solid #e2e8f0;">
        ${tableRow("Nº do Ticket", `<strong>#${p.ticketNumber}</strong>`)}
        ${tableRow("Assunto", p.title)}
        ${p.category ? tableRow("Categoria", p.category) : ""}
        ${tableRow("Prioridade", priorityBadge)}
      </table>
      <div style="background:#f8fafc;border-left:4px solid #7c3aed;border-radius:0 8px 8px 0;padding:16px 20px;margin-bottom:20px;">
        <p style="margin:0 0 6px;font-weight:700;color:#7c3aed;font-size:13px;text-transform:uppercase;letter-spacing:0.5px;">Nova Mensagem</p>
        <p style="margin:0;color:#334155;font-size:14px;line-height:1.6;">${p.message}</p>
      </div>`;
  }

  const logoUrl = `${Deno.env.get("SUPABASE_URL")}/storage/v1/object/public/email-assets/fm-techflow-logo.png`;

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:'Segoe UI',Arial,Helvetica,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:32px 0;">
<tr><td align="center">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">

  <!-- Header with gradient -->
  <tr><td style="background:linear-gradient(135deg,#1a1a2e 0%,#16213e 50%,#0f3460 100%);padding:28px 32px;text-align:center;">
    <!--[if mso]><v:rect xmlns:v="urn:schemas-microsoft-com:vml" fill="true" stroke="false" style="width:600px;height:100px;"><v:fill type="gradient" color="#1a1a2e" color2="#0f3460" angle="135"/><v:textbox inset="0,0,0,0" style="mso-fit-shape-to-text:true;"><![endif]-->
    <img src="${logoUrl}" alt="${p.companyName}" style="height:44px;max-width:200px;" />
    <p style="margin:8px 0 0;color:#94a3b8;font-size:11px;letter-spacing:1.5px;text-transform:uppercase;font-weight:600;">Sistema de Suporte</p>
    <!--[if mso]></v:textbox></v:rect><![endif]-->
  </td></tr>

  <!-- Status banner -->
  <tr><td style="background:${theme.bgLight};padding:20px 32px;text-align:center;border-bottom:1px solid #e2e8f0;">
    <span style="font-size:40px;line-height:1;">${theme.emoji}</span>
    <h1 style="margin:8px 0 0;font-size:22px;color:${theme.color};font-weight:800;letter-spacing:-0.3px;">${theme.heading}</h1>
  </td></tr>

  <!-- Timestamp -->
  <tr><td style="padding:16px 32px 0;text-align:right;">
    <p style="margin:0;color:#94a3b8;font-size:12px;">📅 ${dateStr} às ${timeStr}</p>
  </td></tr>

  <!-- Body -->
  <tr><td style="padding:16px 32px 24px;">
    ${bodyContent}
  </td></tr>

  <!-- Separator -->
  <tr><td style="padding:0 32px;">
    <div style="height:1px;background:linear-gradient(to right,transparent,#e2e8f0,transparent);"></div>
  </td></tr>

  <!-- CTA Button -->
  <tr><td style="padding:24px 32px 32px;text-align:center;">
    <!--[if mso]><v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${p.ticketLink}" style="height:48px;v-text-anchor:middle;width:280px;" arcsize="17%" strokecolor="#2563eb" fillcolor="#2563eb"><w:anchorlock/><center style="color:#ffffff;font-family:Arial;font-size:15px;font-weight:bold;">Visualizar Ticket</center></v:roundrect><![endif]-->
    <!--[if !mso]><!-->
    <a href="${p.ticketLink}" style="display:inline-block;background:linear-gradient(135deg,#2563eb,#7c3aed);color:#ffffff;padding:14px 40px;border-radius:8px;text-decoration:none;font-weight:700;font-size:15px;box-shadow:0 4px 14px rgba(37,99,235,0.35);letter-spacing:0.3px;">Visualizar Ticket</a>
    <!--<![endif]-->
  </td></tr>

  <!-- Footer -->
  <tr><td style="background:linear-gradient(135deg,#1a1a2e 0%,#16213e 50%,#0f3460 100%);padding:20px 32px;text-align:center;">
    <p style="margin:0 0 6px;color:#e2e8f0;font-size:13px;font-weight:600;">${p.companyName}</p>
    <p style="margin:0 0 8px;color:#64748b;font-size:12px;">Sistema de Suporte Técnico</p>
    <div style="height:1px;background:rgba(255,255,255,0.1);margin:8px 0;"></div>
    <p style="margin:0;color:#64748b;font-size:11px;font-style:italic;">Este email foi enviado automaticamente. Por favor, não responda diretamente a esta mensagem.</p>
  </td></tr>

</table>
</td></tr>
</table>
</body></html>`;
}

// ---------- Helpers ----------

function encodeRFC2047(str: string): string {
  const encoded = btoa(String.fromCharCode(...new TextEncoder().encode(str)));
  return `=?UTF-8?B?${encoded}?=`;
}

// ---------- SMTP sender ----------

async function sendSmtpEmail(
  host: string, port: number, user: string, password: string,
  fromName: string, to: string, subject: string, body: string, isHtml: boolean
) {
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  let conn: Deno.TlsConn;
  if (port === 465) {
    conn = await Deno.connectTls({ hostname: host, port });
  } else {
    const plain = await Deno.connect({ hostname: host, port });
    const b = new Uint8Array(1024);
    await plain.read(b);
    await plain.write(encoder.encode("EHLO localhost\r\n"));
    const eb = new Uint8Array(2048);
    await plain.read(eb);
    await plain.write(encoder.encode("STARTTLS\r\n"));
    const sb = new Uint8Array(1024);
    await plain.read(sb);
    conn = await Deno.startTls(plain, { hostname: host });
  }

  const readResp = async () => {
    const b = new Uint8Array(2048);
    const n = await conn.read(b);
    return decoder.decode(b.subarray(0, n || 0));
  };

  if (port === 465) await readResp();
  await conn.write(encoder.encode("EHLO localhost\r\n"));
  await readResp();
  await conn.write(encoder.encode("AUTH LOGIN\r\n"));
  await readResp();
  await conn.write(encoder.encode(btoa(user) + "\r\n"));
  await readResp();
  await conn.write(encoder.encode(btoa(password) + "\r\n"));
  const authResp = await readResp();
  if (!authResp.startsWith("235")) {
    conn.close();
    throw new Error("SMTP auth failed");
  }

  await conn.write(encoder.encode(`MAIL FROM:<${user}>\r\n`));
  await readResp();
  await conn.write(encoder.encode(`RCPT TO:<${to}>\r\n`));
  await readResp();
  await conn.write(encoder.encode("DATA\r\n"));
  await readResp();

  const contentType = isHtml ? "text/html; charset=utf-8" : "text/plain; charset=utf-8";
  const encodedSubject = encodeRFC2047(subject);
  const encodedFromName = encodeRFC2047(fromName);
  const msg = `From: ${encodedFromName} <${user}>\r\nTo: <${to}>\r\nSubject: ${encodedSubject}\r\nMIME-Version: 1.0\r\nContent-Type: ${contentType}\r\nContent-Transfer-Encoding: 8bit\r\n\r\n${body}\r\n.\r\n`;
  await conn.write(encoder.encode(msg));
  await readResp();
  await conn.write(encoder.encode("QUIT\r\n"));
  conn.close();
}

// ---------- Main handler ----------

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    console.log("notify-ticket-update called:", JSON.stringify({ ticket_id: body.ticket_id, type: body.notification_type }));
    const {
      ticket_id, sender_id, message, is_internal,
      notification_type, priority_label, resolution_summary, pdf_url,
    } = body;

    // Don't notify for internal notes
    if (is_internal) {
      return new Response(JSON.stringify({ success: true, skipped: "internal" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Fetch ticket data with equipment type
    const { data: ticket } = await supabaseAdmin
      .from("tickets")
      .select("ticket_number, title, client_id, assigned_to, priority, equipment_type_id")
      .eq("id", ticket_id)
      .single();

    if (!ticket) {
      return new Response(JSON.stringify({ error: "Ticket not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
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

    // Priority label
    const priorityLabels: Record<string, string> = { low: "Baixa", medium: "Média", high: "Alta", urgent: "Urgente" };
    const priority = priority_label || priorityLabels[ticket.priority] || "Média";

    // Collect recipient IDs (excluding sender)
    const recipientIds = new Set<string>();

    // Find users linked to this client (client_id now references clients table, not auth users)
    if (ticket.client_id) {
      const { data: linkedUsers } = await supabaseAdmin
        .from("profiles")
        .select("id")
        .eq("parent_client_id", ticket.client_id);
      if (linkedUsers) {
        for (const u of linkedUsers) {
          if (u.id !== sender_id) recipientIds.add(u.id);
        }
      }
    }

    if (ticket.assigned_to && ticket.assigned_to !== sender_id) recipientIds.add(ticket.assigned_to);

    const { data: adminRoles } = await supabaseAdmin
      .from("user_roles")
      .select("user_id")
      .eq("role", "admin");

    if (adminRoles) {
      for (const r of adminRoles) {
        if (r.user_id !== sender_id) recipientIds.add(r.user_id);
      }
    }

    if (recipientIds.size === 0) {
      console.log("No recipients found, skipping");
      return new Response(JSON.stringify({ success: true, sent: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    console.log("Recipients:", Array.from(recipientIds));

    // Fetch sender name
    const { data: senderProfile } = await supabaseAdmin
      .from("profiles")
      .select("full_name")
      .eq("id", sender_id)
      .single();

    const senderName = senderProfile?.full_name || "Sistema";

    // Fetch recipient emails
    const { data: recipients } = await supabaseAdmin
      .from("profiles")
      .select("id, email, full_name")
      .in("id", Array.from(recipientIds));

    if (!recipients || recipients.length === 0) {
      console.log("No recipients with emails found");
      return new Response(JSON.stringify({ success: true, sent: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    console.log("Sending emails to:", recipients.map(r => r.email));

    // Load SMTP settings
    const { data: settingsData } = await supabaseAdmin.from("system_settings").select("key, value");
    const settings: Record<string, string> = {};
    settingsData?.forEach((s: any) => { settings[s.key] = s.value || ""; });

    const smtpHost = settings.smtp_host;
    const smtpPort = parseInt(settings.smtp_port || "587", 10);
    const smtpUser = settings.smtp_user;
    const smtpPassword = settings.smtp_password;
    const smtpFromName = settings.smtp_from_name || "Sistema";

    if (!smtpHost || !smtpUser || !smtpPassword) {
      console.error("SMTP not configured");
      return new Response(JSON.stringify({ error: "SMTP not configured" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Use app_base_url from settings, fallback to published URL
    const baseUrl = settings.app_base_url || "https://vigilant-web-haven.lovable.app";
    const emailType = notification_type || "ticket_updated";

    const subjectMap: Record<string, string> = {
      ticket_opened: `Novo Chamado #${ticket.ticket_number} - ${ticket.title}`,
      ticket_updated: `Atualização no Chamado #${ticket.ticket_number} - ${ticket.title}`,
      ticket_resolved: `Chamado Resolvido #${ticket.ticket_number} - ${ticket.title}`,
      ticket_closed: `Chamado Encerrado #${ticket.ticket_number} - ${ticket.title}`,
      signature_requested: `Assinatura Solicitada - Chamado #${ticket.ticket_number}`,
    };
    const subject = subjectMap[emailType] || subjectMap.ticket_updated;

    // --- Send Telegram notification (fire-and-forget) ---
    const telegramPromise = (async () => {
      try {
        const telegramUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/notify-telegram`;
        await fetch(telegramUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
          },
          body: JSON.stringify({
            ticket_id,
            notification_type: emailType,
            message,
            sender_name: senderName,
            resolution_summary,
          }),
        });
      } catch (err) {
        console.error("Telegram notification failed:", err);
      }
    })();

    let sent = 0;
    for (const recipient of recipients) {
      try {
        // Check if recipient is a client-linked user (not admin/technician)
        const { data: recipientRoles } = await supabaseAdmin
          .from("user_roles")
          .select("role")
          .eq("user_id", recipient.id);
        const isAdminOrTech = recipientRoles?.some(r => r.role === "admin" || r.role === "technician");
        const ticketLink = isAdminOrTech
          ? `${baseUrl}/admin/tickets/${ticket_id}`
          : `${baseUrl}/helpdesk/tickets/${ticket_id}`;

        const html = buildEmailHtml({
          type: emailType,
          recipientName: recipient.full_name,
          ticketNumber: ticket.ticket_number,
          title: ticket.title,
          category,
          priority,
          message: message || `${senderName} enviou uma atualização.`,
          ticketLink,
          companyName: smtpFromName,
          senderName,
          resolutionSummary: resolution_summary,
        });

        console.log(`Sending SMTP email to ${recipient.email}...`);
        await sendSmtpEmail(smtpHost, smtpPort, smtpUser, smtpPassword, smtpFromName, recipient.email, subject, html, true);
        console.log(`Email sent successfully to ${recipient.email}`);
        sent++;
      } catch (err) {
        console.error(`Failed to send to ${recipient.email}:`, err);
      }
    }

    // --- Send WhatsApp notification (fire-and-forget) ---
    const whatsappPromise = (async () => {
      try {
        const whatsappUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/notify-whatsapp`;
        await fetch(whatsappUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
          },
          body: JSON.stringify({
            ticket_id,
            notification_type: emailType,
            message,
            sender_name: senderName,
            resolution_summary,
            pdf_url,
          }),
        });
      } catch (err) {
        console.error("WhatsApp notification failed:", err);
      }
    })();

    // Wait for both to finish (best-effort)
    await Promise.all([telegramPromise, whatsappPromise]);

    return new Response(JSON.stringify({ success: true, sent }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("notify-ticket-update error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
