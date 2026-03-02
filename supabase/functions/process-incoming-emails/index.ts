import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// --- Utility functions ---

function generatePassword(length = 12): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%&*";
  const arr = new Uint8Array(length);
  crypto.getRandomValues(arr);
  return Array.from(arr, (b) => chars[b % chars.length]).join("");
}

function extractEmail(from: string): string {
  // Decode MIME-encoded words first
  const decoded = from.replace(/=\?([^?]+)\?(Q|B)\?([^?]+)\?=/gi, (_, charset, encoding, encoded) => {
    if (encoding.toUpperCase() === "B") {
      try {
        return new TextDecoder(charset).decode(
          Uint8Array.from(atob(encoded), (c) => c.charCodeAt(0))
        );
      } catch { return encoded; }
    }
    return encoded.replace(/_/g, " ").replace(/=([0-9A-Fa-f]{2})/g, (_: string, hex: string) =>
      String.fromCharCode(parseInt(hex, 16))
    );
  });
  // Try <email> format
  const match = decoded.match(/<([^>]+@[^>]+)>/);
  if (match) return match[1].trim().toLowerCase();
  // Try bare email
  const emailMatch = decoded.match(/[\w.\-+]+@[\w.\-]+\.\w+/);
  if (emailMatch) return emailMatch[0].trim().toLowerCase();
  return decoded.trim().toLowerCase();
}

function extractName(from: string): string {
  const match = from.match(/^\"?([^\"<]+)\"?\s*</);
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
    const decoded = encoded.replace(/_/g, " ").replace(/=([0-9A-Fa-f]{2})/g, (_: string, hex: string) =>
      String.fromCharCode(parseInt(hex, 16))
    );
    return decoded;
  });
}

function parseHeaders(headerText: string): Record<string, string> {
  const headers: Record<string, string> = {};
  // Unfold headers: continuation lines start with whitespace (handles \r\n, \n, tab, spaces)
  const unfolded = headerText.replace(/\r?\n[ \t]+/g, " ");
  const lines = unfolded.split(/\r?\n/);
  for (const line of lines) {
    const idx = line.indexOf(":");
    if (idx > 0) {
      const key = line.substring(0, idx).trim().toLowerCase();
      const val = line.substring(idx + 1).trim();
      // Only keep first occurrence (e.g. first "From:")
      if (!headers[key]) {
        headers[key] = val;
      }
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
  const cleaned = str.replace(/=\r?\n/g, "");
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
  // Remove MIME boundary lines (various formats: ------=_Part, ---- .XXXX, --boundary--, etc.)
  let cleaned = text.replace(/^-{2,}\s*[.\w=]+(--)?\s*$/gm, "");
  // Remove Content-* headers
  cleaned = cleaned.replace(/^Content-Type:\s*[^\r\n]+$/gim, "");
  cleaned = cleaned.replace(/^Content-Transfer-Encoding:\s*[^\r\n]+$/gim, "");
  cleaned = cleaned.replace(/^Content-Disposition:\s*[^\r\n]+$/gim, "");
  cleaned = cleaned.replace(/^MIME-Version:\s*[^\r\n]+$/gim, "");
  cleaned = cleaned.replace(/charset=\"?[^\\"\s;]+\"?/gi, "");
  // Remove mail delivery headers (Reporting-MTA, X-Postfix, Final-Recipient, etc.)
  cleaned = cleaned.replace(/^(Reporting-MTA|X-Postfix-[^:]*|X-Postfix-Sender|Arrival-Date|Final-Recipient|Original-Recipient|Action|Status|Remote-MTA|Diagnostic-Code|Return-Path|X-Original-To|Received|X-LocaWeb-[^:]*|X-Mailer|X-AuthUser|x-locaweb-id|Thread-Index|Message-ID|boundary):\s*[^\r\n]+$/gim, "");
  // Remove lines that look like MIME encoded IDs (long base64-like strings)
  cleaned = cleaned.replace(/^[A-Za-z0-9+/=]{40,}\s*$/gm, "");
  // Remove "name=" lines for attachments
  cleaned = cleaned.replace(/^name="[^"]*"\s*$/gim, "");
  // Remove "This is a multipart message in MIME format." prefix
  cleaned = cleaned.replace(/This is a multipart message in MIME format\.\s*/gi, "");
  // Remove HTML tags
  cleaned = cleaned.replace(/<[^>]*>/g, "");
  // Decode HTML entities
  cleaned = cleaned.replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'");
  // Remove quoted-printable soft line breaks that weren't decoded
  cleaned = cleaned.replace(/=\s*$/gm, "");
  // Decode remaining =XX sequences  
  cleaned = cleaned.replace(/=([0-9A-Fa-f]{2})/g, (_, hex) => {
    try {
      return String.fromCharCode(parseInt(hex, 16));
    } catch {
      return "";
    }
  });
  // Collapse multiple blank lines and spaces
  cleaned = cleaned.replace(/\n{3,}/g, "\n\n").replace(/[ \t]{2,}/g, " ").trim();
  return cleaned;
}

interface EmailAttachment {
  filename: string;
  contentType: string;
  data: Uint8Array;
}

interface ParsedEmail {
  body: string;
  attachments: EmailAttachment[];
}

function parseMimeBodyWithAttachments(rawBody: string): ParsedEmail {
  const attachments: EmailAttachment[] = [];

  const boundaryParamMatch = rawBody.match(/boundary=\"?([^\"\r\n;]+)\"?/i);
  const boundaryLineMatch = rawBody.match(/(--[-]{0,4}\s*[.\w=]+)/);
  
  if (!boundaryParamMatch && !boundaryLineMatch && !rawBody.includes("NextPart") && !rawBody.includes("boundary") && !rawBody.includes("multipart")) {
    if (rawBody.includes("Content-Transfer-Encoding: quoted-printable")) {
      const parts = rawBody.split(/\r?\n\r?\n/);
      const headerPart = parts[0] || "";
      const bodyPart = parts.slice(1).join("\n\n");
      const charsetMatch = headerPart.match(/charset=\"?([^\\"\s;]+)\"?/i);
      const charset = charsetMatch ? charsetMatch[1] : "utf-8";
      return { body: decodeQuotedPrintable(bodyPart, charset), attachments };
    }
    if (rawBody.includes("Content-Transfer-Encoding: base64")) {
      const parts = rawBody.split(/\r?\n\r?\n/);
      const headerPart = parts[0] || "";
      const bodyPart = parts.slice(1).join("\n\n");
      const charsetMatch = headerPart.match(/charset=\"?([^\\"\s;]+)\"?/i);
      const charset = charsetMatch ? charsetMatch[1] : "utf-8";
      return { body: decodeBase64Content(bodyPart, charset), attachments };
    }
    if (rawBody.includes("<html") || rawBody.includes("<div") || rawBody.includes("<p")) {
      return { body: stripHtml(rawBody), attachments };
    }
    let strippedBody = rawBody.replace(
      /Content-(?:Disposition|Type):[^\r\n]*(?:attachment|inline|image\/|application\/)[^\r\n]*[\r\n]+(?:Content-[^\r\n]+[\r\n]+)*[\r\n]*(?:[A-Za-z0-9+/=\s]{20,}[\r\n]*)+/gi,
      ""
    );
    strippedBody = strippedBody.replace(
      /Content-Type:\s*image\/[^\r\n]+[\r\n]+(?:[^\r\n]*[\r\n]+)*?(?:[A-Za-z0-9+/=]{20,}[\r\n]*)+/gi,
      ""
    );
    strippedBody = strippedBody.replace(/(?:^|\n)(?:[A-Za-z0-9+/]{60,}[=]{0,2}\r?\n){3,}/gm, "\n");
    strippedBody = strippedBody.replace(/\n{3,}/g, "\n\n").trim();
    if (strippedBody.length > 0 && strippedBody !== rawBody.trim()) {
      return { body: cleanMimeArtifacts(strippedBody), attachments };
    }
    const lines = rawBody.trim().split(/\r?\n/);
    const base64Lines = lines.filter(l => /^[A-Za-z0-9+/=\s]{20,}$/.test(l.trim()));
    if (base64Lines.length > 0 && base64Lines.length >= lines.length * 0.5) {
      return { body: decodeBase64Content(rawBody, "utf-8"), attachments };
    }
    return { body: rawBody, attachments };
  }

  let boundary = "";
  if (boundaryParamMatch) {
    boundary = "--" + boundaryParamMatch[1];
  } else if (boundaryLineMatch) {
    boundary = boundaryLineMatch[1];
  }

  const sections = rawBody.split(boundary).filter(s => s.trim() && !s.trim().startsWith("--"));

  let plainText = "";
  let htmlText = "";

  for (const section of sections) {
    const dividerIdx = section.search(/\r?\n\r?\n/);
    if (dividerIdx === -1) continue;

    const sectionHeader = section.substring(0, dividerIdx);
    const sectionBody = section.substring(dividerIdx).replace(/^\r?\n\r?\n/, "");

    if (sectionHeader.toLowerCase().includes("multipart/")) {
      const nestedResult = parseMimeBodyWithAttachments(section);
      if (nestedResult.body) plainText = nestedResult.body;
      attachments.push(...nestedResult.attachments);
      continue;
    }

    const contentTypeMatch = sectionHeader.match(/Content-Type:\s*([^;\r\n]+)/i);
    const contentType = contentTypeMatch ? contentTypeMatch[1].trim().toLowerCase() : "";
    const transferMatch = sectionHeader.match(/Content-Transfer-Encoding:\s*([^\r\n]+)/i);
    const transferEncoding = transferMatch ? transferMatch[1].trim().toLowerCase() : "";
    const charsetMatch = sectionHeader.match(/charset=\"?([^\\"\s;]+)\"?/i);
    const charset = charsetMatch ? charsetMatch[1] : "utf-8";

    // Extract image/file attachments
    const isAttachment = sectionHeader.toLowerCase().includes("content-disposition: attachment") ||
                         sectionHeader.toLowerCase().includes("content-disposition: inline");
    const isImage = contentType.startsWith("image/");
    const isFile = contentType.startsWith("application/") && !contentType.includes("text");

    if (isImage || ((isAttachment || isFile) && transferEncoding === "base64")) {
      // Extract filename
      const filenameMatch = sectionHeader.match(/(?:filename|name)=\"?([^\";\r\n]+)\"?/i);
      let filename = filenameMatch ? filenameMatch[1].trim() : "";
      if (!filename && isImage) {
        const ext = contentType.replace("image/", "").replace("jpeg", "jpg");
        filename = `image_${Date.now()}.${ext}`;
      }
      if (!filename) filename = `attachment_${Date.now()}`;

      try {
        const base64Data = sectionBody.replace(/--\s*$/, "").replace(/\s/g, "").trim();
        const binary = atob(base64Data);
        const bytes = Uint8Array.from(binary, c => c.charCodeAt(0));
        // Only save if reasonable size (< 10MB)
        if (bytes.length > 0 && bytes.length < 10 * 1024 * 1024) {
          attachments.push({ filename: decodeMimeWord(filename), contentType, data: bytes });
        }
      } catch (e) {
        console.error("Error decoding attachment:", e);
      }
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

  const body = plainText ? plainText.trim() : (htmlText ? stripHtml(htmlText) : rawBody);
  return { body, attachments };
}

// Keep backward-compatible wrapper
function parseMimeBody(rawBody: string): string {
  return parseMimeBodyWithAttachments(rawBody).body;
}

async function imapCommand(conn: Deno.TlsConn, tag: string, cmd: string): Promise<string> {
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  await conn.write(encoder.encode(`${tag} ${cmd}\r\n`));

  let fullResponse = "";
  const buf = new Uint8Array(32768);
  const maxSize = 512 * 1024; // 512KB safety limit
  
  while (fullResponse.length < maxSize) {
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

// ---- Upload email attachments to storage ----
async function uploadAttachments(
  supabaseAdmin: any,
  ticketId: string,
  attachments: EmailAttachment[]
): Promise<string[]> {
  const urls: string[] = [];
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;

  for (const att of attachments) {
    try {
      const safeName = att.filename.replace(/[^a-zA-Z0-9._-]/g, "_");
      const path = `${ticketId}/${Date.now()}_${safeName}`;
      const { error } = await supabaseAdmin.storage
        .from("ticket-attachments")
        .upload(path, att.data, {
          contentType: att.contentType,
          upsert: false,
        });
      if (error) {
        console.error(`Error uploading attachment ${att.filename}:`, error);
        continue;
      }
      const publicUrl = `${supabaseUrl}/storage/v1/object/public/ticket-attachments/${path}`;
      urls.push(publicUrl);
      console.log(`Uploaded attachment: ${att.filename} -> ${publicUrl}`);
    } catch (e) {
      console.error(`Error uploading attachment ${att.filename}:`, e);
    }
  }
  return urls;
}

// ---- Process a single IMAP account ----
async function processImapAccount(
  account: { id: string; host: string; port: string; username: string; password: string; client_id: string | null; label: string },
  supabaseAdmin: any,
  settings: Record<string, string>
): Promise<{ ticketsCreated: number; repliesAdded: number; usersCreated: number; errors: number }> {
  const result = { ticketsCreated: 0, repliesAdded: 0, usersCreated: 0, errors: 0 };

  const imapHost = account.host;
  const imapPort = parseInt(account.port || "993", 10);
  const imapUser = account.username;
  const imapPassword = account.password;

  if (!imapHost || !imapUser || !imapPassword) {
    console.log(`Skipping account "${account.label}" - incomplete config`);
    return result;
  }

  const smtpHost = settings.smtp_host;
  const smtpPort = parseInt(settings.smtp_port || "587", 10);
  const smtpUser = settings.smtp_user;
  const smtpPassword = settings.smtp_password;
  const smtpFromName = settings.smtp_from_name || "Sistema";

  console.log(`Processing IMAP account: ${account.label} (${imapUser})`);

  const conn = await Deno.connectTls({ hostname: imapHost, port: imapPort });
  
  const greetBuf = new Uint8Array(2048);
  await conn.read(greetBuf);

  const loginResp = await imapCommand(conn, "a1", `LOGIN "${imapUser}" "${imapPassword}"`);
  if (!loginResp.includes("a1 OK")) {
    conn.close();
    console.error(`IMAP login failed for account "${account.label}"`);
    result.errors++;
    return result;
  }

  await imapCommand(conn, "a2", "SELECT INBOX");

  const searchResp = await imapCommand(conn, "a3", "SEARCH UNSEEN");
  const searchLine = searchResp.split("\r\n").find((l) => l.startsWith("* SEARCH"));
  const msgNums = searchLine ? searchLine.replace("* SEARCH", "").trim().split(/\s+/).filter(Boolean) : [];

  console.log(`Account "${account.label}": ${msgNums.length} unseen emails`);

  for (const num of msgNums) {
    try {
      const headerResp = await imapCommand(conn, `b${num}`, `FETCH ${num} BODY[HEADER]`);
      const bodyResp = await imapCommand(conn, `c${num}`, `FETCH ${num} BODY[TEXT]`);

      // More robust header extraction - try multiple patterns
      let headerText = "";
      const headerMatch1 = headerResp.match(/\{(\d+)\}\r\n([\s\S]*?)(?=\r\n[b c]\d+ |\r\n\))/);
      const headerMatch2 = headerResp.match(/\{(\d+)\}\r\n([\s\S]+?)(?:\r\n\)\r\n|\r\nb\d+ OK)/);
      const headerMatch3 = headerResp.match(/BODY\[HEADER\]\s*\{(\d+)\}\r\n([\s\S]+)/);
      
      if (headerMatch1 && headerMatch1[2].includes("From")) {
        headerText = headerMatch1[2];
      } else if (headerMatch2 && headerMatch2[2].includes("From")) {
        headerText = headerMatch2[2];
      } else if (headerMatch3) {
        // Extract by byte count
        const byteCount = parseInt(headerMatch3[1], 10);
        const content = headerMatch3[2];
        headerText = content.substring(0, byteCount);
      } else {
        // Last resort: skip first line (FETCH response line) and use rest
        const lines = headerResp.split("\r\n");
        const startIdx = lines.findIndex(l => /^\{?\d+\}?$/.test(l.trim()) || l.includes("BODY[HEADER]"));
        headerText = lines.slice(startIdx >= 0 ? startIdx + 1 : 1).join("\r\n");
      }
      
      // Debug: always log header extraction details
      const headerLen = headerText.length;
      const hasFrom = headerText.includes("From:") || headerText.includes("from:");
      console.log(`[HEADER-DEBUG] headerText length=${headerLen}, hasFrom=${hasFrom}, first 300 chars: ${headerText.substring(0, 300).replace(/\r?\n/g, "\\n")}`);
      
      if (!hasFrom) {
        console.log(`[DEBUG] Raw headerResp first 500 chars: ${headerResp.substring(0, 500).replace(/\r?\n/g, "\\n")}`);
      }
      
      const headers = parseHeaders(headerText);

      // Log all parsed header keys for debugging
      console.log(`[PARSED-HEADERS] keys: ${Object.keys(headers).join(", ")}`);

      // Fallback: extract From/Subject directly from headerText if parseHeaders missed them
      let fromRaw = headers["from"] || "";
      let subjectRaw = headers["subject"] || "";
      
      if (!fromRaw) {
        const fromMatch = headerText.match(/^From:\s*(.+)$/im);
        if (fromMatch) fromRaw = fromMatch[1].trim();
      }
      if (!subjectRaw) {
        const subjectMatch = headerText.match(/^Subject:\s*(.+)$/im);
        subjectRaw = subjectMatch ? subjectMatch[1].trim() : "Sem assunto";
      }
      if (!subjectRaw) subjectRaw = "Sem assunto";
      
      // If still no From, try Return-Path as last resort
      if (!fromRaw) {
        const rpMatch = headerText.match(/^Return-Path:\s*(.+)$/im);
        if (rpMatch) fromRaw = rpMatch[1].trim();
      }

      const senderEmail = extractEmail(fromRaw);
      const senderName = extractName(fromRaw);
      const subject = decodeMimeWord(subjectRaw);

      console.log(`[EMAIL] From raw: "${fromRaw}" | Parsed: email="${senderEmail}", name="${senderName}" | Subject: "${subject}"`);

      // Skip emails with no valid sender email (do NOT mark as seen so we can retry)
      if (!senderEmail || !senderEmail.includes("@")) {
        console.log(`Skipping email with invalid/empty sender: "${fromRaw}" -> "${senderEmail}"`);
        result.errors++;
        continue;
      }

      // Ignore postmaster/mailer-daemon emails
      const senderLower = senderEmail.toLowerCase();
      if (senderLower.startsWith("postmaster@") || senderLower.startsWith("mailer-daemon@")) {
        console.log(`Ignoring email from ${senderEmail} - marking as seen`);
        await imapCommand(conn, `s${num}`, `STORE ${num} +FLAGS (\\Seen)`);
        continue;
      }

      const bodyMatch = bodyResp.match(/\{(\d+)\}\r\n([\s\S]*?)(?=\r\n[b c]\d+ |\r\n\))/);
      let rawBody = bodyMatch ? bodyMatch[2] : bodyResp.split("\r\n").slice(1).join("\r\n");
      const parsed = parseMimeBodyWithAttachments(rawBody);
      let bodyText = cleanMimeArtifacts(parsed.body);
      bodyText = bodyText.substring(0, 5000);
      const emailAttachments = parsed.attachments;

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
          const { data: senderProfile } = await supabaseAdmin
            .from("profiles")
            .select("id")
            .eq("email", senderEmail)
            .maybeSingle();

          if (senderProfile) {
            // Upload attachments for reply
            let messageText = bodyText;
            if (emailAttachments.length > 0) {
              const attachmentUrls = await uploadAttachments(supabaseAdmin, existingTicket.id, emailAttachments);
              if (attachmentUrls.length > 0) {
                const attachmentLinks = attachmentUrls.map(url => `📎 ${url}`).join("\n");
                messageText = `${bodyText}\n\n${attachmentLinks}`;
              }
            }

            await supabaseAdmin.from("ticket_messages").insert({
              ticket_id: existingTicket.id,
              sender_id: senderProfile.id,
              message: messageText,
              is_internal: false,
            });

            if (existingTicket.status === "resolved" || existingTicket.status === "closed") {
              await supabaseAdmin
                .from("tickets")
                .update({ status: "open" })
                .eq("id", existingTicket.id);
              console.log(`Ticket #${ticketNumber} reopened from ${existingTicket.status}`);
            }

            try {
              await fetch(
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
            } catch (notifyErr) {
              console.error("Error notifying ticket reply:", notifyErr);
            }

            result.repliesAdded++;
            await imapCommand(conn, `d${num}`, `STORE ${num} +FLAGS (\\Seen)`);
            continue;
          }
        }
      }

      // --- Normal flow: create new ticket ---
      const emailDomain = senderEmail.split("@")[1];

      // If account is linked to a client, use that; otherwise auto-detect via domain
      let defaultClientId = account.client_id;

      // Find client by email_domain in clients table (not profiles)
      const { data: domainClient } = await supabaseAdmin
        .from("clients")
        .select("id")
        .eq("email_domain", emailDomain)
        .maybeSingle();

      const { data: existingProfile } = await supabaseAdmin
        .from("profiles")
        .select("id, parent_client_id, is_active")
        .eq("email", senderEmail)
        .maybeSingle();

      // Skip inactive users - ignore their emails
      if (existingProfile && existingProfile.is_active === false) {
        console.log(`Skipping email from inactive user: ${senderEmail}`);
        continue;
      }

      let senderId: string;

      if (existingProfile) {
        senderId = existingProfile.id;
        if (!existingProfile.parent_client_id && (domainClient || defaultClientId)) {
          await supabaseAdmin
            .from("profiles")
            .update({ parent_client_id: domainClient?.id || defaultClientId })
            .eq("id", existingProfile.id);
        }
      } else {
        const tempPassword = generatePassword();
        const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
          email: senderEmail,
          password: tempPassword,
          email_confirm: true,
        });

        if (createError || !newUser?.user) {
          console.error("Error creating user:", createError);
          result.errors++;
          continue;
        }

        senderId = newUser.user.id;

        const parentClientId = domainClient ? domainClient.id : defaultClientId;

        await supabaseAdmin.from("profiles").insert({
          id: senderId,
          email: senderEmail,
          full_name: senderName,
          must_change_password: true,
          parent_client_id: parentClientId,
        });

        await supabaseAdmin.from("user_roles").insert({
          user_id: senderId,
          role: "user",
        });

        result.usersCreated++;

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

      // ticket client_id references the clients table
      // Priority: existing profile's parent_client_id > domain match > account default > "Sem Cliente" fallback
      let ticketClientId = (existingProfile?.parent_client_id) || (domainClient?.id) || defaultClientId;
      
      if (!ticketClientId) {
        // Use "Sem Cliente" fallback so ticket is still created
        const { data: fallbackClient } = await supabaseAdmin
          .from("clients")
          .select("id")
          .eq("full_name", "Sem Cliente")
          .maybeSingle();
        
        if (fallbackClient) {
          ticketClientId = fallbackClient.id;
          console.log(`No client found for email ${senderEmail} - using fallback "Sem Cliente"`);
        } else {
          console.error(`No client found for email ${senderEmail} and no fallback client - skipping ticket creation`);
          result.errors++;
          await imapCommand(conn, `d${num}`, `STORE ${num} +FLAGS (\\Seen)`);
          continue;
        }
      }

      const { data: newTicket } = await supabaseAdmin.from("tickets").insert({
        client_id: ticketClientId,
        created_by: senderId,
        title: subject,
        description: bodyText,
        priority: "medium",
        status: "open",
      }).select("id").single();

      if (newTicket) {
        // Upload attachments for new ticket
        let messageText = bodyText;
        if (emailAttachments.length > 0) {
          const attachmentUrls = await uploadAttachments(supabaseAdmin, newTicket.id, emailAttachments);
          if (attachmentUrls.length > 0) {
            const attachmentLinks = attachmentUrls.map(url => `📎 ${url}`).join("\n");
            messageText = `${bodyText}\n\n${attachmentLinks}`;
          }
        }

        await supabaseAdmin.from("ticket_messages").insert({
          ticket_id: newTicket.id,
          sender_id: senderId,
          message: messageText,
          is_internal: false,
        });
      }

      result.ticketsCreated++;

      if (newTicket) {
        // Use centralized notify-ticket-update which handles email, Telegram, and WhatsApp
        try {
          const notifyUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/notify-ticket-update`;
          const notifyResp = await fetch(notifyUrl, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
            },
            body: JSON.stringify({
              ticket_id: newTicket.id,
              sender_id: senderId,
              message: bodyText.substring(0, 500),
              is_internal: false,
              notification_type: "ticket_opened",
            }),
          });
          console.log(`notify-ticket-update response: ${notifyResp.status}`);
        } catch (notifyErr) {
          console.error("Error calling notify-ticket-update:", notifyErr);
        }
      }

      await imapCommand(conn, `d${num}`, `STORE ${num} +FLAGS (\\Seen)`);
    } catch (emailErr) {
      console.error(`Error processing email ${num}:`, emailErr);
      result.errors++;
    }
  }

  await conn.write(new TextEncoder().encode("a9 LOGOUT\r\n"));
  conn.close();

  // Update last_checked_at
  await supabaseAdmin
    .from("imap_accounts")
    .update({ last_checked_at: new Date().toISOString() })
    .eq("id", account.id);

  return result;
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

    // Load all active IMAP accounts
    const { data: imapAccounts, error: imapError } = await supabaseAdmin
      .from("imap_accounts")
      .select("*")
      .eq("is_active", true);

    if (imapError) {
      console.error("Error loading IMAP accounts:", imapError);
      return new Response(
        JSON.stringify({ error: "Erro ao carregar contas IMAP" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!imapAccounts || imapAccounts.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: "Nenhuma conta IMAP ativa configurada." }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let totalTickets = 0;
    let totalReplies = 0;
    let totalUsers = 0;
    let totalErrors = 0;
    const accountResults: { label: string; tickets: number; replies: number; users: number; errors: number }[] = [];

    for (const account of imapAccounts) {
      try {
        const r = await processImapAccount(account, supabaseAdmin, settings);
        totalTickets += r.ticketsCreated;
        totalReplies += r.repliesAdded;
        totalUsers += r.usersCreated;
        totalErrors += r.errors;
        accountResults.push({
          label: account.label || account.username,
          tickets: r.ticketsCreated,
          replies: r.repliesAdded,
          users: r.usersCreated,
          errors: r.errors,
        });
      } catch (accErr) {
        console.error(`Error processing account "${account.label}":`, accErr);
        totalErrors++;
        accountResults.push({
          label: account.label || account.username,
          tickets: 0, replies: 0, users: 0, errors: 1,
        });
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: `Processamento concluído. ${totalTickets} ticket(s) criado(s), ${totalReplies} resposta(s) adicionada(s), ${totalUsers} usuário(s) novo(s).`,
        tickets_created: totalTickets,
        replies_added: totalReplies,
        users_created: totalUsers,
        errors: totalErrors,
        accounts: accountResults,
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
