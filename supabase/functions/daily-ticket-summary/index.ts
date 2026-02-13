import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// ---------- SMTP helpers (same as notify-ticket-update) ----------

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

// ---------- HTML builder ----------

interface TicketInfo {
  ticket_number: number;
  title: string;
  assigned_name: string | null;
}

function buildSummaryHtml(
  companyName: string,
  pending: TicketInfo[],
  open: TicketInfo[],
  inProgress: TicketInfo[],
  dashboardUrl: string
): string {
  const now = new Date();
  const dateStr = now.toLocaleDateString("pt-BR", {
    day: "numeric", month: "long", year: "numeric", timeZone: "America/Sao_Paulo",
  });

  const buildTable = (items: TicketInfo[], label: string, color: string) => {
    if (items.length === 0) return "";
    const rows = items.map(t => `
      <tr>
        <td style="padding:10px 16px;border-bottom:1px solid #e5e7eb;color:#374151;font-size:14px;">#${t.ticket_number}</td>
        <td style="padding:10px 16px;border-bottom:1px solid #e5e7eb;color:#374151;font-size:14px;">${t.title}</td>
        <td style="padding:10px 16px;border-bottom:1px solid #e5e7eb;color:#374151;font-size:14px;">${t.assigned_name || "Não atribuído"}</td>
      </tr>`).join("");

    return `
      <tr><td style="padding:24px 32px 8px;">
        <h3 style="margin:0;font-size:16px;color:${color};font-weight:700;">${label} (${items.length})</h3>
      </td></tr>
      <tr><td style="padding:0 32px 16px;">
        <table style="width:100%;border-collapse:collapse;">
          <tr style="background:#f9fafb;">
            <th style="padding:10px 16px;text-align:left;font-size:13px;color:#6b7280;border-bottom:2px solid #e5e7eb;">Ticket</th>
            <th style="padding:10px 16px;text-align:left;font-size:13px;color:#6b7280;border-bottom:2px solid #e5e7eb;">Assunto</th>
            <th style="padding:10px 16px;text-align:left;font-size:13px;color:#6b7280;border-bottom:2px solid #e5e7eb;">Técnico Atribuído</th>
          </tr>
          ${rows}
        </table>
      </td></tr>`;
  };

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:Arial,Helvetica,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:24px 0;">
<tr><td align="center">
<table role="presentation" width="640" cellpadding="0" cellspacing="0" style="max-width:640px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 16px rgba(0,0,0,0.08);">

  <!-- Header -->
  <tr><td style="background:#1e3a5f;padding:28px 32px;text-align:center;">
    <p style="margin:0 0 4px;color:#ffffff;font-size:18px;font-weight:700;letter-spacing:0.5px;">${companyName}</p>
    <p style="margin:0;color:#94a3b8;font-size:13px;">Sistema de Suporte</p>
  </td></tr>

  <!-- Title -->
  <tr><td style="padding:28px 32px 8px;text-align:center;">
    <h1 style="margin:0;font-size:20px;color:#1e293b;font-weight:700;">Resumo Diário de Chamados de Suporte</h1>
    <p style="margin:6px 0 0;color:#64748b;font-size:14px;">${dateStr}</p>
  </td></tr>

  <!-- Overview cards -->
  <tr><td style="padding:20px 32px;">
    <p style="margin:0 0 12px;font-size:14px;color:#64748b;font-weight:600;">Visão Geral:</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td width="33%" style="padding:0 6px 0 0;">
          <div style="background:#fff7ed;border:1px solid #fed7aa;border-radius:10px;padding:20px 12px;text-align:center;">
            <p style="margin:0;font-size:32px;font-weight:800;color:#ea580c;">${pending.length}</p>
            <p style="margin:6px 0 0;font-size:12px;font-weight:700;color:#ea580c;text-transform:uppercase;letter-spacing:1px;">Pendente</p>
          </div>
        </td>
        <td width="33%" style="padding:0 3px;">
          <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:10px;padding:20px 12px;text-align:center;">
            <p style="margin:0;font-size:32px;font-weight:800;color:#2563eb;">${open.length}</p>
            <p style="margin:6px 0 0;font-size:12px;font-weight:700;color:#2563eb;text-transform:uppercase;letter-spacing:1px;">Abertos</p>
          </div>
        </td>
        <td width="33%" style="padding:0 0 0 6px;">
          <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;padding:20px 12px;text-align:center;">
            <p style="margin:0;font-size:32px;font-weight:800;color:#16a34a;">${inProgress.length}</p>
            <p style="margin:6px 0 0;font-size:12px;font-weight:700;color:#16a34a;text-transform:uppercase;letter-spacing:1px;">Em Andamento</p>
          </div>
        </td>
      </tr>
    </table>
  </td></tr>

  <!-- Details -->
  <tr><td style="padding:8px 32px 0;">
    <p style="margin:0;font-size:14px;color:#64748b;font-weight:600;">Detalhes por Categoria:</p>
  </td></tr>

  ${buildTable(inProgress, "Chamados Em Andamento", "#16a34a")}
  ${buildTable(pending, "Chamados Pendentes", "#ea580c")}
  ${buildTable(open, "Chamados Abertos", "#2563eb")}

  <!-- CTA -->
  <tr><td style="padding:24px 32px 32px;text-align:center;">
    <a href="${dashboardUrl}" style="display:inline-block;background:#2563eb;color:#ffffff;padding:14px 36px;border-radius:8px;text-decoration:none;font-weight:700;font-size:15px;">Acessar Dashboard</a>
  </td></tr>

  <!-- Footer -->
  <tr><td style="background:#f8fafc;border-top:1px solid #e2e8f0;padding:16px 32px;text-align:center;">
    <p style="margin:0;color:#94a3b8;font-size:12px;">${companyName} · Sistema de Suporte</p>
  </td></tr>

</table>
</td></tr>
</table>
</body></html>`;
}

// ---------- Main handler ----------

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // 1. Fetch active tickets
    const { data: tickets, error: ticketsErr } = await supabaseAdmin
      .from("tickets")
      .select("ticket_number, title, status, assigned_to")
      .in("status", ["open", "in_progress", "waiting_client"]);

    if (ticketsErr) throw ticketsErr;

    // 2. Collect assigned_to IDs for name lookup
    const assignedIds = [...new Set((tickets || []).filter(t => t.assigned_to).map(t => t.assigned_to!))];
    const techNames: Record<string, string> = {};
    if (assignedIds.length > 0) {
      const { data: profiles } = await supabaseAdmin
        .from("profiles")
        .select("id, full_name")
        .in("id", assignedIds);
      profiles?.forEach(p => { techNames[p.id] = p.full_name; });
    }

    // 3. Group tickets
    const toInfo = (t: any): TicketInfo => ({
      ticket_number: t.ticket_number,
      title: t.title,
      assigned_name: t.assigned_to ? (techNames[t.assigned_to] || "Não atribuído") : null,
    });

    const pending = (tickets || []).filter(t => t.status === "waiting_client").map(toInfo);
    const open = (tickets || []).filter(t => t.status === "open" && !t.assigned_to).map(toInfo);
    const inProgress = (tickets || []).filter(t => t.status === "in_progress" || (t.status === "open" && t.assigned_to)).map(toInfo);

    // 4. Fetch admin users
    const { data: adminRoles } = await supabaseAdmin
      .from("user_roles")
      .select("user_id")
      .eq("role", "admin");

    if (!adminRoles || adminRoles.length === 0) {
      return new Response(JSON.stringify({ success: true, sent: 0, reason: "no admins" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: adminProfiles } = await supabaseAdmin
      .from("profiles")
      .select("id, email, full_name")
      .in("id", adminRoles.map(r => r.user_id));

    if (!adminProfiles || adminProfiles.length === 0) {
      return new Response(JSON.stringify({ success: true, sent: 0, reason: "no admin profiles" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 5. Load SMTP settings
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

    // 6. Build and send
    const baseUrl = Deno.env.get("SUPABASE_URL")?.replace(".supabase.co", ".lovable.app") || "";
    const dashboardUrl = `${baseUrl}/admin/helpdesk`;

    const html = buildSummaryHtml(smtpFromName, pending, open, inProgress, dashboardUrl);
    const subject = `Resumo Diário de Chamados - ${new Date().toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })}`;

    let sent = 0;
    for (const admin of adminProfiles) {
      try {
        await sendSmtpEmail(smtpHost, smtpPort, smtpUser, smtpPassword, smtpFromName, admin.email, subject, html);
        sent++;
      } catch (err) {
        console.error(`Failed to send to ${admin.email}:`, err);
      }
    }

    console.log(`Daily summary sent to ${sent}/${adminProfiles.length} admins`);
    return new Response(JSON.stringify({ success: true, sent, total: pending.length + open.length + inProgress.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("daily-ticket-summary error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
