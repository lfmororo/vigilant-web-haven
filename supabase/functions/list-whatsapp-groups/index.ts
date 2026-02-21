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
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: settingsData } = await supabaseAdmin
      .from("system_settings")
      .select("key, value");

    const settings: Record<string, string> = {};
    settingsData?.forEach((s: any) => {
      settings[s.key] = s.value || "";
    });

    const apiUrl = settings.whatsapp_api_url;
    const apiToken = settings.whatsapp_api_token;

    if (!apiUrl || !apiToken) {
      return new Response(
        JSON.stringify({ error: "WhatsApp API não configurada. Configure a URL e Token nas Configurações do Sistema." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const baseUrl = apiUrl.replace(/\/+$/, "");

    // Try multiple common endpoints for listing groups (GET and POST)
    const attempts = [
      { endpoint: "/chat/chats", method: "GET" },
      { endpoint: "/chat/chats", method: "POST" },
      { endpoint: "/chat/fetchAllGroups", method: "GET" },
      { endpoint: "/chat/fetchAllGroups", method: "POST" },
      { endpoint: "/chat/groups", method: "GET" },
      { endpoint: "/group/fetchAllGroups", method: "GET" },
      { endpoint: "/groups", method: "GET" },
      { endpoint: "/chats", method: "GET" },
    ];

    for (const { endpoint, method } of attempts) {
      try {
        const resp = await fetch(`${baseUrl}${endpoint}`, {
          method,
          headers: { token: apiToken, "Content-Type": "application/json" },
        });

        if (resp.ok) {
          const data = await resp.json();
          console.log(`WhatsApp groups found via ${endpoint}`);
          
          // Normalize the response - extract groups array from various formats
          let groups: Array<{ id: string; name: string }> = [];
          
          const rawList = Array.isArray(data) ? data : (data?.groups || data?.data || data?.chats || []);
          
          for (const item of rawList) {
            // Only include groups (id ends with @g.us)
            const id = item.id?._serialized || item.id || item.jid || "";
            const name = item.name || item.subject || item.groupName || id;
            if (typeof id === "string" && id.includes("@g.us")) {
              groups.push({ id, name });
            }
          }

          return new Response(JSON.stringify({ groups }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        } else {
          const text = await resp.text();
          console.log(`Endpoint ${endpoint} returned ${resp.status}: ${text}`);
        }
      } catch (err) {
        console.log(`Endpoint ${endpoint} failed:`, err);
      }
    }

    return new Response(
      JSON.stringify({ 
        error: "Não foi possível listar os grupos. Nenhum endpoint compatível encontrado. Verifique a documentação da sua API WhatsApp ou informe o endpoint correto.",
        tried: attempts.map(a => `${a.method} ${baseUrl}${a.endpoint}`)
      }),
      { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("list-whatsapp-groups error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
