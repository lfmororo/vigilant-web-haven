import { createClient } from "npm:@supabase/supabase-js@2";
import { isServiceRole, denied } from "../_shared/caller.ts";
import { waFetch } from "../_shared/whatsapp.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Só o próprio servidor (outras funções/crons com a service_role) pode chamar.
  if (!isServiceRole(req)) return denied(corsHeaders);

  try {
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Load settings
    const { data: settingsData } = await supabaseAdmin.from("system_settings").select("key, value");
    const settings: Record<string, string> = {};
    settingsData?.forEach((s: any) => { settings[s.key] = s.value || ""; });

    const smtpHost = settings.smtp_host;
    const smtpPort = parseInt(settings.smtp_port || "587", 10);
    const smtpUser = settings.smtp_user;
    const smtpPassword = settings.smtp_password;
    const smtpFromName = settings.smtp_from_name || "Sistema";
    const baseUrl = settings.app_base_url || Deno.env.get("APP_BASE_URL") || "https://vigilant-web-haven.lovable.app";
    const smtpConfigured = !!(smtpHost && smtpUser && smtpPassword);

    // Telegram config
    const telegramToken = Deno.env.get("TELEGRAM_BOT_TOKEN");
    const telegramChatId = Deno.env.get("TELEGRAM_CHAT_ID");
    const telegramEnabled = !!(telegramToken && telegramChatId);

    // WhatsApp config
    const whatsappEnabled = settings.whatsapp_enabled === "true";
    const waApiUrl = settings.whatsapp_api_url;
    const waApiToken = settings.whatsapp_api_token;
    const waConfigured = whatsappEnabled && waApiUrl && waApiToken;

    // Fetch all clients from the clients table (no longer from user_roles)
    const { data: clientRecords } = await supabaseAdmin
      .from("clients")
      .select("id, full_name, email, phone, whatsapp_group_id");

    if (!clientRecords?.length) {
      return new Response(JSON.stringify({ success: true, sent: 0, message: "No clients found" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const clientIds = clientRecords.map(r => r.id);

    // For each client, find linked users (profiles with parent_client_id)
    const { data: allLinkedUsers } = await supabaseAdmin
      .from("profiles")
      .select("id, parent_client_id")
      .in("parent_client_id", clientIds);

    const linkedMap: Record<string, string[]> = {};
    allLinkedUsers?.forEach(u => {
      if (u.parent_client_id) {
        if (!linkedMap[u.parent_client_id]) linkedMap[u.parent_client_id] = [];
        linkedMap[u.parent_client_id].push(u.id);
      }
    });

    // Tickets reference client_id from clients table directly
    // Also include tickets created by linked users (whose client_id matches)
    const allRelevantClientIds = [...new Set(clientIds)];
    
    const { data: allTickets } = await supabaseAdmin
      .from("tickets")
      .select("id, ticket_number, title, status, priority, created_at, updated_at, client_id, assigned_to, equipment_type_id")
      .in("client_id", allRelevantClientIds)
      .order("created_at", { ascending: false });

    if (!allTickets?.length) {
      return new Response(JSON.stringify({ success: true, sent: 0, message: "No tickets" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch technician names
    const techIds = [...new Set(allTickets.filter(t => t.assigned_to).map(t => t.assigned_to!))];
    const techNames: Record<string, string> = {};
    if (techIds.length > 0) {
      const { data: techProfiles } = await supabaseAdmin.from("profiles").select("id, full_name").in("id", techIds);
      techProfiles?.forEach(p => { techNames[p.id] = p.full_name; });
    }

    const logoUrl = `${Deno.env.get("SUPABASE_URL")}/storage/v1/object/public/email-assets/fm-techflow-logo.png`;
    const dateStr = new Date().toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
    const now = Date.now();
    const cutoff24h = now - 24 * 60 * 60 * 1000;

    const statusLabels: Record<string, string> = {
      open: "Aberto",
      in_progress: "Em Andamento",
      waiting_client: "Aguardando Cliente",
      resolved: "Resolvido",
      closed: "Fechado",
    };
    const statusOrder = ["open", "in_progress", "waiting_client", "resolved", "closed"];
    const priorityEmoji: Record<string, string> = {
      low: "🟢", medium: "🟡", high: "🟠", urgent: "🔴",
    };
    const statusColors: Record<string, string> = {
      open: "#3b82f6",
      in_progress: "#f59e0b",
      waiting_client: "#8b5cf6",
      resolved: "#22c55e",
      closed: "#64748b",
    };

    let emailsSent = 0;
    let telegramSent = 0;
    let whatsappSent = 0;

    // First pass: build per-client data, send Telegram summary & WhatsApp (fast HTTP calls)
    let telegramSummary = `📊 *Relatório Semanal de Chamados*\n📅 ${dateStr}\n\n`;

    interface ClientReport {
      client: typeof clientRecords[0];
      myTickets: typeof allTickets;
      grouped: Record<string, typeof allTickets>;
      staleTickets: typeof allTickets;
      totalActive: number;
      totalResolved: number;
    }

    const clientReports: ClientReport[] = [];

    for (const client of clientRecords) {
      // Tickets are now directly linked to client.id via client_id column
      const myTickets = allTickets.filter(t => t.client_id === client.id);
      if (myTickets.length === 0) continue;

      const grouped: Record<string, typeof allTickets> = {};
      for (const t of myTickets) {
        if (!grouped[t.status]) grouped[t.status] = [];
        grouped[t.status].push(t);
      }

      const staleTickets = myTickets.filter(
        t => ["open", "in_progress", "waiting_client"].includes(t.status) &&
          new Date(t.created_at).getTime() < cutoff24h
      );

      const totalActive = myTickets.filter(t => ["open", "in_progress", "waiting_client"].includes(t.status)).length;
      const totalResolved = myTickets.filter(t => ["resolved", "closed"].includes(t.status)).length;

      clientReports.push({ client, myTickets, grouped, staleTickets, totalActive, totalResolved });

      // Telegram summary line
      telegramSummary += `👤 *${client.full_name}*\n`;
      telegramSummary += `   📋 Total: ${myTickets.length} | 🔓 Abertos: ${totalActive} | ✅ Resolvidos: ${totalResolved}\n`;
      if (staleTickets.length > 0) {
        telegramSummary += `   ⚠️ *${staleTickets.length} chamado(s) há +24h*\n`;
      }
      for (const status of statusOrder) {
        const group = grouped[status];
        if (!group || group.length === 0) continue;
        telegramSummary += `   ${statusLabels[status]}: ${group.length}\n`;
      }
      telegramSummary += `\n`;

      // WhatsApp per client (fast HTTP)
      if (waConfigured) {
        let waMsg = `📊 *Relatório Semanal de Chamados*\n📅 ${dateStr}\n\n`;
        waMsg += `👤 *${client.full_name}*\n`;
        waMsg += `📋 Total: ${myTickets.length} | 🔓 Abertos: ${totalActive} | ✅ Resolvidos: ${totalResolved}\n\n`;

        if (staleTickets.length > 0) {
          waMsg += `⚠️ *Atenção: ${staleTickets.length} chamado(s) aberto(s) há mais de 24h:*\n`;
          for (const t of staleTickets) {
            const hoursOpen = Math.floor((now - new Date(t.created_at).getTime()) / (1000 * 60 * 60));
            const daysOpen = Math.floor(hoursOpen / 24);
            waMsg += `   🔴 #${t.ticket_number} - ${t.title} (${daysOpen}d ${hoursOpen % 24}h)\n`;
          }
          waMsg += `\n`;
        }

        for (const status of statusOrder) {
          const group = grouped[status];
          if (!group || group.length === 0) continue;
          waMsg += `*${statusLabels[status]} (${group.length}):*\n`;
          for (const t of group) {
            const pri = priorityEmoji[t.priority] || "⚪";
            waMsg += `   ${pri} #${t.ticket_number} - ${t.title}\n`;
          }
          waMsg += `\n`;
        }
        waMsg += `🔗 ${baseUrl}/helpdesk`;

        const sendUrl = `${waApiUrl.replace(/\/+$/, "")}/send/text`;
        if (client.whatsapp_group_id) {
          try {
            const resp = await waFetch(sendUrl, {
              method: "POST",
              headers: { "Content-Type": "application/json", token: waApiToken },
              body: JSON.stringify({ number: client.whatsapp_group_id, text: waMsg }),
            });
            if (resp.ok) whatsappSent++;
          } catch (err) {
            console.error(`WhatsApp group error for ${client.full_name}:`, err);
          }
        } else if (client.phone) {
          const phone = client.phone.replace(/[\s\-\(\)\+]/g, "");
          if (phone.length >= 10) {
            try {
              const resp = await waFetch(sendUrl, {
                method: "POST",
                headers: { "Content-Type": "application/json", token: waApiToken },
                body: JSON.stringify({ number: phone, text: waMsg }),
              });
              if (resp.ok) whatsappSent++;
            } catch (err) {
              console.error(`WhatsApp error for ${client.full_name}:`, err);
            }
          }
        }
      }
    }

    // Send Telegram summary (fast HTTP - before slow emails)
    if (telegramEnabled && clientReports.length > 0) {
      telegramSummary += `🔗 [Acessar Dashboard](${baseUrl}/admin/helpdesk)`;
      try {
        const resp = await fetch(`https://api.telegram.org/bot${telegramToken}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: telegramChatId,
            text: telegramSummary,
            parse_mode: "Markdown",
            disable_web_page_preview: true,
          }),
        });
        const result = await resp.json();
        if (result.ok) telegramSent = 1;
        else console.error("Telegram weekly report failed:", result);
      } catch (err) {
        console.error("Telegram weekly report error:", err);
      }
    }

    console.log(`Weekly client report: telegram=${telegramSent}, whatsapp=${whatsappSent}. Now sending emails...`);

    // Second pass: send emails (slow SMTP)
    if (smtpConfigured) {
      for (const { client, myTickets, grouped, staleTickets, totalActive, totalResolved } of clientReports) {
        let html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:'Segoe UI',Arial,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:32px 0;">
<tr><td align="center">
<table role="presentation" width="680" cellpadding="0" cellspacing="0" style="max-width:680px;width:100%;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
  <tr><td style="background:linear-gradient(135deg,#1a1a2e 0%,#16213e 50%,#0f3460 100%);padding:28px 32px;text-align:center;">
    <img src="${logoUrl}" alt="${smtpFromName}" style="height:44px;max-width:200px;" />
    <p style="margin:8px 0 0;color:#94a3b8;font-size:11px;letter-spacing:1.5px;text-transform:uppercase;font-weight:600;">Relatório Semanal de Chamados</p>
  </td></tr>
  <tr><td style="padding:28px 32px 12px;">
    <h1 style="margin:0;font-size:22px;color:#1e293b;font-weight:800;">📊 Relatório Semanal</h1>
    <p style="margin:6px 0 0;color:#64748b;font-size:14px;">Olá <strong>${client.full_name}</strong>, confira o resumo dos seus chamados — ${dateStr}</p>
  </td></tr>
  <tr><td style="padding:16px 32px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td style="width:33%;padding:0 6px 0 0;">
          <div style="background:linear-gradient(135deg,#eff6ff,#dbeafe);border:1px solid #bfdbfe;border-radius:12px;padding:16px;text-align:center;">
            <p style="margin:0;font-size:32px;font-weight:800;color:#2563eb;">${myTickets.length}</p>
            <p style="margin:4px 0 0;font-size:11px;font-weight:700;color:#3b82f6;text-transform:uppercase;">Total</p>
          </div>
        </td>
        <td style="width:33%;padding:0 3px;">
          <div style="background:linear-gradient(135deg,#fefce8,#fef9c3);border:1px solid #fde68a;border-radius:12px;padding:16px;text-align:center;">
            <p style="margin:0;font-size:32px;font-weight:800;color:#d97706;">${totalActive}</p>
            <p style="margin:4px 0 0;font-size:11px;font-weight:700;color:#d97706;text-transform:uppercase;">Em Aberto</p>
          </div>
        </td>
        <td style="width:33%;padding:0 0 0 6px;">
          <div style="background:linear-gradient(135deg,#f0fdf4,#dcfce7);border:1px solid #bbf7d0;border-radius:12px;padding:16px;text-align:center;">
            <p style="margin:0;font-size:32px;font-weight:800;color:#16a34a;">${totalResolved}</p>
            <p style="margin:4px 0 0;font-size:11px;font-weight:700;color:#16a34a;text-transform:uppercase;">Resolvidos</p>
          </div>
        </td>
      </tr>
    </table>
  </td></tr>`;

        if (staleTickets.length > 0) {
          html += `
  <tr><td style="padding:8px 32px 16px;">
    <div style="background:linear-gradient(135deg,#fef2f2,#fee2e2);border:1px solid #fecaca;border-radius:12px;padding:16px;">
      <p style="margin:0;font-size:14px;font-weight:700;color:#dc2626;">⚠️ Atenção: ${staleTickets.length} chamado(s) aberto(s) há mais de 24 horas</p>
      <table style="width:100%;border-collapse:collapse;margin-top:12px;">
        <tr style="background:#fef2f2;">
          <th style="padding:8px;text-align:left;font-size:11px;color:#991b1b;border-bottom:1px solid #fecaca;">Ticket</th>
          <th style="padding:8px;text-align:left;font-size:11px;color:#991b1b;border-bottom:1px solid #fecaca;">Assunto</th>
          <th style="padding:8px;text-align:left;font-size:11px;color:#991b1b;border-bottom:1px solid #fecaca;">Tempo</th>
        </tr>`;
          for (const t of staleTickets) {
            const hoursOpen = Math.floor((now - new Date(t.created_at).getTime()) / (1000 * 60 * 60));
            const daysOpen = Math.floor(hoursOpen / 24);
            html += `
        <tr>
          <td style="padding:6px 8px;font-size:12px;font-weight:600;color:#991b1b;border-bottom:1px solid #fecaca;">#${t.ticket_number}</td>
          <td style="padding:6px 8px;font-size:12px;color:#991b1b;border-bottom:1px solid #fecaca;">${t.title}</td>
          <td style="padding:6px 8px;font-size:12px;font-weight:700;color:#dc2626;border-bottom:1px solid #fecaca;">${daysOpen}d ${hoursOpen % 24}h</td>
        </tr>`;
          }
          html += `</table></div></td></tr>`;
        }

        for (const status of statusOrder) {
          const group = grouped[status];
          if (!group || group.length === 0) continue;
          const color = statusColors[status] || "#64748b";
          const label = statusLabels[status] || status;

          html += `
  <tr><td style="padding:12px 32px 4px;">
    <p style="margin:0;font-size:14px;font-weight:700;color:${color};">● ${label} (${group.length})</p>
  </td></tr>
  <tr><td style="padding:0 32px 12px;">
    <table style="width:100%;border-collapse:collapse;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;">
      <tr style="background:#f8fafc;">
        <th style="padding:8px 10px;text-align:left;font-size:11px;color:#64748b;border-bottom:2px solid #e2e8f0;">Ticket</th>
        <th style="padding:8px 10px;text-align:left;font-size:11px;color:#64748b;border-bottom:2px solid #e2e8f0;">Assunto</th>
        <th style="padding:8px 10px;text-align:left;font-size:11px;color:#64748b;border-bottom:2px solid #e2e8f0;">Prioridade</th>
        <th style="padding:8px 10px;text-align:left;font-size:11px;color:#64748b;border-bottom:2px solid #e2e8f0;">Técnico</th>
        <th style="padding:8px 10px;text-align:left;font-size:11px;color:#64748b;border-bottom:2px solid #e2e8f0;">Abertura</th>
      </tr>`;

          for (const t of group) {
            const pri = priorityEmoji[t.priority] || "⚪";
            const tech = t.assigned_to ? (techNames[t.assigned_to] || "N/A") : '<span style="color:#94a3b8;font-style:italic;">Não atribuído</span>';
            const created = new Date(t.created_at).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
            html += `
      <tr>
        <td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;font-size:12px;font-weight:600;color:#334155;">#${t.ticket_number}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;font-size:12px;color:#334155;">${t.title}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;font-size:12px;">${pri}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;font-size:12px;color:#475569;">${tech}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;font-size:12px;color:#475569;">${created}</td>
      </tr>`;
          }
          html += `</table></td></tr>`;
        }

        html += `
  <tr><td style="padding:20px 32px 32px;text-align:center;">
    <a href="${baseUrl}/helpdesk" style="display:inline-block;background:linear-gradient(135deg,#2563eb,#1d4ed8);color:#fff;padding:14px 40px;border-radius:8px;text-decoration:none;font-weight:700;font-size:15px;box-shadow:0 4px 14px rgba(37,99,235,0.35);">Acessar Portal de Suporte</a>
  </td></tr>
  <tr><td style="background:linear-gradient(135deg,#1a1a2e 0%,#16213e 50%,#0f3460 100%);padding:20px 32px;text-align:center;">
    <p style="margin:0;color:#64748b;font-size:11px;font-style:italic;">Relatório semanal automático — ${smtpFromName}</p>
  </td></tr>
</table>
</td></tr></table>
</body></html>`;

        const subject = `📊 Relatório Semanal de Chamados — ${dateStr}`;
        try {
          await sendSmtpEmail(smtpHost, smtpPort, smtpUser, smtpPassword, smtpFromName, client.email, subject, html);
          emailsSent++;
          console.log(`Weekly report email sent to ${client.email}`);
        } catch (err) {
          console.error(`Error sending weekly report to ${client.email}:`, err);
        }
      }
    }

    console.log(`Weekly client report complete: email=${emailsSent}, telegram=${telegramSent}, whatsapp=${whatsappSent}`);
    return new Response(JSON.stringify({ success: true, emails_sent: emailsSent, telegram: telegramSent, whatsapp: whatsappSent }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("weekly-client-report error:", error);
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
