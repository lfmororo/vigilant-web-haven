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
      .select("*, client:clients(full_name, whatsapp_group_id, phone)")
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

      // 2. Reboots in last 24h
      const { data: rebootEvents } = await supabase
        .from("whatsapp_notification_logs")
        .select("id")
        .eq("notification_type", "mikrotik_alert")
        .gte("created_at", since24h)
        .like("message_preview", `%REINICIALIZAÇÃO%${device.name}%`);
      const currentReboot = sysInfo.reboot_detected ? 1 : 0;
      const totalReboots = Math.max((rebootEvents || []).length, currentReboot);

      // 3. Interface events from mikrotik_interface_events table
      const { data: ifaceEvents } = await supabase
        .from("mikrotik_interface_events")
        .select("interface_name, event_type, recorded_at")
        .eq("device_id", device.id)
        .gte("recorded_at", since24h)
        .order("recorded_at", { ascending: true });

      // Analyze per-interface down stats
      const ifaceStats: Record<string, { downCount: number; totalDownMs: number; lastDown: string | null }> = {};
      const ifaceState: Record<string, { isDown: boolean; downSince: string | null }> = {};

      for (const evt of (ifaceEvents || [])) {
        const name = evt.interface_name;
        if (!ifaceStats[name]) {
          ifaceStats[name] = { downCount: 0, totalDownMs: 0, lastDown: null };
          ifaceState[name] = { isDown: false, downSince: null };
        }

        if (evt.event_type === "down") {
          ifaceStats[name].downCount++;
          ifaceState[name].isDown = true;
          ifaceState[name].downSince = evt.recorded_at;
        } else if (evt.event_type === "up" && ifaceState[name].isDown && ifaceState[name].downSince) {
          const downDuration = new Date(evt.recorded_at).getTime() - new Date(ifaceState[name].downSince!).getTime();
          ifaceStats[name].totalDownMs += downDuration;
          ifaceState[name].isDown = false;
          ifaceState[name].downSince = null;
        }
      }

      // If still down, add time until now
      for (const [name, state] of Object.entries(ifaceState)) {
        if (state.isDown && state.downSince) {
          ifaceStats[name].totalDownMs += now.getTime() - new Date(state.downSince).getTime();
        }
      }

      // 4. Current interfaces that are down
      const { data: currentInterfaces } = await supabase
        .from("mikrotik_interfaces")
        .select("interface_name, status, running, disabled")
        .eq("device_id", device.id);

      const currentlyDown = (currentInterfaces || []).filter(
        (i: any) => !i.disabled && i.status === "down"
      );

      // Count ARP conflicts and login denied from log_alerts
      let arpConflicts = 0;
      let loginDenied = 0;
      const logAlerts = device.last_log_alerts || [];
      for (const log of logAlerts) {
        const msg = (log.message || "").toLowerCase();
        if (msg.includes("arp") && (msg.includes("conflict") || msg.includes("duplicate"))) {
          arpConflicts++;
        }
        if (log.category === "login" || msg.includes("login failure") || msg.includes("login failed") || msg.includes("denied")) {
          loginDenied++;
        }
      }

      // Format duration
      const formatDuration = (ms: number): string => {
        if (ms < 60000) return `${Math.round(ms / 1000)}s`;
        if (ms < 3600000) return `${Math.round(ms / 60000)}min`;
        const hours = Math.floor(ms / 3600000);
        const mins = Math.round((ms % 3600000) / 60000);
        return `${hours}h${mins > 0 ? mins + 'min' : ''}`;
      };

      // Total interface down events
      const totalDownEvents = Object.values(ifaceStats).reduce((sum, s) => sum + s.downCount, 0);

      // Build device summary
      const lines: string[] = [];
      lines.push(`📡 *${device.name}*`);
      lines.push(`🏢 ${clientName} | 🌐 ${device.host}`);
      lines.push("");
      lines.push("━━━━ Resumo 24h ━━━━");
      lines.push("");
      lines.push(`🔄 Reinicializações: *${totalReboots}*`);
      lines.push(`🔴 Interface Down: *${totalDownEvents} evento(s)*`);
      lines.push(`⚠️ Conflitos ARP: *${arpConflicts}*`);
      lines.push(`🔐 Login negado: *${loginDenied}*`);

      // Per-interface down details
      const downInterfaces = Object.entries(ifaceStats).filter(([_, s]) => s.downCount > 0);
      if (downInterfaces.length > 0) {
        lines.push("");
        lines.push("🔌 *Detalhes Interface Down:*");
        for (const [name, stats] of downInterfaces) {
          const stillDown = ifaceState[name]?.isDown;
          const statusIcon = stillDown ? "🔴" : "🟢";
          lines.push(`  ${statusIcon} *${name}*: ${stats.downCount}x down, tempo total: ${formatDuration(stats.totalDownMs)}${stillDown ? ' _(ainda down)_' : ''}`);
        }
      }

      // Currently down interfaces (even if no events in 24h)
      if (currentlyDown.length > 0) {
        const eventNames = new Set(downInterfaces.map(([n]) => n));
        const additionalDown = currentlyDown.filter((i: any) => !eventNames.has(i.interface_name));
        if (additionalDown.length > 0) {
          if (downInterfaces.length === 0) {
            lines.push("");
            lines.push("🔌 *Interfaces Down Atualmente:*");
          }
          for (const iface of additionalDown) {
            lines.push(`  🔴 *${iface.interface_name}*: down _(sem eventos registrados nas 24h)_`);
          }
        }
      }

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

    const adminIds = (adminRoles || []).map((r: any) => r.user_id);
    const { data: adminProfiles } = adminIds.length > 0
      ? await supabase.from("profiles").select("phone, full_name").in("id", adminIds).not("phone", "is", null)
      : { data: [] };

    // Collect all unique client_ids from devices
    const clientIds = [...new Set(devices.map((d: any) => d.client_id).filter(Boolean))];

    // Get technicians linked to these clients
    const { data: techRoles } = await supabase
      .from("user_roles")
      .select("user_id")
      .eq("role", "technician");

    let techProfiles: any[] = [];
    if (techRoles?.length && clientIds.length > 0) {
      const techIds = techRoles.map((r: any) => r.user_id);
      const { data: techs } = await supabase
        .from("profiles")
        .select("phone, full_name, parent_client_id")
        .in("id", techIds)
        .in("parent_client_id", clientIds)
        .not("phone", "is", null);
      techProfiles = techs || [];
    }

    // Build unique phone list: admins + client phones + technician phones
    const phoneSet = new Set<string>();
    const allPhones: { phone: string; source: string }[] = [];

    for (const admin of (adminProfiles || [])) {
      const phone = cleanPhone(admin.phone);
      if (phone && phone.length >= 10 && !phoneSet.has(phone)) {
        phoneSet.add(phone);
        allPhones.push({ phone, source: "admin" });
      }
    }

    // Add client phones
    for (const device of devices) {
      const clientPhone = device.client?.phone;
      if (clientPhone) {
        const phone = cleanPhone(clientPhone);
        if (phone && phone.length >= 10 && !phoneSet.has(phone)) {
          phoneSet.add(phone);
          allPhones.push({ phone, source: "client" });
        }
      }
    }

    // Add technician phones
    for (const tech of techProfiles) {
      const phone = cleanPhone(tech.phone);
      if (phone && phone.length >= 10 && !phoneSet.has(phone)) {
        phoneSet.add(phone);
        allPhones.push({ phone, source: "technician" });
      }
    }

    // Send to all recipients
    let sent = false;
    for (const recipient of allPhones) {
      try {
        const res = await fetch(`${apiUrl}/send/text`, {
          method: "POST",
          headers: { "Content-Type": "application/json", token: apiToken },
          body: JSON.stringify({ number: recipient.phone, text, linkPreview: false }),
        });

        await supabase.from("whatsapp_notification_logs").insert({
          notification_type: "mikrotik_daily_summary",
          recipient_phone: recipient.phone,
          message_preview: text.substring(0, 200),
          status: res.ok ? "sent" : "failed",
          error_message: res.ok ? null : await res.text(),
        });

        if (res.ok) sent = true;
      } catch (err: any) {
        await supabase.from("whatsapp_notification_logs").insert({
          notification_type: "mikrotik_daily_summary",
          recipient_phone: recipient.phone,
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
