import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

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
      // For port 587, connect plain first then STARTTLS
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

    const emailBody = `From: "${senderName}" <${user}>\r\nTo: <${user}>\r\nSubject: Teste SMTP - Sistema de Helpdesk\r\nContent-Type: text/plain; charset=utf-8\r\n\r\nEste é um email de teste enviado pelo sistema de helpdesk.\r\nSe você recebeu esta mensagem, as configurações SMTP estão corretas!\r\n.\r\n`;
    
    await conn.write(new TextEncoder().encode(emailBody));
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
