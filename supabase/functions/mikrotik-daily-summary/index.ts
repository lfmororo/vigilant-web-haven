import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function cleanPhone(phone: string): string {
  return phone.replace(/[\s\-\(\)\+]/g, "");
}

function formatDuration(ms: number): string {
  if (ms < 60000) return `${Math.round(ms / 1000)}s`;
  if (ms < 3600000) return `${Math.round(ms / 60000)}min`;
  const hours = Math.floor(ms / 3600000);
  const mins = Math.round((ms % 3600000) / 60000);
  return `${hours}h${mins > 0 ? mins + 'min' : ''}`;
}

async function buildDeviceSummary(supabase: any, device: any, since24h: string, now: Date): Promise<string> {
  const sysInfo = device.last_system_info || {};
  const health = sysInfo.health || {};
  const clientName = device.client?.full_name || "N/A";

  const { data: sysHistory } = await supabase
    .from("mikrotik_system_history")
    .select("cpu_temp, cpu_load, memory_used_pct, voltage")
    .eq("device_id", device.id)
    .gte("recorded_at", since24h)
    .order("recorded_at", { ascending: true });

  const historyRecords = sysHistory || [];
  let maxTemp = 0, maxCpu = 0, maxMem = 0;
  for (const r of historyRecords) {
    if (r.cpu_temp && r.cpu_temp > maxTemp) maxTemp = r.cpu_temp;
    if (r.cpu_load && r.cpu_load > maxCpu) maxCpu = r.cpu_load;
    if (r.memory_used_pct && r.memory_used_pct > maxMem) maxMem = r.memory_used_pct;
  }

  const cpuTemp = health['cpu-temperature'] || health.temperature || health['board-temperature1'] || null;
  const cpuLoad = sysInfo['cpu-load'] || null;
  const totalMem = parseInt(sysInfo['total-memory'] || '0') || 0;
  const freeMem = parseInt(sysInfo['free-memory'] || '0') || 0;
  const memPct = totalMem > 0 ? Math.round(((totalMem - freeMem) / totalMem) * 100) : null;

  const { data: rebootEvents } = await supabase
    .from("whatsapp_notification_logs")
    .select("id")
    .eq("notification_type", "mikrotik_alert")
    .gte("created_at", since24h)
    .like("message_preview", `%REINICIALIZAÇÃO%${device.name}%`);
  const currentReboot = sysInfo.reboot_detected ? 1 : 0;
  const totalReboots = Math.max((rebootEvents || []).length, currentReboot);

  const { data: ifaceEvents } = await supabase
    .from("mikrotik_interface_events")
    .select("interface_name, event_type, recorded_at")
    .eq("device_id", device.id)
    .gte("recorded_at", since24h)
    .order("recorded_at", { ascending: true });

  const ifaceStats: Record<string, { downCount: number; totalDownMs: number }> = {};
  const ifaceState: Record<string, { isDown: boolean; downSince: string | null }> = {};

  for (const evt of (ifaceEvents || [])) {
    const name = evt.interface_name;
    if (!ifaceStats[name]) {
      ifaceStats[name] = { downCount: 0, totalDownMs: 0 };
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

  for (const [name, state] of Object.entries(ifaceState)) {
    if (state.isDown && state.downSince) {
      ifaceStats[name].totalDownMs += now.getTime() - new Date(state.downSince).getTime();
    }
  }

  const { data: currentInterfaces } = await supabase
    .from("mikrotik_interfaces")
    .select("interface_name, status, running, disabled")
    .eq("device_id", device.id);

  const currentlyDown = (currentInterfaces || []).filter(
    (i: any) => !i.disabled && i.status === "down"
  );

  let arpConflicts = 0;
  let loginDenied = 0;
  const logAlerts = device.last_log_alerts || [];
  for (const log of logAlerts) {
    const msg = (log.message || "").toLowerCase();
    if (msg.includes("arp") && (msg.includes("conflict") || msg.includes("duplicate"))) arpConflicts++;
    if (log.category === "login" || msg.includes("login failure") || msg.includes("login failed") || msg.includes("denied")) loginDenied++;
  }

  const totalDownEvents = Object.values(ifaceStats).reduce((sum, s) => sum + s.downCount, 0);
  const downInterfaces = Object.entries(ifaceStats).filter(([_, s]) => s.downCount > 0);

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

  if (downInterfaces.length > 0) {
    lines.push("");
    lines.push("🔌 *Detalhes Interface Down:*");
    for (const [name, stats] of downInterfaces) {
      const stillDown = ifaceState[name]?.isDown;
      const statusIcon = stillDown ? "🔴" : "🟢";
      lines.push(`  ${statusIcon} *${name}*: ${stats.downCount}x down, tempo total: ${formatDuration(stats.totalDownMs)}${stillDown ? ' _(ainda down)_' : ''}`);
    }
  }

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

  return lines.join("\n");
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
    const { data: settings } = await supabase.from("system_settings").select("key, value");
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
      .select("*, client:clients(id, full_name, whatsapp_group_id, phone)")
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
    const brTime = new Intl.DateTimeFormat("pt-BR", {
      timeZone: "America/Sao_Paulo",
      dateStyle: "short",
      timeStyle: "short",
    }).format(now);

    const adminContactPhone = settingsMap.admin_contact_phone;

    // Get admin phones (admins receive ALL device summaries)
    const { data: adminRoles } = await supabase.from("user_roles").select("user_id").eq("role", "admin");
    const adminIds = (adminRoles || []).map((r: any) => r.user_id);
    const { data: adminProfiles } = adminIds.length > 0
      ? await supabase.from("profiles").select("id, phone, full_name").in("id", adminIds).not("phone", "is", null)
      : { data: [] };

    // Get all technicians
    const { data: techRoles } = await supabase.from("user_roles").select("user_id").eq("role", "technician");
    const techIds = (techRoles || []).map((r: any) => r.user_id);
    let allTechProfiles: any[] = [];
    if (techIds.length > 0) {
      const { data: techs } = await supabase
        .from("profiles")
        .select("id, phone, full_name, parent_client_id")
        .in("id", techIds)
        .not("phone", "is", null);
      allTechProfiles = techs || [];
    }

    // Group devices by client_id
    const devicesByClient: Record<string, any[]> = {};
    for (const device of devices) {
      const cid = device.client_id || "no_client";
      if (!devicesByClient[cid]) devicesByClient[cid] = [];
      devicesByClient[cid].push(device);
    }

    let totalSent = 0;

    // Build and send per-client summaries
    for (const [clientId, clientDevices] of Object.entries(devicesByClient)) {
      // Build summary text for this client's devices only
      const summaries: string[] = [];
      for (const device of clientDevices) {
        const summary = await buildDeviceSummary(supabase, device, since24h, now);
        summaries.push(summary);
      }

      const fullLines: string[] = [];
      fullLines.push("📊 *RESUMO DE DISPOSITIVOS*");
      fullLines.push(`📅 ${brTime}`);
      fullLines.push("");

      for (let i = 0; i < summaries.length; i++) {
        fullLines.push(summaries[i]);
        if (i < summaries.length - 1) fullLines.push("\n━━━━━━━━━━━━━━━━━━━━━\n");
      }

      fullLines.push("");
      fullLines.push("━━━━━━━━━━━━━━━━━━━━━");
      fullLines.push("_🤖 Resumo automático do monitoramento de dispositivos_");
      if (adminContactPhone) {
        fullLines.push(`_📞 Suporte: ${adminContactPhone}_`);
      }

      const text = fullLines.join("\n");

      // Build unique phone list for this client
      const phoneSet = new Set<string>();
      const recipients: { phone: string; source: string }[] = [];

      // 1. Admins always receive
      for (const admin of (adminProfiles || [])) {
        const phone = cleanPhone(admin.phone);
        if (phone && phone.length >= 10 && !phoneSet.has(phone)) {
          phoneSet.add(phone);
          recipients.push({ phone, source: "admin" });
        }
      }

      // 2. Client phone (only the client linked to these devices)
      if (clientId !== "no_client") {
        const clientPhone = clientDevices[0]?.client?.phone;
        if (clientPhone) {
          const phone = cleanPhone(clientPhone);
          if (phone && phone.length >= 10 && !phoneSet.has(phone)) {
            phoneSet.add(phone);
            recipients.push({ phone, source: "client" });
          }
        }

        // 3. Technicians linked to THIS client only
        const linkedTechs = allTechProfiles.filter((t: any) => t.parent_client_id === clientId);
        for (const tech of linkedTechs) {
          const phone = cleanPhone(tech.phone);
          if (phone && phone.length >= 10 && !phoneSet.has(phone)) {
            phoneSet.add(phone);
            recipients.push({ phone, source: "technician" });
          }
        }
      }

      // Send to all recipients for this client
      for (const recipient of recipients) {
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

          if (res.ok) totalSent++;
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

      // Send to client WhatsApp group (only this client's group)
      if (clientId !== "no_client") {
        const groupId = clientDevices[0]?.client?.whatsapp_group_id;
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
    }

    return new Response(
      JSON.stringify({ success: true, whatsapp_sent: totalSent > 0, devices: devices.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Daily summary error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
