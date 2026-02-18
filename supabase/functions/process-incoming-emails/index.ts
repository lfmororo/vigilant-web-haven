import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function generatePassword(length = 12): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%&*";
  const arr = new Uint8Array(length);
  crypto.getRandomValues(arr);
  return Array.from(arr, (b) => chars[b % chars.length]).join("");
}

function extractEmail(from: string): string {
  const match = from.match(/<([^>]+)>/);
  if (match) return match[1].trim().toLowerCase();
  return from.trim().toLowerCase();
}

function extractName(from: string): string {
  const match = from.match(/^"?([^"<]+)"?\s*</);
  if (match) return match[1].trim();
  return extractEmail(from).split("@")[0];
}

function decodeMimeWord(str: string): string {
  return str.replace(/=\?([^?]+)\?(Q|B)\?([^?]+)\?=/gi, (_, charset, encoding, encoded) => {
    if (encoding.toUpperCase() === "B") {
      return new TextDecoder(charset).decode(
        Uint8Array.from(atob(encoded), (c) => c.charCodeAt(0))
      );
    }
    // Quoted-Printable
    const decoded = encoded.replace(/_/g, " ").replace(/=([0-9A-Fa-f]{2})/g, (_: string, hex: string) =>
      String.fromCharCode(parseInt(hex, 16))
    );
    return decoded;
  });
}

function parseHeaders(headerText: string): Record<string, string> {
  const headers: Record<string, string> = {};
  const lines = headerText.replace(/\r\n\s+/g, " ").split(/\r?\n/);
  for (const line of lines) {
    const idx = line.indexOf(":");
    if (idx > 0) {
      const key = line.substring(0, idx).trim().toLowerCase();
      const val = line.substring(idx + 1).trim();
      headers[key] = val;
    }
  }
  return headers;
}

function stripHtml(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<\/div>/gi, "\n")
    .replace(/<\/tr>/gi, "\n")
    .replace(/<\/li>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function decodeQuotedPrintable(str: string, charset = "utf-8"): string {
  // Remove soft line breaks (= at end of line)
  const cleaned = str.replace(/=\r?\n/g, "");
  // Decode =XX hex sequences into bytes
  const bytes: number[] = [];
  for (let i = 0; i < cleaned.length; i++) {
    if (cleaned[i] === "=" && i + 2 < cleaned.length) {
      const hex = cleaned.substring(i + 1, i + 3);
      if (/^[0-9A-Fa-f]{2}$/.test(hex)) {
        bytes.push(parseInt(hex, 16));
        i += 2;
        continue;
      }
    }
    bytes.push(cleaned.charCodeAt(i));
  }
  try {
    return new TextDecoder(charset.toLowerCase().replace("iso-8859-1", "latin1")).decode(new Uint8Array(bytes));
  } catch {
    return new TextDecoder("utf-8", { fatal: false }).decode(new Uint8Array(bytes));
  }
}

function decodeBase64Content(str: string, charset = "utf-8"): string {
  try {
    const cleaned = str.replace(/\s/g, "");
    const binary = atob(cleaned);
    const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
    return new TextDecoder(charset.toLowerCase().replace("iso-8859-1", "latin1")).decode(bytes);
  } catch {
    return str;
  }
}

function cleanMimeArtifacts(text: string): string {
  // Remove MIME boundary markers (e.g. --000000000000999ebf064acd25d1)
  let cleaned = text.replace(/--[a-zA-Z0-9_=]+(--)?\s*/g, " ");
  // Remove Content-Type / Content-Transfer-Encoding headers embedded in body
  cleaned = cleaned.replace(/Content-Type:\s*[^\r\n]+/gi, "");
  cleaned = cleaned.replace(/Content-Transfer-Encoding:\s*[^\r\n]+/gi, "");
  cleaned = cleaned.replace(/MIME-Version:\s*[^\r\n]+/gi, "");
  cleaned = cleaned.replace(/charset="?[^"\s;]+"?/gi, "");
  // Strip any remaining HTML tags
  cleaned = cleaned.replace(/<[^>]*>/g, "");
  // Clean HTML entities
  cleaned = cleaned.replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'");
  // Collapse whitespace
  cleaned = cleaned.replace(/\s{2,}/g, " ").trim();
  return cleaned;
}

function parseMimeBody(rawBody: string): string {
  // Check if it's a multipart message
  const boundaryParamMatch = rawBody.match(/boundary="?([^"\r\n;]+)"?/i);
  const boundaryLineMatch = rawBody.match(/(------=_[^\r\n\s]+)/);
  
  if (!boundaryParamMatch && !boundaryLineMatch && !rawBody.includes("NextPart") && !rawBody.includes("boundary")) {
    // Not multipart - check for simple QP encoding
    if (rawBody.includes("Content-Transfer-Encoding: quoted-printable")) {
      const parts = rawBody.split(/\r?\n\r?\n/);
      const headerPart = parts[0] || "";
      const bodyPart = parts.slice(1).join("\n\n");
      const charsetMatch = headerPart.match(/charset="?([^"\s;]+)"?/i);
      const charset = charsetMatch ? charsetMatch[1] : "utf-8";
      return decodeQuotedPrintable(bodyPart, charset);
    }
    // Plain text
    if (rawBody.includes("<html") || rawBody.includes("<div") || rawBody.includes("<p")) {
      return stripHtml(rawBody);
    }
    return rawBody;
  }

  // Extract boundary string - prefer the boundary= parameter, fallback to detecting delimiter lines
  let boundary = "";
  if (boundaryParamMatch) {
    boundary = "--" + boundaryParamMatch[1];
  } else if (boundaryLineMatch) {
    // Use the full delimiter line as-is (e.g. ------=_NextPart_000_...)
    boundary = boundaryLineMatch[1];
  }

  // Split by boundary
  const sections = rawBody.split(boundary).filter(s => s.trim() && !s.trim().startsWith("--"));

  let plainText = "";
  let htmlText = "";

  for (const section of sections) {
    const dividerIdx = section.search(/\r?\n\r?\n/);
    if (dividerIdx === -1) continue;

    const sectionHeader = section.substring(0, dividerIdx);
    const sectionBody = section.substring(dividerIdx).replace(/^\r?\n\r?\n/, "");

    // Check if this section is itself multipart (nested)
    if (sectionHeader.toLowerCase().includes("multipart/")) {
      const nestedResult = parseMimeBody(section);
      if (nestedResult) plainText = nestedResult;
      continue;
    }

    const contentTypeMatch = sectionHeader.match(/Content-Type:\s*([^;\r\n]+)/i);
    const contentType = contentTypeMatch ? contentTypeMatch[1].trim().toLowerCase() : "";
    const transferMatch = sectionHeader.match(/Content-Transfer-Encoding:\s*([^\r\n]+)/i);
    const transferEncoding = transferMatch ? transferMatch[1].trim().toLowerCase() : "";
    const charsetMatch = sectionHeader.match(/charset="?([^"\s;]+)"?/i);
    const charset = charsetMatch ? charsetMatch[1] : "utf-8";

    // Skip attachments/images
    if (sectionHeader.toLowerCase().includes("content-disposition: attachment") ||
        contentType.startsWith("image/") ||
        contentType.startsWith("application/")) {
      continue;
    }

    let decoded = sectionBody.replace(/--\s*$/, "").trim();

    if (transferEncoding === "quoted-printable") {
      decoded = decodeQuotedPrintable(decoded, charset);
    } else if (transferEncoding === "base64") {
      decoded = decodeBase64Content(decoded, charset);
    }

    if (contentType.includes("text/plain")) {
      plainText = decoded;
    } else if (contentType.includes("text/html")) {
      htmlText = decoded;
    }
  }

  // Prefer plain text, fallback to stripped HTML
  if (plainText) return plainText.trim();
  if (htmlText) return stripHtml(htmlText);
  return rawBody;
}

async function imapCommand(conn: Deno.TlsConn, tag: string, cmd: string): Promise<string> {
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  await conn.write(encoder.encode(`${tag} ${cmd}\r\n`));

  let fullResponse = "";
  const buf = new Uint8Array(8192);
  
  while (true) {
    const n = await conn.read(buf);
    if (!n) break;
    fullResponse += decoder.decode(buf.subarray(0, n));
    if (fullResponse.includes(`${tag} OK`) || fullResponse.includes(`${tag} NO`) || fullResponse.includes(`${tag} BAD`)) {
      break;
    }
  }
  return fullResponse;
}

function encodeRFC2047(str: string): string {
  const encoded = btoa(String.fromCharCode(...new TextEncoder().encode(str)));
  return `=?UTF-8?B?${encoded}?=`;
}

function buildEmailWrapper(companyName: string, bodyContent: string): string {
  const logoUrl = `${Deno.env.get("SUPABASE_URL")}/storage/v1/object/public/email-assets/fm-techflow-logo.png`;
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:'Segoe UI',Arial,Helvetica,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:32px 0;">
<tr><td align="center">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
  <tr><td style="background:linear-gradient(135deg,#1a1a2e 0%,#16213e 50%,#0f3460 100%);padding:28px 32px;text-align:center;">
    <img src="${logoUrl}" alt="${companyName}" style="height:44px;max-width:200px;" />
    <p style="margin:8px 0 0;color:#94a3b8;font-size:11px;letter-spacing:1.5px;text-transform:uppercase;font-weight:600;">Sistema de Suporte</p>
  </td></tr>
  <tr><td style="padding:28px 32px;">${bodyContent}</td></tr>
  <tr><td style="padding:0 32px;"><div style="height:1px;background:linear-gradient(to right,transparent,#e2e8f0,transparent);"></div></td></tr>
  <tr><td style="background:linear-gradient(135deg,#1a1a2e 0%,#16213e 50%,#0f3460 100%);padding:20px 32px;text-align:center;">
    <p style="margin:0 0 6px;color:#e2e8f0;font-size:13px;font-weight:600;">${companyName}</p>
    <p style="margin:0 0 8px;color:#64748b;font-size:12px;">Sistema de Suporte Técnico</p>
    <div style="height:1px;background:rgba(255,255,255,0.1);margin:8px 0;"></div>
    <p style="margin:0;color:#64748b;font-size:11px;font-style:italic;">Este email foi enviado automaticamente. Por favor, não responda diretamente.</p>
  </td></tr>
</table>
</td></tr>
</table>
</body></html>`;
}

function buildWelcomeEmailHtml(companyName: string, name: string, email: string, password: string, loginUrl: string): string {
  const body = `
    <div style="text-align:center;margin-bottom:24px;">
      <span style="font-size:48px;">🎉</span>
      <h1 style="margin:10px 0 0;font-size:22px;color:#2563eb;font-weight:800;">Bem-vindo ao Sistema de Suporte!</h1>
    </div>
    <p style="margin:0 0 16px;color:#334155;font-size:15px;line-height:1.6;">Olá <strong>${name}</strong>,</p>
    <p style="margin:0 0 20px;color:#475569;font-size:15px;line-height:1.6;">Seu chamado foi recebido com sucesso! Foi criada uma conta para você em nosso sistema.</p>
    <table style="width:100%;border-collapse:collapse;border-radius:8px;overflow:hidden;border:1px solid #e2e8f0;margin-bottom:20px;">
      <tr>
        <td style="padding:12px 16px;background:#f8fafc;font-weight:600;color:#475569;border-bottom:1px solid #e2e8f0;width:160px;font-size:14px;">📧 Email</td>
        <td style="padding:12px 16px;border-bottom:1px solid #e2e8f0;color:#1e293b;font-size:14px;">${email}</td>
      </tr>
      <tr>
        <td style="padding:12px 16px;background:#f8fafc;font-weight:600;color:#475569;font-size:14px;">🔑 Senha Provisória</td>
        <td style="padding:12px 16px;color:#1e293b;font-size:14px;font-family:monospace;background:#fffbeb;">${password}</td>
      </tr>
    </table>
    <div style="background:#fff7ed;border:1px solid #fed7aa;border-radius:8px;padding:16px 20px;margin-bottom:24px;">
      <p style="margin:0;color:#c2410c;font-size:14px;line-height:1.5;">⚠️ <strong>Importante:</strong> Altere sua senha no primeiro login por segurança.</p>
    </div>
    <div style="text-align:center;">
      <a href="${loginUrl}" style="display:inline-block;background:linear-gradient(135deg,#2563eb,#7c3aed);color:#ffffff;padding:14px 40px;border-radius:8px;text-decoration:none;font-weight:700;font-size:15px;box-shadow:0 4px 14px rgba(37,99,235,0.35);">Acessar o Sistema</a>
    </div>`;
  return buildEmailWrapper(companyName, body);
}

function buildAdminNewTicketHtml(companyName: string, adminName: string, senderName: string, senderEmail: string, subject: string, description: string, ticketUrl: string): string {
  const descPreview = description.length > 300 ? description.substring(0, 300) + "..." : description;
  const body = `
    <div style="text-align:center;margin-bottom:24px;">
      <span style="font-size:48px;">🎫</span>
      <h1 style="margin:10px 0 0;font-size:22px;color:#2563eb;font-weight:800;">Novo Chamado Recebido por E-mail</h1>
    </div>
    <p style="margin:0 0 16px;color:#334155;font-size:15px;line-height:1.6;">Olá <strong>${adminName}</strong>,</p>
    <p style="margin:0 0 20px;color:#475569;font-size:15px;line-height:1.6;">Um novo chamado foi aberto automaticamente via e-mail:</p>
    <table style="width:100%;border-collapse:collapse;border-radius:8px;overflow:hidden;border:1px solid #e2e8f0;margin-bottom:20px;">
      <tr>
        <td style="padding:12px 16px;background:#f8fafc;font-weight:600;color:#475569;border-bottom:1px solid #e2e8f0;width:140px;font-size:14px;">Cliente</td>
        <td style="padding:12px 16px;border-bottom:1px solid #e2e8f0;color:#1e293b;font-size:14px;">${senderName} (${senderEmail})</td>
      </tr>
      <tr>
        <td style="padding:12px 16px;background:#f8fafc;font-weight:600;color:#475569;font-size:14px;">Assunto</td>
        <td style="padding:12px 16px;color:#1e293b;font-size:14px;">${subject}</td>
      </tr>
    </table>
    <div style="background:#eff6ff;border-left:4px solid #2563eb;border-radius:0 8px 8px 0;padding:16px 20px;margin-bottom:24px;">
      <p style="margin:0 0 6px;font-weight:700;color:#2563eb;font-size:13px;text-transform:uppercase;letter-spacing:0.5px;">Descrição do Chamado</p>
      <p style="margin:0;color:#334155;font-size:14px;line-height:1.6;">${descPreview}</p>
    </div>
    <div style="text-align:center;">
      <a href="${ticketUrl}" style="display:inline-block;background:linear-gradient(135deg,#2563eb,#7c3aed);color:#ffffff;padding:14px 40px;border-radius:8px;text-decoration:none;font-weight:700;font-size:15px;box-shadow:0 4px 14px rgba(37,99,235,0.35);">Visualizar Ticket</a>
    </div>`;
  return buildEmailWrapper(companyName, body);
}

async function sendSmtpEmail(
  host: string, port: number, user: string, password: string,
  fromName: string, to: string, subject: string, body: string, isHtml = false
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // This function can be called by admin (with auth) or by cron (without auth)
    // Use service role for all DB operations
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // If auth header present, verify admin role
    const authHeader = req.headers.get("Authorization");
    if (authHeader?.startsWith("Bearer ")) {
      const supabaseUser = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_ANON_KEY")!,
        { global: { headers: { Authorization: authHeader } } }
      );
      const token = authHeader.replace("Bearer ", "");
      const { data: claimsData, error: claimsError } = await supabaseUser.auth.getClaims(token);
      if (claimsError || !claimsData?.claims) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const userId = claimsData.claims.sub as string;
      const { data: roleData } = await supabaseUser
        .from("user_roles").select("role").eq("user_id", userId).eq("role", "admin").maybeSingle();
      if (!roleData) {
        return new Response(JSON.stringify({ error: "Forbidden" }), {
          status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // Load settings from DB
    const { data: settingsData } = await supabaseAdmin.from("system_settings").select("key, value");
    const settings: Record<string, string> = {};
    settingsData?.forEach((s: any) => { settings[s.key] = s.value || ""; });

    const imapHost = settings.email_imap_host;
    const imapPort = parseInt(settings.email_imap_port || "993", 10);
    const imapUser = settings.email_imap_user;
    const imapPassword = settings.email_imap_password;
    const smtpHost = settings.smtp_host;
    const smtpPort = parseInt(settings.smtp_port || "587", 10);
    const smtpUser = settings.smtp_user;
    const smtpPassword = settings.smtp_password;
    const smtpFromName = settings.smtp_from_name || "Sistema";

    if (!imapHost || !imapUser || !imapPassword) {
      return new Response(
        JSON.stringify({ error: "Configurações IMAP não encontradas" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Connect to IMAP
    const conn = await Deno.connectTls({ hostname: imapHost, port: imapPort });
    
    // Read greeting
    const greetBuf = new Uint8Array(2048);
    await conn.read(greetBuf);

    // Login
    const loginResp = await imapCommand(conn, "a1", `LOGIN "${imapUser}" "${imapPassword}"`);
    if (!loginResp.includes("a1 OK")) {
      conn.close();
      return new Response(
        JSON.stringify({ error: "Falha no login IMAP" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Select INBOX
    await imapCommand(conn, "a2", "SELECT INBOX");

    // Search UNSEEN
    const searchResp = await imapCommand(conn, "a3", "SEARCH UNSEEN");
    const searchLine = searchResp.split("\r\n").find((l) => l.startsWith("* SEARCH"));
    const msgNums = searchLine ? searchLine.replace("* SEARCH", "").trim().split(/\s+/).filter(Boolean) : [];

    let ticketsCreated = 0;
    let usersCreated = 0;
    let repliesAdded = 0;

    const loginUrl = Deno.env.get("SUPABASE_URL")?.replace(".supabase.co", ".lovable.app") || "";

    for (const num of msgNums) {
      try {
        // Fetch headers
        const headerResp = await imapCommand(conn, `b${num}`, `FETCH ${num} BODY[HEADER]`);
        // Fetch body text
        const bodyResp = await imapCommand(conn, `c${num}`, `FETCH ${num} BODY[TEXT]`);

        // Parse headers
        const headerMatch = headerResp.match(/\{(\d+)\}\r\n([\s\S]*?)(?=\r\n[bc]\d+ |\r\n\))/);
        const headerText = headerMatch ? headerMatch[2] : headerResp;
        const headers = parseHeaders(headerText);

        const fromRaw = headers["from"] || "";
        const subjectRaw = headers["subject"] || "Sem assunto";
        const senderEmail = extractEmail(fromRaw);
        const senderName = extractName(fromRaw);
        const subject = decodeMimeWord(subjectRaw);

        // Parse body - handle MIME multipart
        const bodyMatch = bodyResp.match(/\{(\d+)\}\r\n([\s\S]*?)(?=\r\n[bc]\d+ |\r\n\))/);
        let rawBody = bodyMatch ? bodyMatch[2] : bodyResp.split("\r\n").slice(1).join("\r\n");
        let bodyText = parseMimeBody(rawBody);
        // Post-process: strip any remaining MIME artifacts and HTML tags
        bodyText = cleanMimeArtifacts(bodyText);
        bodyText = bodyText.substring(0, 5000); // limit length

        // --- Detect reply to existing ticket ---
        const ticketNumberMatch = subject.match(/#(\d+)/);
        if (ticketNumberMatch) {
          const ticketNumber = parseInt(ticketNumberMatch[1], 10);
          const { data: existingTicket } = await supabaseAdmin
            .from("tickets")
            .select("id, client_id, status, assigned_to, title, priority")
            .eq("ticket_number", ticketNumber)
            .maybeSingle();

          if (existingTicket) {
            // Find sender profile
            const { data: senderProfile } = await supabaseAdmin
              .from("profiles")
              .select("id")
              .eq("email", senderEmail)
              .maybeSingle();

            if (senderProfile) {
              // Add message to existing ticket
              await supabaseAdmin.from("ticket_messages").insert({
                ticket_id: existingTicket.id,
                sender_id: senderProfile.id,
                message: bodyText,
                is_internal: false,
              });

              // Reopen if resolved or closed
              if (existingTicket.status === "resolved" || existingTicket.status === "closed") {
                await supabaseAdmin
                  .from("tickets")
                  .update({ status: "open" })
                  .eq("id", existingTicket.id);
                console.log(`Ticket #${ticketNumber} reopened from ${existingTicket.status}`);
              }

              // Notify via notify-ticket-update edge function
              try {
                const notifyResp = await fetch(
                  `${Deno.env.get("SUPABASE_URL")}/functions/v1/notify-ticket-update`,
                  {
                    method: "POST",
                    headers: {
                      "Content-Type": "application/json",
                      "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
                    },
                    body: JSON.stringify({
                      ticket_id: existingTicket.id,
                      sender_id: senderProfile.id,
                      message: bodyText,
                      is_internal: false,
                      notification_type: "ticket_updated",
                    }),
                  }
                );
                console.log(`Notify reply result: ${notifyResp.status}`);
              } catch (notifyErr) {
                console.error("Error notifying ticket reply:", notifyErr);
              }

              repliesAdded++;
              await imapCommand(conn, `d${num}`, `STORE ${num} +FLAGS (\\Seen)`);
              continue; // Skip new ticket creation
            }
          }
        }

        // --- Normal flow: create new ticket ---

        // Extract email domain for auto-linking
        const emailDomain = senderEmail.split("@")[1];

        // Find client with matching email_domain
        const { data: domainClient } = await supabaseAdmin
          .from("profiles")
          .select("id")
          .eq("email_domain", emailDomain)
          .maybeSingle();

        // Check if client exists
        const { data: existingProfile } = await supabaseAdmin
          .from("profiles")
          .select("id, parent_client_id")
          .eq("email", senderEmail)
          .maybeSingle();

        let clientId: string;

        if (existingProfile) {
          clientId = existingProfile.id;
          // If user exists but has no parent_client_id and we found a domain match, auto-link
          if (!existingProfile.parent_client_id && domainClient) {
            await supabaseAdmin
              .from("profiles")
              .update({ parent_client_id: domainClient.id })
              .eq("id", existingProfile.id);
          }
        } else {
          // Create new user
          const tempPassword = generatePassword();
          const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
            email: senderEmail,
            password: tempPassword,
            email_confirm: true,
          });

          if (createError || !newUser?.user) {
            console.error("Error creating user:", createError);
            continue;
          }

          clientId = newUser.user.id;

          // Create profile, auto-linking to client if domain matches
          await supabaseAdmin.from("profiles").insert({
            id: clientId,
            email: senderEmail,
            full_name: senderName,
            must_change_password: true,
            parent_client_id: domainClient ? domainClient.id : null,
          });

          // Assign client role
          await supabaseAdmin.from("user_roles").insert({
            user_id: clientId,
            role: "client",
          });

          usersCreated++;

          // Send welcome email with temp password via SMTP
          if (smtpHost && smtpUser && smtpPassword) {
            try {
              const baseUrl = settings.app_base_url || "https://vigilant-web-haven.lovable.app";
              const welcomeHtml = buildWelcomeEmailHtml(smtpFromName, senderName, senderEmail, tempPassword, `${baseUrl}/auth`);
              await sendSmtpEmail(
                smtpHost, smtpPort, smtpUser, smtpPassword, smtpFromName,
                senderEmail,
                "Bem-vindo ao Sistema de Suporte",
                welcomeHtml,
                true
              );
            } catch (smtpErr) {
              console.error("Error sending welcome email:", smtpErr);
            }
          }
        }

        // Create ticket
        const { data: newTicket } = await supabaseAdmin.from("tickets").insert({
          client_id: clientId,
          created_by: clientId,
          title: subject,
          description: bodyText,
          priority: "medium",
          status: "open",
        }).select("id").single();

        // Add email body as first message in the ticket
        if (newTicket) {
          await supabaseAdmin.from("ticket_messages").insert({
            ticket_id: newTicket.id,
            sender_id: clientId,
            message: bodyText,
            is_internal: false,
          });
        }

        ticketsCreated++;

        // Send Telegram notification for new ticket (fire-and-forget)
        if (newTicket) {
          try {
            const telegramUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/notify-telegram`;
            const telegramResp = await fetch(telegramUrl, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
              },
              body: JSON.stringify({
                ticket_id: newTicket.id,
                notification_type: "ticket_opened",
                message: bodyText.substring(0, 500),
                sender_name: senderName,
              }),
            });
            console.log(`Telegram notify result: ${telegramResp.status}`);
          } catch (tgErr) {
            console.error("Error sending Telegram notification:", tgErr);
          }
        }

        // Notify admins about new ticket via email
        if (newTicket && smtpHost && smtpUser && smtpPassword) {
          try {
            const { data: adminRoles } = await supabaseAdmin
              .from("user_roles")
              .select("user_id")
              .eq("role", "admin");

            if (adminRoles && adminRoles.length > 0) {
              const adminIds = adminRoles.map((r: any) => r.user_id);
              const { data: adminProfiles } = await supabaseAdmin
                .from("profiles")
                .select("email, full_name")
                .in("id", adminIds);

              const baseUrl = settings.app_base_url || "https://vigilant-web-haven.lovable.app";
              const ticketUrl = `${baseUrl}/admin/tickets/${newTicket.id}`;

              for (const admin of (adminProfiles || [])) {
                try {
                  const adminHtml = buildAdminNewTicketHtml(smtpFromName, admin.full_name, senderName, senderEmail, subject, bodyText, ticketUrl);
                  await sendSmtpEmail(
                    smtpHost, smtpPort, smtpUser, smtpPassword, smtpFromName,
                    admin.email,
                    `Novo chamado recebido por e-mail: ${subject}`,
                    adminHtml,
                    true
                  );
                } catch (adminEmailErr) {
                  console.error(`Error sending admin notification to ${admin.email}:`, adminEmailErr);
                }
              }
            }
          } catch (notifyErr) {
            console.error("Error notifying admins:", notifyErr);
          }
        }

        // Mark email as seen
        await imapCommand(conn, `d${num}`, `STORE ${num} +FLAGS (\\Seen)`);
      } catch (emailErr) {
        console.error(`Error processing email ${num}:`, emailErr);
      }
    }

    // Logout
    await conn.write(new TextEncoder().encode("a9 LOGOUT\r\n"));
    conn.close();

    return new Response(
      JSON.stringify({
        success: true,
        message: `Processamento concluído. ${ticketsCreated} ticket(s) criado(s), ${repliesAdded} resposta(s) adicionada(s), ${usersCreated} usuário(s) novo(s).`,
        tickets_created: ticketsCreated,
        replies_added: repliesAdded,
        users_created: usersCreated,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Process emails error:", error);
    return new Response(
      JSON.stringify({ success: false, error: `Erro: ${error.message}` }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
