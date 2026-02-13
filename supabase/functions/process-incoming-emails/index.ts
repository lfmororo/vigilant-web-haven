import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .trim();
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

  if (port === 465) await readResp(); // greeting
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

  const msg = `From: "${fromName}" <${user}>\r\nTo: <${to}>\r\nSubject: ${subject}\r\nContent-Type: text/plain; charset=utf-8\r\n\r\n${body}\r\n.\r\n`;
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

        // Parse body
        const bodyMatch = bodyResp.match(/\{(\d+)\}\r\n([\s\S]*?)(?=\r\n[bc]\d+ |\r\n\))/);
        let bodyText = bodyMatch ? bodyMatch[2] : bodyResp.split("\r\n").slice(1).join("\r\n");
        // Strip HTML if needed
        if (bodyText.includes("<html") || bodyText.includes("<div") || bodyText.includes("<p")) {
          bodyText = stripHtml(bodyText);
        }
        bodyText = bodyText.substring(0, 5000); // limit length

        // Check if client exists
        const { data: existingProfile } = await supabaseAdmin
          .from("profiles")
          .select("id")
          .eq("email", senderEmail)
          .maybeSingle();

        let clientId: string;

        if (existingProfile) {
          clientId = existingProfile.id;
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

          // Create profile
          await supabaseAdmin.from("profiles").insert({
            id: clientId,
            email: senderEmail,
            full_name: senderName,
            must_change_password: true,
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
              await sendSmtpEmail(
                smtpHost, smtpPort, smtpUser, smtpPassword, smtpFromName,
                senderEmail,
                "Bem-vindo ao Sistema de Suporte",
                `Olá ${senderName},\n\nSeu chamado foi recebido com sucesso!\n\nFoi criada uma conta para você em nosso sistema de suporte.\n\nSeus dados de acesso:\nEmail: ${senderEmail}\nSenha provisória: ${tempPassword}\n\nAcesse o sistema e altere sua senha no primeiro login.\n\nAtenciosamente,\n${smtpFromName}`
              );
            } catch (smtpErr) {
              console.error("Error sending welcome email:", smtpErr);
            }
          }
        }

        // Create ticket
        const { data: newTicket } = await supabaseAdmin.from("tickets").insert({
          client_id: clientId,
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
        message: `Processamento concluído. ${ticketsCreated} ticket(s) criado(s), ${usersCreated} usuário(s) novo(s).`,
        tickets_created: ticketsCreated,
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
