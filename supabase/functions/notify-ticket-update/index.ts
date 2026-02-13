import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ---------- HTML Email Builder ----------

interface EmailParams {
  type: "ticket_opened" | "ticket_updated" | "ticket_resolved" | "ticket_closed";
  recipientName: string;
  ticketNumber: number;
  title: string;
  category: string;
  priority: string;
  message: string;
  ticketLink: string;
  companyName: string;
  resolutionSummary?: string;
}

function buildEmailHtml(p: EmailParams): string {
  const themes: Record<string, { heading: string; emoji: string; color: string }> = {
    ticket_opened:   { heading: "Ticket Aberto",      emoji: "🎫", color: "#2563eb" },
    ticket_updated:  { heading: "Ticket Atualizado",   emoji: "🔄", color: "#2563eb" },
    ticket_resolved: { heading: "Ticket Resolvido",    emoji: "✅", color: "#16a34a" },
    ticket_closed:   { heading: "Ticket Encerrado",    emoji: "📁", color: "#6b7280" },
  };

  const theme = themes[p.type] || themes.ticket_updated;

  const priorityColors: Record<string, string> = {
    Baixa: "#22c55e", Média: "#eab308", Alta: "#f97316", Urgente: "#ef4444",
  };
  const priColor = priorityColors[p.priority] || "#6b7280";

  let bodyContent = "";

  if (p.type === "ticket_opened") {
    bodyContent = `
      <p style="margin:0 0 8px;color:#374151;">Olá <strong>${p.recipientName}</strong>,</p>
      <p style="margin:0 0 16px;color:#374151;">Um novo chamado foi aberto:</p>
      <table style="width:100%;border-collapse:collapse;margin-bottom:16px;">
        <tr><td style="padding:8px 12px;background:#f3f4f6;font-weight:600;color:#374151;border:1px solid #e5e7eb;width:140px;">Nº do Ticket</td><td style="padding:8px 12px;border:1px solid #e5e7eb;color:#111827;">#${p.ticketNumber}</td></tr>
        <tr><td style="padding:8px 12px;background:#f3f4f6;font-weight:600;color:#374151;border:1px solid #e5e7eb;">Assunto</td><td style="padding:8px 12px;border:1px solid #e5e7eb;color:#111827;">${p.title}</td></tr>
        ${p.category ? `<tr><td style="padding:8px 12px;background:#f3f4f6;font-weight:600;color:#374151;border:1px solid #e5e7eb;">Categoria</td><td style="padding:8px 12px;border:1px solid #e5e7eb;color:#111827;">${p.category}</td></tr>` : ""}
        <tr><td style="padding:8px 12px;background:#f3f4f6;font-weight:600;color:#374151;border:1px solid #e5e7eb;">Prioridade</td><td style="padding:8px 12px;border:1px solid #e5e7eb;"><span style="background:${priColor};color:#fff;padding:2px 10px;border-radius:12px;font-size:13px;">${p.priority}</span></td></tr>
      </table>`;
  } else if (p.type === "ticket_resolved") {
    bodyContent = `
      <p style="margin:0 0 8px;color:#374151;">Olá <strong>${p.recipientName}</strong>,</p>
      <p style="margin:0 0 16px;color:#374151;">O seu chamado foi resolvido:</p>
      <table style="width:100%;border-collapse:collapse;margin-bottom:16px;">
        <tr><td style="padding:8px 12px;background:#f3f4f6;font-weight:600;color:#374151;border:1px solid #e5e7eb;width:140px;">Nº do Ticket</td><td style="padding:8px 12px;border:1px solid #e5e7eb;color:#111827;">#${p.ticketNumber}</td></tr>
        ${p.category ? `<tr><td style="padding:8px 12px;background:#f3f4f6;font-weight:600;color:#374151;border:1px solid #e5e7eb;">Categoria</td><td style="padding:8px 12px;border:1px solid #e5e7eb;color:#111827;">${p.category}</td></tr>` : ""}
      </table>
      ${p.resolutionSummary ? `<p style="margin:0 0 16px;color:#374151;"><strong>Resumo:</strong> ${p.resolutionSummary}</p>` : ""}`;
  } else if (p.type === "ticket_closed") {
    bodyContent = `
      <p style="margin:0 0 8px;color:#374151;">Olá <strong>${p.recipientName}</strong>,</p>
      <p style="margin:0 0 16px;color:#374151;">O chamado <strong>#${p.ticketNumber} - ${p.title}</strong> foi encerrado.</p>
      ${p.resolutionSummary ? `<p style="margin:0 0 16px;color:#374151;"><strong>Resumo:</strong> ${p.resolutionSummary}</p>` : ""}
      <p style="margin:0 0 16px;color:#374151;">Agradecemos por utilizar nosso suporte. Caso precise de algo mais, não hesite em abrir um novo chamado.</p>`;
  } else {
    // ticket_updated (default)
    bodyContent = `
      <p style="margin:0 0 8px;color:#374151;">Olá <strong>${p.recipientName}</strong>,</p>
      <p style="margin:0 0 16px;color:#374151;">Houve uma atualização no chamado <strong>#${p.ticketNumber} - ${p.title}</strong>:</p>
      <table style="width:100%;border-collapse:collapse;margin-bottom:16px;">
        <tr><td style="padding:8px 12px;background:#f3f4f6;font-weight:600;color:#374151;border:1px solid #e5e7eb;width:140px;">Nº do Ticket</td><td style="padding:8px 12px;border:1px solid #e5e7eb;color:#111827;">#${p.ticketNumber}</td></tr>
        <tr><td style="padding:8px 12px;background:#f3f4f6;font-weight:600;color:#374151;border:1px solid #e5e7eb;">Assunto</td><td style="padding:8px 12px;border:1px solid #e5e7eb;color:#111827;">${p.title}</td></tr>
        ${p.category ? `<tr><td style="padding:8px 12px;background:#f3f4f6;font-weight:600;color:#374151;border:1px solid #e5e7eb;">Categoria</td><td style="padding:8px 12px;border:1px solid #e5e7eb;color:#111827;">${p.category}</td></tr>` : ""}
        <tr><td style="padding:8px 12px;background:#f3f4f6;font-weight:600;color:#374151;border:1px solid #e5e7eb;">Prioridade</td><td style="padding:8px 12px;border:1px solid #e5e7eb;"><span style="background:${priColor};color:#fff;padding:2px 10px;border-radius:12px;font-size:13px;">${p.priority}</span></td></tr>
      </table>
      <div style="background:#f9fafb;border-left:4px solid #2563eb;padding:12px 16px;margin-bottom:16px;color:#374151;">
        ${p.message}
      </div>`;
  }

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:Arial,Helvetica,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:24px 0;">
<tr><td align="center">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">

  <!-- Header -->
  <tr><td style="background:#2563eb;padding:24px 32px;text-align:center;">
    <p style="margin:0;color:#ffffff;font-size:14px;letter-spacing:1px;text-transform:uppercase;">Notificação de Ticket de Suporte</p>
  </td></tr>

  <!-- Emoji Icon -->
  <tr><td style="text-align:center;padding:32px 0 8px;">
    <span style="font-size:56px;">${theme.emoji}</span>
  </td></tr>

  <!-- Title -->
  <tr><td style="text-align:center;padding:0 32px 24px;">
    <h1 style="margin:0;font-size:24px;color:${theme.color};font-weight:700;">${theme.heading}</h1>
  </td></tr>

  <!-- Body -->
  <tr><td style="padding:0 32px 24px;">
    ${bodyContent}
  </td></tr>

  <!-- CTA Button -->
  <tr><td style="padding:0 32px 32px;text-align:center;">
    <a href="${p.ticketLink}" style="display:inline-block;background:#2563eb;color:#ffffff;padding:14px 32px;border-radius:6px;text-decoration:none;font-weight:600;font-size:15px;">Visualizar detalhes do ticket</a>
  </td></tr>

  <!-- Footer -->
  <tr><td style="background:#2563eb;padding:16px 32px;text-align:center;">
    <p style="margin:0;color:#ffffff;font-size:13px;">${p.companyName} · Sistema de Suporte</p>
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
    const {
      ticket_id, sender_id, message, is_internal,
      notification_type, priority_label, resolution_summary,
    } = await req.json();

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
    if (ticket.client_id && ticket.client_id !== sender_id) recipientIds.add(ticket.client_id);
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
      return new Response(JSON.stringify({ success: true, sent: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

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
      return new Response(JSON.stringify({ success: true, sent: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

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

    const baseUrl = Deno.env.get("SUPABASE_URL")?.replace(".supabase.co", ".lovable.app") || "";
    const emailType = notification_type || "ticket_updated";

    const subjectMap: Record<string, string> = {
      ticket_opened: `Novo Chamado #${ticket.ticket_number} - ${ticket.title}`,
      ticket_updated: `Atualização no Chamado #${ticket.ticket_number} - ${ticket.title}`,
      ticket_resolved: `Chamado Resolvido #${ticket.ticket_number} - ${ticket.title}`,
      ticket_closed: `Chamado Encerrado #${ticket.ticket_number} - ${ticket.title}`,
    };
    const subject = subjectMap[emailType] || subjectMap.ticket_updated;

    let sent = 0;
    for (const recipient of recipients) {
      try {
        const isClient = recipient.id === ticket.client_id;
        const ticketLink = isClient
          ? `${baseUrl}/helpdesk/tickets/${ticket_id}`
          : `${baseUrl}/admin/tickets/${ticket_id}`;

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
          resolutionSummary: resolution_summary,
        });

        await sendSmtpEmail(smtpHost, smtpPort, smtpUser, smtpPassword, smtpFromName, recipient.email, subject, html, true);
        sent++;
      } catch (err) {
        console.error(`Failed to send to ${recipient.email}:`, err);
      }
    }

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
