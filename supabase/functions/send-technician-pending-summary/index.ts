import { createClient } from "npm:@supabase/supabase-js@2";
import { waFetch } from "../_shared/whatsapp.ts";

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
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Optional: target a single technician
    let targetTechId: string | null = null;
    try {
      const body = await req.json();
      targetTechId = body?.technician_id || null;
    } catch {
      // no body = send to all technicians
    }

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
      console.log("WhatsApp not configured, skipping");
      return new Response(
        JSON.stringify({ success: true, skipped: "whatsapp_disabled" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch all open/in_progress tickets assigned to technicians
    let ticketsQuery = supabaseAdmin
      .from("tickets")
      .select("id, ticket_number, title, priority, status, created_at, assigned_to, client_id")
      .in("status", ["open", "in_progress", "waiting_client"])
      .not("assigned_to", "is", null)
      .order("priority", { ascending: true })
      .order("created_at", { ascending: false });

    if (targetTechId) {
      ticketsQuery = ticketsQuery.eq("assigned_to", targetTechId);
    }

    const { data: tickets } = await ticketsQuery;

    if (!tickets || tickets.length === 0) {
      console.log("No pending tickets found");
      return new Response(
        JSON.stringify({ success: true, skipped: "no_pending_tickets" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Group tickets by technician
    const techTickets: Record<string, any[]> = {};
    for (const t of tickets) {
      if (!techTickets[t.assigned_to]) techTickets[t.assigned_to] = [];
      techTickets[t.assigned_to].push(t);
    }

    // Fetch technician profiles
    const techIds = Object.keys(techTickets);
    const { data: techProfiles } = await supabaseAdmin
      .from("profiles")
      .select("id, full_name, phone")
      .in("id", techIds);

    if (!techProfiles) {
      return new Response(
        JSON.stringify({ success: true, skipped: "no_profiles" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch client names
    const clientIds = [...new Set(tickets.filter(t => t.client_id).map(t => t.client_id))];
    const clientMap: Record<string, string> = {};
    if (clientIds.length > 0) {
      const { data: clientRecords } = await supabaseAdmin
        .from("clients")
        .select("id, full_name")
        .in("id", clientIds);
      clientRecords?.forEach((c: any) => { clientMap[c.id] = c.full_name; });
    }

    const priorityEmojis: Record<string, string> = {
      low: "🟢",
      medium: "🟡",
      high: "🟠",
      urgent: "🔴",
    };
    const priorityLabels: Record<string, string> = {
      low: "Baixa",
      medium: "Média",
      high: "Alta",
      urgent: "Urgente",
    };
    const statusLabels: Record<string, string> = {
      open: "Aberto",
      in_progress: "Em Andamento",
      waiting_client: "Aguardando Cliente",
    };

    const baseUrl = settings.app_base_url || "https://vigilant-web-haven.lovable.app";
    const sendTextUrl = `${apiUrl.replace(/\/+$/, "")}/send/text`;

    let totalSent = 0;

    for (const profile of techProfiles) {
      if (!profile.phone) continue;
      const myTickets = techTickets[profile.id];
      if (!myTickets || myTickets.length === 0) continue;

      // Sort: urgent first
      const priorityOrder: Record<string, number> = { urgent: 0, high: 1, medium: 2, low: 3 };
      myTickets.sort((a, b) => (priorityOrder[a.priority] ?? 9) - (priorityOrder[b.priority] ?? 9));

      const lines = [
        `📊 *Chamados Pendentes*`,
        ``,
        `👤 *Técnico:* ${profile.full_name}`,
        `📋 *Total:* ${myTickets.length} chamado(s)`,
        ``,
        `━━━━━━━━━━━━━━━━━━━━━`,
      ];

      for (const t of myTickets) {
        const emoji = priorityEmojis[t.priority] || "⚪";
        const priLabel = priorityLabels[t.priority] || t.priority;
        const statusLabel = statusLabels[t.status] || t.status;
        const clientName = t.client_id ? (clientMap[t.client_id] || "—") : "—";
        const date = new Date(t.created_at).toLocaleDateString("pt-BR");

        lines.push(
          ``,
          `${emoji} *#${t.ticket_number}* — ${t.title}`,
          `   📌 Status: ${statusLabel}`,
          `   ⚡ Prioridade: ${priLabel}`,
          `   🏢 Cliente: ${clientName}`,
          `   📅 Criado: ${date}`,
          `   🔗 ${baseUrl}/admin/tickets/${t.id}`
        );
      }

      lines.push(``, `━━━━━━━━━━━━━━━━━━━━━`);

      const text = lines.join("\n");
      const cleanedPhone = cleanPhone(profile.phone);

      try {
        const resp = await waFetch(sendTextUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json", token: apiToken },
          body: JSON.stringify({ number: cleanedPhone, text, linkPreview: false }),
        });
        if (resp.ok) {
          totalSent++;
          console.log(`Pending summary sent to technician ${profile.full_name} (${cleanedPhone})`);
        } else {
          const errBody = await resp.text();
          console.error(`WhatsApp send failed for ${cleanedPhone}: ${resp.status} ${errBody}`);
        }
      } catch (err) {
        console.error(`WhatsApp error for ${cleanedPhone}:`, err);
      }
    }

    return new Response(
      JSON.stringify({ success: true, technicians_notified: totalSent }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("send-technician-pending-summary error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
