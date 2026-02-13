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

function buildTestEmailHtml(companyName: string, host: string, port: string, user: string): string {
  const now = new Date();
  const dateStr = now.toLocaleDateString("pt-BR", { day: "numeric", month: "long", year: "numeric", timeZone: "America/Sao_Paulo" });
  const timeStr = now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit", timeZone: "America/Sao_Paulo" });

  const logoUrl = `${Deno.env.get("SUPABASE_URL")}/storage/v1/object/public/email-assets/fm-techflow-logo.png`;

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:'Segoe UI',Arial,Helvetica,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:32px 0;">
<tr><td align="center">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">

  <!-- Header with gradient + logo -->
  <tr><td style="background:linear-gradient(135deg,#1a1a2e 0%,#16213e 50%,#0f3460 100%);padding:28px 32px;text-align:center;">
    <img src="${logoUrl}" alt="${companyName}" style="height:44px;max-width:200px;" />
    <p style="margin:8px 0 0;color:#94a3b8;font-size:11px;letter-spacing:1.5px;text-transform:uppercase;font-weight:600;">Sistema de Suporte</p>
  </td></tr>

  <!-- Success icon -->
  <tr><td style="background:#f0fdf4;padding:24px 32px;text-align:center;border-bottom:1px solid #e2e8f0;">
    <span style="font-size:48px;line-height:1;">✅</span>
    <h1 style="margin:10px 0 0;font-size:22px;color:#16a34a;font-weight:800;">Teste SMTP Bem-Sucedido!</h1>
  </td></tr>

  <!-- Body -->
  <tr><td style="padding:28px 32px;">
    <p style="margin:0 0 20px;color:#334155;font-size:15px;line-height:1.6;">
      Se você está recebendo esta mensagem, as configurações SMTP do sistema estão funcionando corretamente.
    </p>

    <!-- Info table -->
    <table style="width:100%;border-collapse:collapse;border-radius:8px;overflow:hidden;border:1px solid #e2e8f0;margin-bottom:20px;">
      <tr>
        <td style="padding:12px 16px;background:#f8fafc;font-weight:600;color:#475569;border-bottom:1px solid #e2e8f0;width:140px;font-size:14px;">📅 Data</td>
        <td style="padding:12px 16px;border-bottom:1px solid #e2e8f0;color:#1e293b;font-size:14px;">${dateStr}</td>
      </tr>
      <tr>
        <td style="padding:12px 16px;background:#f8fafc;font-weight:600;color:#475569;border-bottom:1px solid #e2e8f0;font-size:14px;">🕐 Hora</td>
        <td style="padding:12px 16px;border-bottom:1px solid #e2e8f0;color:#1e293b;font-size:14px;">${timeStr}</td>
      </tr>
      <tr>
        <td style="padding:12px 16px;background:#f8fafc;font-weight:600;color:#475569;border-bottom:1px solid #e2e8f0;font-size:14px;">🖥️ Servidor</td>
        <td style="padding:12px 16px;border-bottom:1px solid #e2e8f0;color:#1e293b;font-size:14px;">${host}:${port}</td>
      </tr>
      <tr>
        <td style="padding:12px 16px;background:#f8fafc;font-weight:600;color:#475569;font-size:14px;">📧 Remetente</td>
        <td style="padding:12px 16px;color:#1e293b;font-size:14px;">${user}</td>
      </tr>
    </table>

    <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:16px 20px;">
      <p style="margin:0;color:#1e40af;font-size:14px;line-height:1.5;">
        💡 <strong>Dica:</strong> Este email confirma que o envio de notificações automáticas (abertura, atualização e resolução de chamados) funcionará corretamente.
      </p>
    </div>
  </td></tr>

  <!-- Separator -->
  <tr><td style="padding:0 32px;">
    <div style="height:1px;background:linear-gradient(to right,transparent,#e2e8f0,transparent);"></div>
  </td></tr>

  <!-- Footer -->
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userId = claimsData.claims.sub;

    const { data: roleData } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .eq("role", "admin")
      .maybeSingle();

    if (!roleData) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { host, port, user, password, from_name } = await req.json();

    if (!host || !port || !user || !password) {
      return new Response(
        JSON.stringify({ error: "Todos os campos são obrigatórios" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const portNum = parseInt(port, 10);
    
    // Connect based on port (465 = implicit TLS, 587 = STARTTLS)
    let conn: Deno.TlsConn;
    
    if (portNum === 465) {
      conn = await Deno.connectTls({ hostname: host, port: portNum });
    } else {
      const plainConn = await Deno.connect({ hostname: host, port: portNum });
      const buf = new Uint8Array(1024);
      await plainConn.read(buf);
      
      await plainConn.write(new TextEncoder().encode(`EHLO localhost\r\n`));
      const ehBuf = new Uint8Array(2048);
      await plainConn.read(ehBuf);
      
      await plainConn.write(new TextEncoder().encode(`STARTTLS\r\n`));
      const stBuf = new Uint8Array(1024);
      await plainConn.read(stBuf);
      
      conn = await Deno.startTls(plainConn, { hostname: host });
    }

    // EHLO
    await conn.write(new TextEncoder().encode(`EHLO localhost\r\n`));
    const ehloBuf = new Uint8Array(2048);
    await conn.read(ehloBuf);

    // AUTH LOGIN
    await conn.write(new TextEncoder().encode(`AUTH LOGIN\r\n`));
    const authBuf = new Uint8Array(1024);
    await conn.read(authBuf);

    // Send username (base64)
    await conn.write(new TextEncoder().encode(btoa(user) + "\r\n"));
    const userBuf = new Uint8Array(1024);
    await conn.read(userBuf);

    // Send password (base64)
    await conn.write(new TextEncoder().encode(btoa(password) + "\r\n"));
    const passBuf = new Uint8Array(1024);
    const pn = await conn.read(passBuf);
    const passResponse = new TextDecoder().decode(passBuf.subarray(0, pn || 0));

    if (!passResponse.startsWith("235")) {
      conn.close();
      return new Response(
        JSON.stringify({ success: false, message: "Falha na autenticação SMTP. Verifique usuário e senha." }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Send a test email to the same address
    const senderName = from_name || "Sistema";
    await conn.write(new TextEncoder().encode(`MAIL FROM:<${user}>\r\n`));
    const mfBuf = new Uint8Array(1024);
    await conn.read(mfBuf);

    await conn.write(new TextEncoder().encode(`RCPT TO:<${user}>\r\n`));
    const rcBuf = new Uint8Array(1024);
    await conn.read(rcBuf);

    await conn.write(new TextEncoder().encode(`DATA\r\n`));
    const dBuf = new Uint8Array(1024);
    await conn.read(dBuf);

    const htmlBody = buildTestEmailHtml(senderName, host, port, user);
    const encodedSubject = encodeRFC2047("Teste SMTP - Sistema de Helpdesk");
    const encodedFromName = encodeRFC2047(senderName);

    const emailMsg = `From: ${encodedFromName} <${user}>\r\nTo: <${user}>\r\nSubject: ${encodedSubject}\r\nMIME-Version: 1.0\r\nContent-Type: text/html; charset=utf-8\r\nContent-Transfer-Encoding: 8bit\r\n\r\n${htmlBody}\r\n.\r\n`;
    
    await conn.write(new TextEncoder().encode(emailMsg));
    const eBuf = new Uint8Array(1024);
    const en = await conn.read(eBuf);
    const emailResponse = new TextDecoder().decode(eBuf.subarray(0, en || 0));

    await conn.write(new TextEncoder().encode(`QUIT\r\n`));
    conn.close();

    if (emailResponse.startsWith("250")) {
      return new Response(
        JSON.stringify({ success: true, message: `Conexão SMTP bem-sucedida! Email de teste enviado para ${user}.` }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    } else {
      return new Response(
        JSON.stringify({ success: false, message: `Autenticação OK, mas falha no envio: ${emailResponse.trim()}` }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
  } catch (error) {
    return new Response(
      JSON.stringify({ success: false, message: `Erro ao conectar: ${error.message}` }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
