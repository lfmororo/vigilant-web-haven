import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function escapeMarkdownV2(text: string): string {
  return text.replace(/([_*\[\]()~`>#+\-=|{}.!\\])/g, "\\$1");
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

    // Fetch tickets open/in_progress for more than 24 hours
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const { data: staleTickets, error } = await supabaseAdmin
      .from("tickets")
      .select("id, ticket_number, title, status, priority, client_id, assigned_to, created_at, equipment_type_id")
      .in("status", ["open", "in_progress", "waiting_client"])
      .lt("created_at", cutoff)
      .order("created_at", { ascending: true });

    if (error) throw error;
    if (!staleTickets || staleTickets.length === 0) {
      console.log("No stale tickets found");
      return new Response(JSON.stringify({ success: true, stale: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch assigned technician names
    const assignedIds = [...new Set(staleTickets.filter(t => t.assigned_to).map(t => t.assigned_to!))];
    const techNames: Record<string, string> = {};
    if (assignedIds.length > 0) {
      const { data: profiles } = await supabaseAdmin
        .from("profiles")
        .select("id, full_name")
        .in("id", assignedIds);
      profiles?.forEach(p => { techNames[p.id] = p.full_name; });
    }

    // Fetch client names
    const clientIds = [...new Set(staleTickets.filter(t => t.client_id).map(t => t.client_id!))];
    const clientNames: Record<string, string> = {};
    if (clientIds.length > 0) {
      const { data: profiles } = await supabaseAdmin
        .from("profiles")
        .select("id, full_name")
        .in("id", clientIds);
      profiles?.forEach(p => { clientNames[p.id] = p.full_name; });
    }

    // Load settings
    const { data: settingsData } = await supabaseAdmin.from("system_settings").select("key, value");
    const settings: Record<string, string> = {};
    settingsData?.forEach((s: any) => { settings[s.key] = s.value || ""; });

    const baseUrl = settings.app_base_url || "https://vigilant-web-haven.lovable.app";

    // Calculate hours open for each ticket
    const now = Date.now();
    const ticketsWithAge = staleTickets.map(t => {
      const hoursOpen = Math.floor((now - new Date(t.created_at).getTime()) / (1000 * 60 * 60));
      const daysOpen = Math.floor(hoursOpen / 24);
      return { ...t, hoursOpen, daysOpen };
    });

    const priorityEmoji: Record<string, string> = {
      low: "🟢", medium: "🟡", high: "🟠", urgent: "🔴",
    };
    const statusLabels: Record<string, string> = {
      open: "Aberto", in_progress: "Em Andamento", waiting_client: "Aguardando Cliente",
    };

    // ---- TELEGRAM NOTIFICATION ----
    let telegramSent = false;
    const telegramToken = Deno.env.get("TELEGRAM_BOT_TOKEN");
    const telegramChatId = Deno.env.get("TELEGRAM_CHAT_ID");

    if (telegramToken && telegramChatId) {
      try {
        let tgMsg = `⏰ *Alerta: Chamados Abertos há mais de 24h*\n\n`;
        tgMsg += `📋 *Total:* ${ticketsWithAge.length} chamado(s)\n\n`;

        for (const t of ticketsWithAge) {
          const pri = priorityEmoji[t.priority] || "⚪";
          const tech = t.assigned_to ? (techNames[t.assigned_to] || "N/A") : "Não atribuído";
          const client = t.client_id ? (clientNames[t.client_id] || "N/A") : "N/A";
          const status = statusLabels[t.status] || t.status;

          tgMsg += `${pri} *#${t.ticket_number}* - ${t.title}\n`;
          tgMsg += `   👤 Cliente: ${client}\n`;
          tgMsg += `   🔧 Técnico: ${tech}\n`;
          tgMsg += `   📌 Status: ${status}\n`;
          tgMsg += `   ⏱️ Aberto há: *${t.daysOpen} dia(s)* (${t.hoursOpen}h)\n\n`;
        }

        tgMsg += `[Acessar Dashboard](${baseUrl}/admin/helpdesk)`;

        const resp = await fetch(`https://api.telegram.org/bot${telegramToken}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: telegramChatId,
            text: tgMsg,
            parse_mode: "Markdown",
            disable_web_page_preview: true,
          }),
        });
        const result = await resp.json();
        telegramSent = result.ok === true;
        if (!telegramSent) console.error("Telegram send failed:", result);
      } catch (err) {
        console.error("Telegram stale alert error:", err);
      }
    }

    // ---- WHATSAPP NOTIFICATION ----
    let whatsappSent = 0;
    const whatsappEnabled = settings.whatsapp_enabled === "true";
    const apiUrl = settings.whatsapp_api_url;
    const apiToken = settings.whatsapp_api_token;

    if (whatsappEnabled && apiUrl && apiToken) {
      // Build WhatsApp message
      let waMsg = `⏰ *Alerta: Chamados Abertos há mais de 24h*\n\n`;
      waMsg += `📋 *Total:* ${ticketsWithAge.length} chamado(s)\n\n`;

      for (const t of ticketsWithAge) {
        const pri = priorityEmoji[t.priority] || "⚪";
        const tech = t.assigned_to ? (techNames[t.assigned_to] || "N/A") : "Não atribuído";
        const client = t.client_id ? (clientNames[t.client_id] || "N/A") : "N/A";
        const status = statusLabels[t.status] || t.status;

        waMsg += `${pri} *#${t.ticket_number}* - ${t.title}\n`;
        waMsg += `   👤 Cliente: ${client}\n`;
        waMsg += `   🔧 Técnico: ${tech}\n`;
        waMsg += `   📌 Status: ${status}\n`;
        waMsg += `   ⏱️ Aberto há: *${t.daysOpen} dia(s)* (${t.hoursOpen}h)\n\n`;
      }

      // Send to admins
      const { data: adminRoles } = await supabaseAdmin
        .from("user_roles")
        .select("user_id")
        .eq("role", "admin");

      if (adminRoles && adminRoles.length > 0) {
        const { data: adminProfiles } = await supabaseAdmin
          .from("profiles")
          .select("id, phone")
          .in("id", adminRoles.map(r => r.user_id));

        const sendUrl = `${apiUrl.replace(/\/+$/, "")}/send/text`;

        for (const admin of adminProfiles || []) {
          if (!admin.phone) continue;
          const phone = admin.phone.replace(/[\s\-\(\)\+]/g, "");
          if (phone.length < 10) continue;

          try {
            const resp = await fetch(sendUrl, {
              method: "POST",
              headers: { "Content-Type": "application/json", token: apiToken },
              body: JSON.stringify({ number: phone, text: waMsg }),
            });
            if (resp.ok) whatsappSent++;
          } catch (err) {
            console.error(`WhatsApp stale alert error for ${phone}:`, err);
          }
        }
      }
    }

    // ---- EMAIL NOTIFICATION ----
    let emailSent = 0;
    const smtpHost = settings.smtp_host;
    const smtpPort = parseInt(settings.smtp_port || "587", 10);
    const smtpUser = settings.smtp_user;
    const smtpPassword = settings.smtp_password;
    const smtpFromName = settings.smtp_from_name || "Sistema";

    if (smtpHost && smtpUser && smtpPassword) {
      const logoUrl = `${Deno.env.get("SUPABASE_URL")}/storage/v1/object/public/email-assets/fm-techflow-logo.png`;
      const dateStr = new Date().toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });

      const rows = ticketsWithAge.map(t => {
        const pri = priorityEmoji[t.priority] || "⚪";
        const tech = t.assigned_to ? (techNames[t.assigned_to] || "N/A") : '<span style="color:#94a3b8;font-style:italic;">Não atribuído</span>';
        const client = t.client_id ? (clientNames[t.client_id] || "N/A") : "N/A";
        const status = statusLabels[t.status] || t.status;
        return `<tr>
          <td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;font-size:13px;font-weight:600;color:#334155;">#${t.ticket_number}</td>
          <td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;font-size:13px;color:#334155;">${t.title}</td>
          <td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;font-size:13px;color:#475569;">${client}</td>
          <td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;font-size:13px;color:#475569;">${tech}</td>
          <td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;font-size:13px;color:#475569;">${status}</td>
          <td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;font-size:13px;font-weight:700;color:#dc2626;">${t.daysOpen}d ${t.hoursOpen % 24}h</td>
        </tr>`;
      }).join("");

      const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:'Segoe UI',Arial,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:32px 0;">
<tr><td align="center">
<table role="presentation" width="680" cellpadding="0" cellspacing="0" style="max-width:680px;width:100%;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
  <tr><td style="background:linear-gradient(135deg,#1a1a2e 0%,#16213e 50%,#0f3460 100%);padding:28px 32px;text-align:center;">
    <img src="${logoUrl}" alt="${smtpFromName}" style="height:44px;max-width:200px;" />
    <p style="margin:8px 0 0;color:#94a3b8;font-size:11px;letter-spacing:1.5px;text-transform:uppercase;font-weight:600;">Sistema de Suporte</p>
  </td></tr>
  <tr><td style="padding:28px 32px 8px;text-align:center;">
    <h1 style="margin:0;font-size:22px;color:#1e293b;font-weight:800;">⏰ Alerta: Chamados Abertos há mais de 24h</h1>
    <p style="margin:8px 0 0;color:#64748b;font-size:14px;">${dateStr} — ${ticketsWithAge.length} chamado(s) pendente(s)</p>
  </td></tr>
  <tr><td style="padding:20px 32px;">
    <div style="background:linear-gradient(135deg,#fef2f2,#fee2e2);border:1px solid #fecaca;border-radius:12px;padding:20px;text-align:center;">
      <p style="margin:0;font-size:42px;font-weight:800;color:#dc2626;">${ticketsWithAge.length}</p>
      <p style="margin:6px 0 0;font-size:12px;font-weight:700;color:#dc2626;text-transform:uppercase;letter-spacing:1px;">Chamados Pendentes</p>
    </div>
  </td></tr>
  <tr><td style="padding:0 32px 16px;">
    <table style="width:100%;border-collapse:collapse;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;">
      <tr style="background:#f8fafc;">
        <th style="padding:10px 12px;text-align:left;font-size:11px;color:#64748b;border-bottom:2px solid #e2e8f0;text-transform:uppercase;">Ticket</th>
        <th style="padding:10px 12px;text-align:left;font-size:11px;color:#64748b;border-bottom:2px solid #e2e8f0;text-transform:uppercase;">Assunto</th>
        <th style="padding:10px 12px;text-align:left;font-size:11px;color:#64748b;border-bottom:2px solid #e2e8f0;text-transform:uppercase;">Cliente</th>
        <th style="padding:10px 12px;text-align:left;font-size:11px;color:#64748b;border-bottom:2px solid #e2e8f0;text-transform:uppercase;">Técnico</th>
        <th style="padding:10px 12px;text-align:left;font-size:11px;color:#64748b;border-bottom:2px solid #e2e8f0;text-transform:uppercase;">Status</th>
        <th style="padding:10px 12px;text-align:left;font-size:11px;color:#64748b;border-bottom:2px solid #e2e8f0;text-transform:uppercase;">Tempo</th>
      </tr>
      ${rows}
    </table>
  </td></tr>
  <tr><td style="padding:16px 32px 32px;text-align:center;">
    <a href="${baseUrl}/admin/helpdesk" style="display:inline-block;background:linear-gradient(135deg,#dc2626,#b91c1c);color:#fff;padding:14px 40px;border-radius:8px;text-decoration:none;font-weight:700;font-size:15px;box-shadow:0 4px 14px rgba(220,38,38,0.35);">Acessar Dashboard</a>
  </td></tr>
  <tr><td style="background:linear-gradient(135deg,#1a1a2e 0%,#16213e 50%,#0f3460 100%);padding:20px 32px;text-align:center;">
    <p style="margin:0;color:#64748b;font-size:11px;font-style:italic;">Alerta automático — Chamados abertos há mais de 24 horas</p>
  </td></tr>
</table>
</td></tr></table>
</body></html>`;

      const subject = `⏰ Alerta: ${ticketsWithAge.length} chamado(s) aberto(s) há mais de 24h - ${dateStr}`;

      // Send to admins
      const { data: adminRoles } = await supabaseAdmin
        .from("user_roles")
        .select("user_id")
        .eq("role", "admin");

      if (adminRoles && adminRoles.length > 0) {
        const { data: adminProfiles } = await supabaseAdmin
          .from("profiles")
          .select("email")
          .in("id", adminRoles.map(r => r.user_id));

        for (const admin of adminProfiles || []) {
          try {
            await sendSmtpEmail(smtpHost, smtpPort, smtpUser, smtpPassword, smtpFromName, admin.email, subject, html);
            emailSent++;
          } catch (err) {
            console.error(`Email stale alert error for ${admin.email}:`, err);
          }
        }
      }
    }

    console.log(`Stale ticket alert: ${ticketsWithAge.length} tickets, telegram=${telegramSent}, whatsapp=${whatsappSent}, email=${emailSent}`);
    return new Response(JSON.stringify({
      success: true,
      stale_tickets: ticketsWithAge.length,
      telegram: telegramSent,
      whatsapp: whatsappSent,
      email: emailSent,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("stale-ticket-alert error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

// ---------- SMTP helper ----------

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
