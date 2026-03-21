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

    // Salvar histórico de tráfego das interfaces ativas
    const trafficRecords = interfaces
      .filter((iface: any) => iface.running === true || iface.running === "true")
      .map((iface: any) => ({
        device_id,
        interface_name: iface.name || "unknown",
        tx_bytes: parseInt(iface["tx-byte"] || iface.txByte || "0") || 0,
        rx_bytes: parseInt(iface["rx-byte"] || iface.rxByte || "0") || 0,
        tx_packets: parseInt(iface["tx-packet"] || iface.txPacket || "0") || 0,
        rx_packets: parseInt(iface["rx-packet"] || iface.rxPacket || "0") || 0,
        tx_errors: parseInt(iface["tx-error"] || iface.txError || "0") || 0,
        rx_errors: parseInt(iface["rx-error"] || iface.rxError || "0") || 0,
      }));
    if (trafficRecords.length > 0) {
      await supabase.from("mikrotik_traffic_history").insert(trafficRecords);
    }

    // Atualizar status do device com dados extras
    const deviceUpdate: any = {
      last_error: null,
      last_polled_at: new Date().toISOString(),
    };
    if (dhcp_summary) {
      deviceUpdate.last_dhcp_summary = dhcp_summary;
      // Salvar histórico DHCP
      await supabase.from("mikrotik_dhcp_history").insert({
        device_id,
        total_leases: dhcp_summary.total_leases || 0,
        active_leases: dhcp_summary.active_leases || 0,
        dynamic_leases: dhcp_summary.dynamic_leases || 0,
        static_leases: dhcp_summary.static_leases || 0,
        by_server: dhcp_summary.by_server || null,
      });
    }
    if (log_alerts?.length > 0) deviceUpdate.last_log_alerts = log_alerts.slice(0, 50);
    if (collected_data?.resource || collected_data?.identity || collected_data?.health) {
      const sysInfo: any = {
        identity: collected_data.identity || '',
        version: collected_data.resource?.version || '',
        uptime: collected_data.resource?.uptime || '',
        cpu: collected_data.resource?.cpu || '',
        'cpu-load': collected_data.resource?.['cpu-load'] || collected_data.resource?.cpuLoad || '',
        'free-memory': collected_data.resource?.['free-memory'] || collected_data.resource?.freeMemory || '',
        'total-memory': collected_data.resource?.['total-memory'] || collected_data.resource?.totalMemory || '',
        'board-name': collected_data.resource?.['board-name'] || collected_data.resource?.boardName || '',
        architecture: collected_data.resource?.['architecture-name'] || collected_data.resource?.architectureName || '',
        'cpu-count': collected_data.resource?.['cpu-count'] || collected_data.resource?.cpuCount || '',
        'cpu-frequency': collected_data.resource?.['cpu-frequency'] || collected_data.resource?.cpuFrequency || '',
      };
      // Health data (temperature, voltage, fan)
      if (collected_data.health && typeof collected_data.health === 'object') {
        sysInfo.health = collected_data.health;
      }
      // Detect reboot by comparing uptime
      const previousInfo = device.last_system_info;
      if (previousInfo?.uptime && sysInfo.uptime) {
        const parseUptimeSeconds = (u: string): number => {
          let total = 0;
          const weeks = u.match(/(\d+)w/); if (weeks) total += parseInt(weeks[1]) * 604800;
          const days = u.match(/(\d+)d/); if (days) total += parseInt(days[1]) * 86400;
          const hours = u.match(/(\d+)h/); if (hours) total += parseInt(hours[1]) * 3600;
          const mins = u.match(/(\d+)m/); if (mins) total += parseInt(mins[1]) * 60;
          const secs = u.match(/(\d+)s/); if (secs) total += parseInt(secs[1]);
          return total;
        };
        const prevSec = parseUptimeSeconds(previousInfo.uptime);
        const curSec = parseUptimeSeconds(sysInfo.uptime);
        if (prevSec > 0 && curSec < prevSec && (prevSec - curSec) > 120) {
          sysInfo.reboot_detected = true;
          sysInfo.previous_uptime = previousInfo.uptime;
        }
      }
      deviceUpdate.last_system_info = sysInfo;
    }
    await supabase
      .from("mikrotik_devices")
      .update(deviceUpdate)
      .eq("id", device_id);

    // Verificar DHCP alto uso (>90%) e adicionar como alerta
    const dhcpAlerts: string[] = [];
    if (dhcp_summary?.by_server) {
      for (const [server, info] of Object.entries(dhcp_summary.by_server) as any) {
        if (info.total > 0) {
          const pct = Math.round((info.active / info.total) * 100);
          if (pct >= 90) {
            dhcpAlerts.push(`⚠️ DHCP ${server}: ${pct}% utilizado (${info.active}/${info.total})`);
          }
        }
      }
    }
    if (dhcp_summary?.total_leases > 0) {
      const totalPct = Math.round((dhcp_summary.active_leases / dhcp_summary.total_leases) * 100);
      if (totalPct >= 90) {
        dhcpAlerts.push(`🔴 DHCP Geral: ${totalPct}% utilizado (${dhcp_summary.active_leases}/${dhcp_summary.total_leases})`);
      }
    }

    // Filtrar apenas alertas de log NOVOS (não presentes no último envio)
    const previousLogMessages = new Set(
      (device.last_log_alerts || []).map((a: any) => a.message || "")
    );
    const newLogAlerts = (log_alerts || []).filter(
      (a: any) => !previousLogMessages.has(a.message || "")
    );

    // Filtrar DHCP alerts: só notificar se o estado de alerta mudou
    const previousDhcp = device.last_dhcp_summary;
    const previousDhcpWasHigh = previousDhcp?.total_leases > 0 &&
      Math.round((previousDhcp.active_leases / previousDhcp.total_leases) * 100) >= 90;
    const currentDhcpIsHigh = dhcpAlerts.length > 0;
    const dhcpAlertsToSend = (currentDhcpIsHigh && !previousDhcpWasHigh) ? dhcpAlerts : [];

    // Detect reboot for WhatsApp notification
    const rebootDetected = deviceUpdate.last_system_info?.reboot_detected === true;

    // Detect high temperature (>70°C) with deduplication
    const tempAlerts: string[] = [];
    const currentHealth = deviceUpdate.last_system_info?.health || {};
    const cpuTemp = parseFloat(currentHealth['cpu-temperature'] || currentHealth.temperature || currentHealth['board-temperature1'] || '0');
    const previousHealth = device.last_system_info?.health || {};
    const prevTemp = parseFloat(previousHealth['cpu-temperature'] || previousHealth.temperature || previousHealth['board-temperature1'] || '0');
    const tempIsHigh = cpuTemp > 70;
    const prevTempWasHigh = prevTemp > 70;
    if (tempIsHigh && !prevTempWasHigh) {
      tempAlerts.push(`🌡️ Temperatura CPU: *${cpuTemp}°C* (acima de 70°C)`);
    }

    // Enviar notificação WhatsApp somente se há mudanças reais
    let whatsappSent = false;
    if ((status_changes?.length > 0) || (newLogAlerts.length > 0) || (dhcpAlertsToSend.length > 0) || rebootDetected || tempAlerts.length > 0) {
      whatsappSent = await sendWhatsAppAlert(supabase, device, status_changes || [], newLogAlerts, dhcp_summary, dhcpAlertsToSend, rebootDetected ? deviceUpdate.last_system_info : null, tempAlerts);
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
  dhcpSummary?: any,
  dhcpAlerts?: string[],
  rebootInfo?: any,
  tempAlerts?: string[]
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
  if (settingsMap.notif_mikrotik_alert === "false") return false;

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

  if (rebootInfo?.reboot_detected) {
    lines.push("🔄 *REINICIALIZAÇÃO DETECTADA!*");
    lines.push(`  Uptime anterior: ${rebootInfo.previous_uptime}`);
    lines.push(`  Uptime atual: ${rebootInfo.uptime}`);
    lines.push("");
  }

  if (tempAlerts && tempAlerts.length > 0) {
    lines.push("🌡️ *TEMPERATURA ALTA:*");
    for (const alert of tempAlerts) {
      lines.push(`  ${alert}`);
    }
    lines.push("");
  }

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

  if (dhcpAlerts && dhcpAlerts.length > 0) {
    lines.push("🚨 *DHCP - Utilização Alta (>90%):*");
    for (const alert of dhcpAlerts) {
      lines.push(`  ${alert}`);
    }
    lines.push("");
  }

  if (dhcpSummary) {
    lines.push("🌐 *DHCP Leases:*");
    lines.push(`  Total: ${dhcpSummary.total_leases} | Ativos: ${dhcpSummary.active_leases}`);
    lines.push(`  Dinâmicos: ${dhcpSummary.dynamic_leases} | Estáticos: ${dhcpSummary.static_leases}`);
    if (dhcpSummary.by_server && Object.keys(dhcpSummary.by_server).length > 0) {
      for (const [server, info] of Object.entries(dhcpSummary.by_server) as any) {
        const pct = info.total > 0 ? Math.round((info.active / info.total) * 100) : 0;
        const icon = pct >= 90 ? "🔴" : pct >= 70 ? "🟡" : "🟢";
        lines.push(`  ${icon} ${server}: ${info.active}/${info.total} (${pct}%)`);
      }
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
          token: apiToken,
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
            token: apiToken,
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
