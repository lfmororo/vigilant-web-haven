import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function cleanPhone(phone: string): string {
  return phone.replace(/[\s\-\(\)\+]/g, "");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  try {
    // Load settings
    const { data: settings } = await supabase.from("system_settings").select("key, value");
    if (!settings) {
      return new Response(JSON.stringify({ error: "Configurações não encontradas" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const settingsMap: Record<string, string> = {};
    for (const s of settings) settingsMap[s.key] = s.value || "";

    if (settingsMap.whatsapp_enabled !== "true" || settingsMap.notif_mikrotik_alert === "false") {
      return new Response(JSON.stringify({ skipped: true, reason: "notifications disabled" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const apiUrl = settingsMap.whatsapp_api_url;
    const apiToken = settingsMap.whatsapp_api_token;
    if (!apiUrl || !apiToken) {
      return new Response(JSON.stringify({ error: "WhatsApp API não configurada" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Get all active devices with their log_alerts
    const { data: devices } = await supabase
      .from("mikrotik_devices")
      .select("*, client:clients(id, full_name, phone, whatsapp_group_id)")
      .eq("is_active", true);

    if (!devices?.length) {
      return new Response(JSON.stringify({ success: true, arp_conflicts: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Collect ARP conflicts per device per client
    interface ArpEntry {
      deviceName: string;
      host: string;
      message: string;
    }
    const arpByClient: Record<string, { clientName: string; clientPhone: string | null; groupId: string | null; clientId: string; entries: ArpEntry[] }> = {};

    for (const device of devices) {
      const logAlerts = device.last_log_alerts || [];
      const arpAlerts = logAlerts.filter((log: any) => {
        const msg = (log.message || "").toLowerCase();
        return msg.includes("arp") && (msg.includes("conflict") || msg.includes("duplicate"));
      });

      if (arpAlerts.length === 0) continue;

      const clientId = device.client_id || "no_client";
      if (!arpByClient[clientId]) {
        arpByClient[clientId] = {
          clientName: device.client?.full_name || "N/A",
          clientPhone: device.client?.phone || null,
          groupId: device.client?.whatsapp_group_id || null,
          clientId,
          entries: [],
        };
      }

      for (const alert of arpAlerts) {
        arpByClient[clientId].entries.push({
          deviceName: device.name,
          host: device.host,
          message: alert.message || "",
        });
      }
    }

    const totalArpClients = Object.keys(arpByClient).length;
    if (totalArpClients === 0) {
      return new Response(JSON.stringify({ success: true, arp_conflicts: 0, message: "Nenhum conflito ARP nas últimas 24h" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Get admin phones
    const { data: adminRoles } = await supabase.from("user_roles").select("user_id").eq("role", "admin");
    const adminIds = (adminRoles || []).map((r: any) => r.user_id);
    const { data: adminProfiles } = adminIds.length > 0
      ? await supabase.from("profiles").select("phone").in("id", adminIds).not("phone", "is", null)
      : { data: [] };

    // Get technicians
    const { data: techRoles } = await supabase.from("user_roles").select("user_id").eq("role", "technician");
    const techIds = (techRoles || []).map((r: any) => r.user_id);
    let allTechProfiles: any[] = [];
    if (techIds.length > 0) {
      const { data: techs } = await supabase
        .from("profiles")
        .select("phone, parent_client_id")
        .in("id", techIds)
        .not("phone", "is", null);
      allTechProfiles = techs || [];
    }

    const now = new Date();
    const brTime = new Intl.DateTimeFormat("pt-BR", {
      timeZone: "America/Sao_Paulo",
      dateStyle: "short",
      timeStyle: "short",
    }).format(now);

    const adminContactPhone = settingsMap.admin_contact_phone;
    let totalSent = 0;

    for (const [clientId, data] of Object.entries(arpByClient)) {
      const lines: string[] = [];
      lines.push("⚠️ *RESUMO DE CONFLITOS ARP*");
      lines.push(`📅 ${brTime}`);
      lines.push(`🏢 ${data.clientName}`);
      lines.push(`━━━━━━━━━━━━━━━━━━`);
      lines.push("");
      lines.push(`Foram detectados *${data.entries.length} conflito(s) ARP* nas últimas 24 horas:`);
      lines.push("");

      // Group by device
      const byDevice: Record<string, ArpEntry[]> = {};
      for (const entry of data.entries) {
        if (!byDevice[entry.deviceName]) byDevice[entry.deviceName] = [];
        byDevice[entry.deviceName].push(entry);
      }

      for (const [deviceName, entries] of Object.entries(byDevice)) {
        lines.push(`📡 *${deviceName}* (${entries[0].host})`);
        // Deduplicate messages
        const uniqueMessages = [...new Set(entries.map(e => e.message))];
        for (const msg of uniqueMessages.slice(0, 10)) {
          lines.push(`   • ${msg}`);
        }
        if (uniqueMessages.length > 10) {
          lines.push(`   _... e mais ${uniqueMessages.length - 10} evento(s)_`);
        }
        lines.push("");
      }

      lines.push("💡 *O que é conflito ARP?*");
      lines.push("Dois dispositivos na rede estão usando o mesmo endereço IP, o que pode causar instabilidade na conexão.");
      lines.push("");
      lines.push(`━━━━━━━━━━━━━━━━━━`);
      lines.push("_🤖 Resumo automático do monitoramento de dispositivos_");
      if (adminContactPhone) lines.push(`_📞 Suporte: ${adminContactPhone}_`);

      const text = lines.join("\n");

      // Build recipients
      const phoneSet = new Set<string>();
      const recipients: string[] = [];

      for (const admin of (adminProfiles || [])) {
        const phone = cleanPhone(admin.phone);
        if (phone && phone.length >= 10 && !phoneSet.has(phone)) {
          phoneSet.add(phone);
          recipients.push(phone);
        }
      }

      if (clientId !== "no_client" && data.clientPhone) {
        const phone = cleanPhone(data.clientPhone);
        if (phone && phone.length >= 10 && !phoneSet.has(phone)) {
          phoneSet.add(phone);
          recipients.push(phone);
        }
      }

      if (clientId !== "no_client") {
        const linkedTechs = allTechProfiles.filter((t: any) => t.parent_client_id === clientId);
        for (const tech of linkedTechs) {
          const phone = cleanPhone(tech.phone);
          if (phone && phone.length >= 10 && !phoneSet.has(phone)) {
            phoneSet.add(phone);
            recipients.push(phone);
          }
        }
      }

      // Send
      for (const phone of recipients) {
        try {
          const res = await fetch(`${apiUrl}/send/text`, {
            method: "POST",
            headers: { "Content-Type": "application/json", token: apiToken },
            body: JSON.stringify({ number: phone, text, linkPreview: false }),
          });
          await supabase.from("whatsapp_notification_logs").insert({
            notification_type: "mikrotik_arp_summary",
            recipient_phone: phone,
            message_preview: text.substring(0, 200),
            status: res.ok ? "sent" : "failed",
            error_message: res.ok ? null : await res.text(),
          });
          if (res.ok) totalSent++;
        } catch (err: any) {
          await supabase.from("whatsapp_notification_logs").insert({
            notification_type: "mikrotik_arp_summary",
            recipient_phone: phone,
            message_preview: text.substring(0, 200),
            status: "failed",
            error_message: err.message,
          });
        }
      }

      // Send to group
      if (data.groupId) {
        try {
          await fetch(`${apiUrl}/send/text`, {
            method: "POST",
            headers: { "Content-Type": "application/json", token: apiToken },
            body: JSON.stringify({ number: data.groupId, text, linkPreview: false }),
          });
        } catch (_) {}
      }
    }

    return new Response(
      JSON.stringify({ success: true, clients_with_arp: totalArpClients, whatsapp_sent: totalSent }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("ARP summary error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
