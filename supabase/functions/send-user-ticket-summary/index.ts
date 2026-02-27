import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function cleanPhone(phone: string): string {
  return phone.replace(/[\s\-\(\)\+]/g, "");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { user_id, phone } = await req.json();

    if (!user_id || !phone) {
      return new Response(JSON.stringify({ error: "user_id and phone required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Load WhatsApp settings
    const { data: settingsData } = await supabaseAdmin
      .from("system_settings")
      .select("key, value");

    const settings: Record<string, string> = {};
    settingsData?.forEach((s: any) => {
      settings[s.key] = s.value || "";
    });

    const enabled = settings.whatsapp_enabled === "true";
    const apiUrl = settings.whatsapp_api_url;
    const apiToken = settings.whatsapp_api_token;

    if (!enabled || !apiUrl || !apiToken) {
      console.log("WhatsApp not configured, skipping summary");
      return new Response(
        JSON.stringify({ success: true, skipped: "whatsapp_disabled" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get user profile
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("full_name, parent_client_id")
      .eq("id", user_id)
      .single();

    if (!profile) {
      return new Response(JSON.stringify({ error: "User not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch open tickets for this user's client
    let tickets: any[] = [];
    if (profile.parent_client_id) {
      const { data } = await supabaseAdmin
        .from("tickets")
        .select("ticket_number, title, priority, status, created_at, assigned_to")
        .eq("client_id", profile.parent_client_id)
        .in("status", ["open", "in_progress", "waiting_client"])
        .order("created_at", { ascending: false });
      tickets = data || [];
    } else {
      // If no client linked, check tickets created by this user
      const { data } = await supabaseAdmin
        .from("tickets")
        .select("ticket_number, title, priority, status, created_at, assigned_to")
        .eq("created_by", user_id)
        .in("status", ["open", "in_progress", ["waiting_client"]])
        .order("created_at", { ascending: false });
      tickets = data || [];
    }

    if (tickets.length === 0) {
      console.log("No open tickets for user, skipping");
      return new Response(
        JSON.stringify({ success: true, skipped: "no_open_tickets" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch technician names
    const techIds = [...new Set(tickets.filter(t => t.assigned_to).map(t => t.assigned_to))];
    const techMap: Record<string, string> = {};
    if (techIds.length > 0) {
      const { data: techProfiles } = await supabaseAdmin
        .from("profiles")
        .select("id, full_name")
        .in("id", techIds);
      techProfiles?.forEach((p: any) => { techMap[p.id] = p.full_name; });
    }

    const priorityEmojis: Record<string, string> = {
      low: "🟢",
      medium: "🟡",
      high: "🟠",
      urgent: "🔴",
    };
    const statusLabels: Record<string, string> = {
      open: "Aberto",
      in_progress: "Em Andamento",
      waiting_client: "Aguardando Cliente",
    };

    const baseUrl = settings.app_base_url || "https://vigilant-web-haven.lovable.app";

    // Build summary message
    const lines = [
      `📊 *Resumo de Chamados em Aberto*`,
      ``,
      `👤 *Usuário:* ${profile.full_name}`,
      `📋 *Total:* ${tickets.length} chamado(s)`,
      ``,
      `━━━━━━━━━━━━━━━━━━━━━`,
    ];

    for (const t of tickets) {
      const emoji = priorityEmojis[t.priority] || "⚪";
      const statusLabel = statusLabels[t.status] || t.status;
      const techName = t.assigned_to ? (techMap[t.assigned_to] || "—") : "Não atribuído";
      const date = new Date(t.created_at).toLocaleDateString("pt-BR");
      
      lines.push(
        ``,
        `${emoji} *#${t.ticket_number}* — ${t.title}`,
        `   📌 Status: ${statusLabel}`,
        `   🔧 Técnico: ${techName}`,
        `   📅 Criado: ${date}`,
        `   🔗 ${baseUrl}/helpdesk/tickets/${t.ticket_number}`
      );
    }

    lines.push(``, `━━━━━━━━━━━━━━━━━━━━━`);

    const text = lines.join("\n");
    const cleanedPhone = cleanPhone(phone);
    const sendTextUrl = `${apiUrl.replace(/\/+$/, "")}/send/text`;

    const resp = await fetch(sendTextUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", token: apiToken },
      body: JSON.stringify({ number: cleanedPhone, text, linkPreview: false }),
    });

    if (resp.ok) {
      console.log(`Ticket summary sent to ${cleanedPhone}`);
      return new Response(
        JSON.stringify({ success: true, tickets_count: tickets.length }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    } else {
      const errBody = await resp.text();
      console.error(`WhatsApp send failed: ${resp.status} ${errBody}`);
      return new Response(
        JSON.stringify({ error: "Failed to send WhatsApp", details: errBody }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
  } catch (error) {
    console.error("send-user-ticket-summary error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
