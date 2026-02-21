import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function encodeRFC2047(str: string): string {
  const encoded = btoa(String.fromCharCode(...new TextEncoder().encode(str)));
  return `=?UTF-8?B?${encoded}?=`;
}

async function sendSmtpEmail(
  host: string, port: number, user: string, password: string,
  fromName: string, to: string, subject: string, body: string
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

  const encodedSubject = encodeRFC2047(subject);
  const encodedFromName = encodeRFC2047(fromName);
  const msg = `From: ${encodedFromName} <${user}>\r\nTo: <${to}>\r\nSubject: ${encodedSubject}\r\nMIME-Version: 1.0\r\nContent-Type: text/html; charset=utf-8\r\nContent-Transfer-Encoding: 8bit\r\n\r\n${body}\r\n.\r\n`;
  await conn.write(encoder.encode(msg));
  await readResp();
  await conn.write(encoder.encode("QUIT\r\n"));
  conn.close();
}

function buildSurveyEmail(
  recipientName: string,
  ticketNumber: number,
  ticketTitle: string,
  technicianName: string,
  ratingBaseUrl: string,
  token: string,
  companyName: string
): string {
  const logoUrl = `${Deno.env.get("SUPABASE_URL")}/storage/v1/object/public/email-assets/fm-techflow-logo.png`;

  // Build rating buttons 1-10
  const ratingButtons = Array.from({ length: 10 }, (_, i) => {
    const n = i + 1;
    let bg = "#fee2e2"; let color = "#dc2626"; // 1-3
    if (n >= 4 && n <= 6) { bg = "#fef9c3"; color = "#a16207"; }
    if (n >= 7 && n <= 8) { bg = "#dbeafe"; color = "#2563eb"; }
    if (n >= 9) { bg = "#dcfce7"; color = "#16a34a"; }
    const link = `${ratingBaseUrl}?token=${token}&rating=${n}`;
    return `<td style="padding:4px;"><a href="${link}" style="display:inline-block;width:44px;height:44px;line-height:44px;text-align:center;background:${bg};color:${color};font-size:18px;font-weight:800;border-radius:12px;text-decoration:none;border:2px solid ${color};">${n}</a></td>`;
  }).join("");

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:'Segoe UI',Arial,Helvetica,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:32px 0;">
<tr><td align="center">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">

  <!-- Header -->
  <tr><td style="background:linear-gradient(135deg,#1a1a2e 0%,#16213e 50%,#0f3460 100%);padding:28px 32px;text-align:center;">
    <img src="${logoUrl}" alt="${companyName}" style="height:44px;max-width:200px;" />
    <p style="margin:8px 0 0;color:#94a3b8;font-size:11px;letter-spacing:1.5px;text-transform:uppercase;font-weight:600;">Pesquisa de Satisfação</p>
  </td></tr>

  <!-- Star banner -->
  <tr><td style="background:linear-gradient(135deg,#fef9c3,#fef3c7);padding:24px 32px;text-align:center;border-bottom:1px solid #fde68a;">
    <span style="font-size:48px;">⭐</span>
    <h1 style="margin:8px 0 0;font-size:22px;color:#92400e;font-weight:800;">Como foi seu atendimento?</h1>
  </td></tr>

  <!-- Body -->
  <tr><td style="padding:28px 32px;">
    <p style="margin:0 0 8px;color:#334155;font-size:15px;line-height:1.6;">Olá <strong>${recipientName}</strong>,</p>
    <p style="margin:0 0 20px;color:#475569;font-size:15px;line-height:1.6;">Seu chamado <strong>#${ticketNumber} - ${ticketTitle}</strong> foi encerrado. Gostaríamos de saber como foi a sua experiência!</p>
    
    ${technicianName ? `<p style="margin:0 0 20px;color:#64748b;font-size:14px;">Técnico responsável: <strong style="color:#334155;">${technicianName}</strong></p>` : ""}

    <p style="margin:0 0 12px;color:#334155;font-size:14px;font-weight:600;">Clique na nota que melhor representa sua satisfação:</p>
    
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto 8px;">
      <tr>${ratingButtons}</tr>
    </table>
    <table role="presentation" width="100%" style="margin-bottom:24px;">
      <tr>
        <td style="font-size:11px;color:#94a3b8;text-align:left;padding:0 8px;">Péssimo</td>
        <td style="font-size:11px;color:#94a3b8;text-align:right;padding:0 8px;">Excelente</td>
      </tr>
    </table>

    <div style="background:#eff6ff;border-radius:8px;padding:14px 20px;text-align:center;">
      <p style="margin:0;color:#2563eb;font-size:13px;">💬 Após clicar na nota, você poderá deixar um comentário sobre o atendimento.</p>
    </div>
  </td></tr>

  <!-- Footer -->
  <tr><td style="background:linear-gradient(135deg,#1a1a2e 0%,#16213e 50%,#0f3460 100%);padding:20px 32px;text-align:center;">
    <p style="margin:0 0 6px;color:#e2e8f0;font-size:13px;font-weight:600;">${companyName}</p>
    <p style="margin:0 0 8px;color:#64748b;font-size:12px;">Sua opinião é muito importante para nós</p>
    <div style="height:1px;background:rgba(255,255,255,0.1);margin:8px 0;"></div>
    <p style="margin:0;color:#64748b;font-size:11px;font-style:italic;">Este email foi enviado automaticamente.</p>
  </td></tr>

</table>
</td></tr>
</table>
</body></html>`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { ticket_id } = await req.json();

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Check if rating already exists for this ticket
    const { data: existingRating } = await supabaseAdmin
      .from("ticket_ratings")
      .select("id")
      .eq("ticket_id", ticket_id)
      .maybeSingle();

    if (existingRating) {
      console.log("Rating already exists for ticket", ticket_id);
      return new Response(JSON.stringify({ success: true, skipped: "already_exists" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch ticket
    const { data: ticket } = await supabaseAdmin
      .from("tickets")
      .select("ticket_number, title, client_id, assigned_to, created_by")
      .eq("id", ticket_id)
      .single();

    if (!ticket) {
      return new Response(JSON.stringify({ error: "Ticket not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get technician name
    let technicianName = "";
    if (ticket.assigned_to) {
      const { data: techProfile } = await supabaseAdmin
        .from("profiles")
        .select("full_name")
        .eq("id", ticket.assigned_to)
        .single();
      technicianName = techProfile?.full_name || "";
    }

    // Create rating record with rating=0 (pending)
    const { data: ratingRecord, error: insertError } = await supabaseAdmin
      .from("ticket_ratings")
      .insert({
        ticket_id,
        technician_id: ticket.assigned_to,
        client_id: ticket.client_id,
      rating: null,
    })
    .select("rating_token")
      .single();

    if (insertError) {
      // rating=0 violates CHECK constraint, let me use a workaround
      console.error("Insert error:", insertError);
      return new Response(JSON.stringify({ error: insertError.message }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = ratingRecord.rating_token;

    // Get creator's email (the person who opened the ticket - usually the client user)
    const recipientIds = new Set<string>();
    if (ticket.created_by) recipientIds.add(ticket.created_by);

    // Also get client-linked users
    const { data: clientUsers } = await supabaseAdmin
      .from("profiles")
      .select("id, email, full_name")
      .eq("parent_client_id", ticket.client_id);

    const allRecipients = clientUsers || [];
    if (ticket.created_by && !allRecipients.find(u => u.id === ticket.created_by)) {
      const { data: creatorProfile } = await supabaseAdmin
        .from("profiles")
        .select("id, email, full_name")
        .eq("id", ticket.created_by)
        .single();
      if (creatorProfile) allRecipients.push(creatorProfile);
    }

    // Filter to only client users (not admins/technicians)
    const clientRecipients = [];
    for (const r of allRecipients) {
      const { data: roles } = await supabaseAdmin
        .from("user_roles")
        .select("role")
        .eq("user_id", r.id);
      const isAdminOrTech = roles?.some(role => role.role === "admin" || role.role === "technician");
      if (!isAdminOrTech) clientRecipients.push(r);
    }

    if (clientRecipients.length === 0) {
      console.log("No client recipients found for satisfaction survey");
      return new Response(JSON.stringify({ success: true, skipped: "no_client_recipients" }), {
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

    const ratingBaseUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/submit-rating`;
    const subject = `Avalie seu atendimento - Chamado #${ticket.ticket_number}`;

    let sent = 0;
    for (const recipient of clientRecipients) {
      try {
        const html = buildSurveyEmail(
          recipient.full_name,
          ticket.ticket_number,
          ticket.title,
          technicianName,
          ratingBaseUrl,
          token,
          smtpFromName
        );
        await sendSmtpEmail(smtpHost, smtpPort, smtpUser, smtpPassword, smtpFromName, recipient.email, subject, html);
        console.log(`Satisfaction survey sent to ${recipient.email}`);
        sent++;
      } catch (err) {
        console.error(`Failed to send survey to ${recipient.email}:`, err);
      }
    }

    return new Response(JSON.stringify({ success: true, sent }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("send-satisfaction-survey error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
