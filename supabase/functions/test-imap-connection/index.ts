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

    // Check admin role
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

    const { host, port, user, password } = await req.json();

    if (!host || !port || !user || !password) {
      return new Response(
        JSON.stringify({ error: "Todos os campos são obrigatórios" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Try to connect to the IMAP server using raw TCP
    const portNum = parseInt(port, 10);
    const conn = await Deno.connectTls({ hostname: host, port: portNum });
    
    // Read server greeting
    const buf = new Uint8Array(1024);
    const n = await conn.read(buf);
    const greeting = new TextDecoder().decode(buf.subarray(0, n || 0));

    if (!greeting.includes("OK")) {
      conn.close();
      return new Response(
        JSON.stringify({ success: false, message: `Servidor respondeu: ${greeting.trim()}` }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Try LOGIN
    const loginCmd = `a1 LOGIN "${user}" "${password}"\r\n`;
    await conn.write(new TextEncoder().encode(loginCmd));

    const loginBuf = new Uint8Array(2048);
    const ln = await conn.read(loginBuf);
    const loginResponse = new TextDecoder().decode(loginBuf.subarray(0, ln || 0));

    // Logout
    await conn.write(new TextEncoder().encode("a2 LOGOUT\r\n"));
    conn.close();

    if (loginResponse.includes("a1 OK")) {
      return new Response(
        JSON.stringify({ success: true, message: "Conexão IMAP bem-sucedida! Login autenticado com sucesso." }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    } else {
      return new Response(
        JSON.stringify({ success: false, message: "Falha na autenticação IMAP. Verifique usuário e senha." }),
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
