import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  try {
    const { device_id, collected_data, status_changes, log_alerts, dhcp_summary } = await req.json();

    if (!device_id) {
      return new Response(
        JSON.stringify({ error: "device_id é obrigatório" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Verificar se o device existe
    const { data: device, error: deviceError } = await supabase
      .from("mikrotik_devices")
      .select("*")
      .eq("id", device_id)
      .single();

    if (deviceError || !device) {
      return new Response(
        JSON.stringify({ error: "Dispositivo não encontrado" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Se houve erro de conexão, registrar
    if (!collected_data?.success) {
      await supabase
        .from("mikrotik_devices")
        .update({
          last_error: collected_data?.error || "Erro de conexão via VPS",
          last_polled_at: new Date().toISOString(),
        })
        .eq("id", device_id);

      // Notificar via WhatsApp sobre falha de conexão
      if (status_changes?.length > 0) {
        await sendWhatsAppAlert(supabase, device, status_changes, log_alerts);
      }

      return new Response(
        JSON.stringify({ success: false, error: collected_data?.error }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Processar interfaces
    const interfaces = collected_data.interfaces || [];
    const ipAddresses = collected_data.ipAddresses || [];
    const pppoeClients = collected_data.pppoeClients || [];

    const ipMap = new Map<string, string>();
    for (const ip of ipAddresses) {
      const ifName = ip.interface || ip[".id"];
      if (ifName) ipMap.set(ifName, ip.address || "");
    }

    const pppoeMap = new Map<string, any>();
    for (const p of pppoeClients) {
      if (p.name) pppoeMap.set(p.name, p);
    }

    for (const iface of interfaces) {
      const pppoe = pppoeMap.get(iface.name);
      const record: any = {
        device_id: device_id,
        interface_name: iface.name || "unknown",
        interface_type: iface.type || null,
        status: iface.running === true || iface.running === "true" ? "up" : "down",
        running: iface.running === true || iface.running === "true",
        disabled: iface.disabled === true || iface.disabled === "true",
        mac_address: iface["mac-address"] || iface.macAddress || null,
        tx_bytes: parseInt(iface["tx-byte"] || iface.txByte || "0") || 0,
        rx_bytes: parseInt(iface["rx-byte"] || iface.rxByte || "0") || 0,
        tx_packets: parseInt(iface["tx-packet"] || iface.txPacket || "0") || 0,
        rx_packets: parseInt(iface["rx-packet"] || iface.rxPacket || "0") || 0,
        tx_errors: parseInt(iface["tx-error"] || iface.txError || "0") || 0,
        rx_errors: parseInt(iface["rx-error"] || iface.rxError || "0") || 0,
        tx_drops: parseInt(iface["tx-drop"] || iface.txDrop || "0") || 0,
        rx_drops: parseInt(iface["rx-drop"] || iface.rxDrop || "0") || 0,
        speed: iface.speed || null,
        ip_address: ipMap.get(iface.name) || null,
        updated_at: new Date().toISOString(),
      };

      if (pppoe) {
        record.pppoe_user = pppoe.user || null;
        record.pppoe_service = pppoe["service-name"] || pppoe.serviceName || null;
        record.uptime = pppoe.uptime || null;
      }

      const { data: existing } = await supabase
        .from("mikrotik_interfaces")
        .select("id")
        .eq("device_id", device_id)
        .eq("interface_name", record.interface_name)
        .maybeSingle();

      if (existing) {
        await supabase.from("mikrotik_interfaces").update(record).eq("id", existing.id);
      } else {
        await supabase.from("mikrotik_interfaces").insert(record);
      }
    }

    // Atualizar status do device
    await supabase
      .from("mikrotik_devices")
      .update({
        last_error: null,
        last_polled_at: new Date().toISOString(),
      })
      .eq("id", device_id);

    // Enviar notificação WhatsApp se houve mudanças
    let whatsappSent = false;
    if ((status_changes?.length > 0) || (log_alerts?.length > 0)) {
      whatsappSent = await sendWhatsAppAlert(supabase, device, status_changes || [], log_alerts || [], dhcp_summary);
    }

    return new Response(
      JSON.stringify({
        success: true,
        interfaces_updated: interfaces.length,
        status_changes: status_changes?.length || 0,
        log_alerts: log_alerts?.length || 0,
        whatsapp_sent: whatsappSent,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Mikrotik VPS ingest error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

// ==================== WHATSAPP NOTIFICATION ====================

function cleanPhone(phone: string): string {
  return phone.replace(/[\s\-\(\)\+]/g, "");
}

async function sendWhatsAppAlert(
  supabase: any,
  device: any,
  statusChanges: any[],
  logAlerts: any[],
  dhcpSummary?: any
): Promise<boolean> {
  // Carregar configurações WhatsApp
  const { data: settings } = await supabase
    .from("system_settings")
    .select("key, value");

  if (!settings) return false;

  const settingsMap: Record<string, string> = {};
  for (const s of settings) {
    settingsMap[s.key] = s.value || "";
  }

  if (settingsMap.whatsapp_enabled !== "true") return false;

  const apiUrl = settingsMap.whatsapp_api_url;
  const apiToken = settingsMap.whatsapp_api_token;
  if (!apiUrl || !apiToken) return false;

  // Buscar telefones dos admins
  const { data: adminRoles } = await supabase
    .from("user_roles")
    .select("user_id")
    .eq("role", "admin");

  if (!adminRoles?.length) return false;

  const adminIds = adminRoles.map((r: any) => r.user_id);
  const { data: adminProfiles } = await supabase
    .from("profiles")
    .select("phone, full_name")
    .in("id", adminIds)
    .not("phone", "is", null);

  if (!adminProfiles?.length) return false;

  // Buscar nome do cliente
  const { data: client } = await supabase
    .from("clients")
    .select("full_name")
    .eq("id", device.client_id)
    .single();

  const clientName = client?.full_name || "N/A";

  // Montar mensagem
  const lines: string[] = [];
  lines.push(`🔔 *ALERTA MIKROTIK*`);
  lines.push(`📡 Dispositivo: *${device.name}*`);
  lines.push(`🏢 Cliente: ${clientName}`);
  lines.push(`🌐 IP: ${device.host}`);
  lines.push("");

  if (statusChanges.length > 0) {
    lines.push("📊 *Mudanças de Status:*");
    for (const change of statusChanges) {
      const emoji = change.current_status === "up" ? "🟢" : "🔴";
      lines.push(`  ${emoji} ${change.interface_name}: ${change.previous_status} → ${change.current_status}`);
    }
    lines.push("");
  }

  if (logAlerts.length > 0) {
    lines.push("📋 *Alertas nos Logs:*");
    for (const alert of logAlerts.slice(0, 10)) {
      lines.push(`  ⚠️ [${alert.time}] ${alert.message}`);
    }
    if (logAlerts.length > 10) {
      lines.push(`  ... e mais ${logAlerts.length - 10} alerta(s)`);
    }
    lines.push("");
  }

  const now = new Date();
  const brTime = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    dateStyle: "short",
    timeStyle: "medium",
  }).format(now);
  lines.push(`🕐 ${brTime}`);
  lines.push("");
  lines.push("_🤖 Alerta automático do monitoramento Mikrotik_");

  const adminContactPhone = settingsMap.admin_contact_phone;
  if (adminContactPhone) {
    lines.push(`_📞 Suporte: ${adminContactPhone}_`);
  }

  const text = lines.join("\n");

  // Enviar para cada admin
  let sent = false;
  for (const admin of adminProfiles) {
    const phone = cleanPhone(admin.phone);
    if (!phone || phone.length < 10) continue;

    try {
      const res = await fetch(`${apiUrl}/send/text`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiToken}`,
        },
        body: JSON.stringify({
          number: phone,
          text,
          linkPreview: false,
        }),
      });

      const status = res.ok ? "sent" : "failed";
      const errMsg = res.ok ? null : await res.text();

      // Log no banco
      await supabase.from("whatsapp_notification_logs").insert({
        notification_type: "mikrotik_alert",
        recipient_phone: phone,
        message_preview: text.substring(0, 200),
        status,
        error_message: errMsg,
      });

      if (res.ok) sent = true;
    } catch (err: any) {
      console.error(`Erro ao enviar WhatsApp para ${phone}:`, err);
      await supabase.from("whatsapp_notification_logs").insert({
        notification_type: "mikrotik_alert",
        recipient_phone: phone,
        message_preview: text.substring(0, 200),
        status: "failed",
        error_message: err.message,
      });
    }
  }

  // Enviar também para o grupo WhatsApp do cliente se configurado
  if (client) {
    const { data: fullClient } = await supabase
      .from("clients")
      .select("whatsapp_group_id")
      .eq("id", device.client_id)
      .single();

    if (fullClient?.whatsapp_group_id) {
      try {
        await fetch(`${apiUrl}/send/text`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiToken}`,
          },
          body: JSON.stringify({
            number: fullClient.whatsapp_group_id,
            text,
            linkPreview: false,
          }),
        });
      } catch (_) {}
    }
  }

  return sent;
}
