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

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  try {
    let deviceId: string | null = null;
    try {
      const body = await req.json();
      deviceId = body.device_id || null;
    } catch (_) {}

    // Load settings
    const { data: settings } = await supabase
      .from("system_settings")
      .select("key, value");

    if (!settings) {
      return new Response(JSON.stringify({ error: "Configurações não encontradas" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const settingsMap: Record<string, string> = {};
    for (const s of settings) settingsMap[s.key] = s.value || "";

    if (settingsMap.whatsapp_enabled !== "true") {
      return new Response(JSON.stringify({ error: "WhatsApp desabilitado" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (settingsMap.notif_mikrotik_alert === "false") {
      return new Response(JSON.stringify({ error: "Notificações Mikrotik desabilitadas" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const apiUrl = settingsMap.whatsapp_api_url;
    const apiToken = settingsMap.whatsapp_api_token;
    if (!apiUrl || !apiToken) {
      return new Response(JSON.stringify({ error: "WhatsApp API não configurada" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Get devices
    let devicesQuery = supabase
      .from("mikrotik_devices")
      .select("*, client:clients(full_name, whatsapp_group_id)")
      .eq("is_active", true);

    if (deviceId) {
      devicesQuery = devicesQuery.eq("id", deviceId);
    }

    const { data: devices } = await devicesQuery;
    if (!devices?.length) {
      return new Response(JSON.stringify({ error: "Nenhum dispositivo ativo" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const now = new Date();
    const since24h = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();

    const summaries: string[] = [];

    for (const device of devices) {
      const sysInfo = device.last_system_info || {};
      const health = sysInfo.health || {};
      const clientName = device.client?.full_name || "N/A";

      // 1. System history for last 24h (temp, cpu, memory peaks)
      const { data: sysHistory } = await supabase
        .from("mikrotik_system_history")
        .select("cpu_temp, cpu_load, memory_used_pct, voltage")
        .eq("device_id", device.id)
        .gte("recorded_at", since24h)
        .order("recorded_at", { ascending: true });

      const historyRecords = sysHistory || [];

      // Calculate peaks
      let maxTemp = 0, maxCpu = 0, maxMem = 0;
      for (const r of historyRecords) {
        if (r.cpu_temp && r.cpu_temp > maxTemp) maxTemp = r.cpu_temp;
        if (r.cpu_load && r.cpu_load > maxCpu) maxCpu = r.cpu_load;
        if (r.memory_used_pct && r.memory_used_pct > maxMem) maxMem = r.memory_used_pct;
      }

      // Current values
      const cpuTemp = health['cpu-temperature'] || health.temperature || health['board-temperature1'] || null;
      const cpuLoad = sysInfo['cpu-load'] || null;
      const totalMem = parseInt(sysInfo['total-memory'] || '0') || 0;
      const freeMem = parseInt(sysInfo['free-memory'] || '0') || 0;
      const memPct = totalMem > 0 ? Math.round(((totalMem - freeMem) / totalMem) * 100) : null;

      // 2. Reboots in last 24h — check whatsapp logs for reboot alerts
      const { count: rebootCount } = await supabase
        .from("whatsapp_notification_logs")
        .select("id", { count: "exact", head: true })
        .eq("notification_type", "mikrotik_alert")
        .gte("created_at", since24h)
        .like("message_preview", `%REINICIALIZAÇÃO%${device.name}%`);

      // Also check if current system info has reboot_detected
      const currentReboot = sysInfo.reboot_detected ? 1 : 0;
      const totalReboots = Math.max(rebootCount || 0, currentReboot);

      // 3. Interface down events — count from whatsapp logs
      const { data: alertLogs } = await supabase
        .from("whatsapp_notification_logs")
        .select("message_preview")
        .eq("notification_type", "mikrotik_alert")
        .gte("created_at", since24h)
        .like("message_preview", `%${device.name}%`);

      let interfaceDownCount = 0;
      let arpConflicts = 0;
      let loginDenied = 0;

      // Count from log_alerts stored on device
      const logAlerts = device.last_log_alerts || [];
      for (const log of logAlerts) {
        const msg = (log.message || "").toLowerCase();
        if (log.category === "interface" || msg.includes("link down") || msg.includes("link changed")) {
          interfaceDownCount++;
        }
        if (msg.includes("arp") && (msg.includes("conflict") || msg.includes("duplicate"))) {
          arpConflicts++;
        }
        if (log.category === "login" || msg.includes("login failure") || msg.includes("login failed") || msg.includes("denied")) {
          loginDenied++;
        }
      }

      // Also count from recent alert logs
      for (const log of (alertLogs || [])) {
        const preview = (log.message_preview || "").toLowerCase();
        // Count interface down mentions
        const downMatches = preview.match(/🔴/g);
        if (downMatches) interfaceDownCount += downMatches.length;
      }

      // Build device summary
      const lines: string[] = [];
      lines.push(`📡 *${device.name}*`);
      lines.push(`🏢 ${clientName} | 🌐 ${device.host}`);
      lines.push("");
      lines.push("━━━━ Resumo 24h ━━━━");
      lines.push("");
      lines.push(`🔄 Reinicializações: *${totalReboots}*`);
      lines.push(`🔴 Interface Down: *${interfaceDownCount}*`);
      lines.push(`⚠️ Conflitos ARP: *${arpConflicts}*`);
      lines.push(`🔐 Login negado: *${loginDenied}*`);
      lines.push("");
      lines.push("━━━━ Status Atual ━━━━");
      lines.push("");
      if (cpuTemp) {
        const tempIcon = Number(cpuTemp) > 70 ? "🔴" : Number(cpuTemp) > 55 ? "🟡" : "🟢";
        lines.push(`🌡️ Temperatura: ${tempIcon} *${cpuTemp}°C* (pico 24h: ${maxTemp > 0 ? maxTemp + '°C' : 'N/A'})`);
      }
      if (cpuLoad) {
        const cpuIcon = Number(cpuLoad) > 80 ? "🔴" : Number(cpuLoad) > 50 ? "🟡" : "🟢";
        lines.push(`💻 CPU: ${cpuIcon} *${cpuLoad}%* (pico 24h: ${maxCpu > 0 ? maxCpu + '%' : 'N/A'})`);
      }
      if (memPct !== null) {
        const memIcon = memPct > 80 ? "🔴" : memPct > 60 ? "🟡" : "🟢";
        lines.push(`🧠 Memória: ${memIcon} *${memPct}%* (pico 24h: ${maxMem > 0 ? maxMem + '%' : 'N/A'})`);
      }
      if (sysInfo.uptime) {
        lines.push(`⏱️ Uptime: *${sysInfo.uptime}*`);
      }

      summaries.push(lines.join("\n"));
    }

    // Build full message
    const brTime = new Intl.DateTimeFormat("pt-BR", {
      timeZone: "America/Sao_Paulo",
      dateStyle: "short",
      timeStyle: "short",
    }).format(now);

    const fullLines: string[] = [];
    fullLines.push("📊 *RESUMO MIKROTIK*");
    fullLines.push(`📅 ${brTime}`);
    fullLines.push("");

    for (let i = 0; i < summaries.length; i++) {
      fullLines.push(summaries[i]);
      if (i < summaries.length - 1) fullLines.push("\n━━━━━━━━━━━━━━━━━━━━━\n");
    }

    fullLines.push("");
    fullLines.push("━━━━━━━━━━━━━━━━━━━━━");
    fullLines.push("_🤖 Resumo automático do monitoramento Mikrotik_");

    const adminContactPhone = settingsMap.admin_contact_phone;
    if (adminContactPhone) {
      fullLines.push(`_📞 Suporte: ${adminContactPhone}_`);
    }

    const text = fullLines.join("\n");

    // Get admin phones
    const { data: adminRoles } = await supabase
      .from("user_roles")
      .select("user_id")
      .eq("role", "admin");

    if (!adminRoles?.length) {
      return new Response(JSON.stringify({ error: "Nenhum admin encontrado" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const adminIds = adminRoles.map((r: any) => r.user_id);
    const { data: adminProfiles } = await supabase
      .from("profiles")
      .select("phone, full_name")
      .in("id", adminIds)
      .not("phone", "is", null);

    if (!adminProfiles?.length) {
      return new Response(JSON.stringify({ error: "Nenhum admin com telefone" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Send to admins
    let sent = false;
    for (const admin of adminProfiles) {
      const phone = cleanPhone(admin.phone);
      if (!phone || phone.length < 10) continue;

      try {
        const res = await fetch(`${apiUrl}/send/text`, {
          method: "POST",
          headers: { "Content-Type": "application/json", token: apiToken },
          body: JSON.stringify({ number: phone, text, linkPreview: false }),
        });

        const status = res.ok ? "sent" : "failed";
        const errMsg = res.ok ? null : await res.text();

        await supabase.from("whatsapp_notification_logs").insert({
          notification_type: "mikrotik_daily_summary",
          recipient_phone: phone,
          message_preview: text.substring(0, 200),
          status,
          error_message: errMsg,
        });

        if (res.ok) sent = true;
      } catch (err: any) {
        await supabase.from("whatsapp_notification_logs").insert({
          notification_type: "mikrotik_daily_summary",
          recipient_phone: phone,
          message_preview: text.substring(0, 200),
          status: "failed",
          error_message: err.message,
        });
      }
    }

    // Send to client WhatsApp groups
    for (const device of devices) {
      const groupId = device.client?.whatsapp_group_id;
      if (groupId) {
        try {
          await fetch(`${apiUrl}/send/text`, {
            method: "POST",
            headers: { "Content-Type": "application/json", token: apiToken },
            body: JSON.stringify({ number: groupId, text, linkPreview: false }),
          });
        } catch (_) {}
      }
    }

    return new Response(
      JSON.stringify({ success: true, whatsapp_sent: sent, devices: devices.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Mikrotik daily summary error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
