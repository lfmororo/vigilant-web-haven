import { createClient } from "npm:@supabase/supabase-js@2";
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

  try {
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Load settings
    const { data: settingsData } = await supabaseAdmin
      .from("system_settings")
      .select("key, value");
    const settings: Record<string, string> = {};
    settingsData?.forEach((s: any) => {
      settings[s.key] = s.value || "";
    });

    const whatsappEnabled = settings.whatsapp_enabled === "true";
    const waApiUrl = settings.whatsapp_api_url;
    const waApiToken = settings.whatsapp_api_token;

    if (!whatsappEnabled || !waApiUrl || !waApiToken) {
      console.log("WhatsApp not configured, skipping daily client summary");
      return new Response(
        JSON.stringify({ success: true, skipped: "whatsapp_disabled" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const baseUrl =
      settings.app_base_url || "https://vigilant-web-haven.lovable.app";

    // Fetch all clients that have a whatsapp_group_id or phone
    const { data: clientRecords } = await supabaseAdmin
      .from("clients")
      .select("id, full_name, phone, whatsapp_group_id");

    if (!clientRecords?.length) {
      return new Response(
        JSON.stringify({ success: true, sent: 0, message: "No clients" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Only clients with a WhatsApp destination
    const reachableClients = clientRecords.filter(
      (c) =>
        c.whatsapp_group_id ||
        (c.phone && c.phone.replace(/[\s\-\(\)\+]/g, "").length >= 10)
    );

    if (reachableClients.length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          sent: 0,
          message: "No clients with WhatsApp",
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const clientIds = reachableClients.map((c) => c.id);

    // Fetch active tickets for these clients
    const { data: allTickets } = await supabaseAdmin
      .from("tickets")
      .select(
        "ticket_number, title, status, priority, created_at, client_id, assigned_to"
      )
      .in("client_id", clientIds)
      .in("status", ["open", "in_progress", "waiting_client"])
      .order("created_at", { ascending: false });

    if (!allTickets?.length) {
      console.log("No active tickets for any client");
      return new Response(
        JSON.stringify({
          success: true,
          sent: 0,
          message: "No active tickets",
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch technician names
    const techIds = [
      ...new Set(
        allTickets.filter((t) => t.assigned_to).map((t) => t.assigned_to!)
      ),
    ];
    const techNames: Record<string, string> = {};
    if (techIds.length > 0) {
      const { data: techProfiles } = await supabaseAdmin
        .from("profiles")
        .select("id, full_name")
        .in("id", techIds);
      techProfiles?.forEach((p) => {
        techNames[p.id] = p.full_name;
      });
    }

    const dateStr = new Date().toLocaleDateString("pt-BR", {
      timeZone: "America/Sao_Paulo",
    });
    const now = Date.now();
    const cutoff24h = now - 24 * 60 * 60 * 1000;

    const statusLabels: Record<string, string> = {
      open: "Aberto",
      in_progress: "Em Andamento",
      waiting_client: "Aguardando Cliente",
    };
    const statusOrder = ["open", "in_progress", "waiting_client"];
    const priorityEmoji: Record<string, string> = {
      low: "🟢",
      medium: "🟡",
      high: "🟠",
      urgent: "🔴",
    };

    const sendUrl = `${waApiUrl.replace(/\/+$/, "")}/send/text`;
    let sent = 0;

    for (const client of reachableClients) {
      const myTickets = allTickets.filter((t) => t.client_id === client.id);
      if (myTickets.length === 0) continue;

      const grouped: Record<string, typeof myTickets> = {};
      for (const t of myTickets) {
        if (!grouped[t.status]) grouped[t.status] = [];
        grouped[t.status].push(t);
      }

      const staleTickets = myTickets.filter(
        (t) => new Date(t.created_at).getTime() < cutoff24h
      );

      // Build message
      let msg = `📋 *Resumo Diário de Chamados*\n📅 ${dateStr}\n\n`;
      msg += `Olá *${client.full_name}*, segue o resumo dos seus chamados ativos:\n\n`;
      msg += `🔢 *Total em aberto:* ${myTickets.length}\n\n`;

      if (staleTickets.length > 0) {
        msg += `⚠️ *${staleTickets.length} chamado(s) há mais de 24h:*\n`;
        for (const t of staleTickets) {
          const hoursOpen = Math.floor(
            (now - new Date(t.created_at).getTime()) / (1000 * 60 * 60)
          );
          const daysOpen = Math.floor(hoursOpen / 24);
          msg += `   🔴 #${t.ticket_number} - ${t.title} (${daysOpen}d ${hoursOpen % 24}h)\n`;
        }
        msg += `\n`;
      }

      for (const status of statusOrder) {
        const group = grouped[status];
        if (!group || group.length === 0) continue;
        msg += `*${statusLabels[status]} (${group.length}):*\n`;
        for (const t of group) {
          const pri = priorityEmoji[t.priority] || "⚪";
          const tech = t.assigned_to ? techNames[t.assigned_to] || "" : "";
          msg += `   ${pri} #${t.ticket_number} - ${t.title}${tech ? ` _(${tech})_` : ""}\n`;
        }
        msg += `\n`;
      }

      msg += `🔗 ${baseUrl}/helpdesk`;

      // Send to group or phone
      const destination = client.whatsapp_group_id ||
        client.phone?.replace(/[\s\-\(\)\+]/g, "");

      if (!destination) continue;

      try {
        const resp = await waFetch(sendUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json", token: waApiToken },
          body: JSON.stringify({
            number: destination,
            text: msg,
            linkPreview: false,
          }),
        });
        if (resp.ok) {
          sent++;
          console.log(
            `Daily client summary sent to ${client.full_name} (${destination})`
          );
        } else {
          const errBody = await resp.text();
          console.error(
            `WhatsApp failed for ${client.full_name}: ${resp.status} ${errBody}`
          );
        }
      } catch (err) {
        console.error(`WhatsApp error for ${client.full_name}:`, err);
      }
    }

    console.log(`Daily client summary: ${sent} WhatsApp messages sent`);
    return new Response(JSON.stringify({ success: true, sent }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("daily-client-summary error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
