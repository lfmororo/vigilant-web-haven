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
  return `${hours}h${mins > 0 ? mins + "min" : ""}`;
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

    // Get active devices
    const { data: devices } = await supabase
      .from("mikrotik_devices")
      .select("*, client:clients(full_name, whatsapp_group_id, phone)")
      .eq("is_active", true);

    if (!devices?.length) {
      return new Response(JSON.stringify({ error: "Nenhum dispositivo ativo" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const now = new Date();
    const since7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    // Generate day labels (last 7 days)
    const dayLabels: string[] = [];
    const dayStarts: Date[] = [];
    const dayEnds: Date[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      d.setHours(0, 0, 0, 0);
      const end = new Date(d);
      end.setHours(23, 59, 59, 999);
      dayLabels.push(d.toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit", timeZone: "America/Sao_Paulo" }));
      dayStarts.push(d);
      dayEnds.push(end);
    }

    const summaries: string[] = [];

    for (const device of devices) {
      const clientName = device.client?.full_name || "N/A";

      // 1. System history (temp, cpu, memory per day)
      const { data: sysHistory } = await supabase
        .from("mikrotik_system_history")
        .select("cpu_temp, cpu_load, memory_used_pct, recorded_at")
        .eq("device_id", device.id)
        .gte("recorded_at", since7d.toISOString())
        .order("recorded_at", { ascending: true });

      const records = sysHistory || [];

      // Per-day peaks
      const dayPeaks = dayLabels.map((_, idx) => {
        const start = dayStarts[idx].getTime();
        const end = dayEnds[idx].getTime();
        const dayRecords = records.filter((r: any) => {
          const t = new Date(r.recorded_at).getTime();
          return t >= start && t <= end;
        });
        let maxTemp = 0, maxCpu = 0, maxMem = 0;
        for (const r of dayRecords) {
          if (r.cpu_temp && r.cpu_temp > maxTemp) maxTemp = r.cpu_temp;
          if (r.cpu_load && r.cpu_load > maxCpu) maxCpu = r.cpu_load;
          if (r.memory_used_pct && r.memory_used_pct > maxMem) maxMem = r.memory_used_pct;
        }
        return { maxTemp, maxCpu, maxMem, count: dayRecords.length };
      });

      // 2. Interface events per day
      const { data: ifaceEvents } = await supabase
        .from("mikrotik_interface_events")
        .select("interface_name, event_type, recorded_at")
        .eq("device_id", device.id)
        .gte("recorded_at", since7d.toISOString())
        .order("recorded_at", { ascending: true });

      // Per-interface per-day down count + total down time
      const ifaceDownPerDay: Record<string, number[]> = {};
      const ifaceTotalDownMs: Record<string, number> = {};
      const ifaceDownCount: Record<string, number> = {};
      const ifaceState: Record<string, { isDown: boolean; downSince: string | null }> = {};

      for (const evt of (ifaceEvents || [])) {
        const name = evt.interface_name;
        if (!ifaceDownPerDay[name]) {
          ifaceDownPerDay[name] = Array(7).fill(0);
          ifaceTotalDownMs[name] = 0;
          ifaceDownCount[name] = 0;
          ifaceState[name] = { isDown: false, downSince: null };
        }

        if (evt.event_type === "down") {
          ifaceDownCount[name]++;
          ifaceState[name].isDown = true;
          ifaceState[name].downSince = evt.recorded_at;
          // Find which day
          const evtTime = new Date(evt.recorded_at).getTime();
          for (let idx = 0; idx < 7; idx++) {
            if (evtTime >= dayStarts[idx].getTime() && evtTime <= dayEnds[idx].getTime()) {
              ifaceDownPerDay[name][idx]++;
              break;
            }
          }
        } else if (evt.event_type === "up" && ifaceState[name].isDown && ifaceState[name].downSince) {
          const duration = new Date(evt.recorded_at).getTime() - new Date(ifaceState[name].downSince!).getTime();
          ifaceTotalDownMs[name] += duration;
          ifaceState[name].isDown = false;
          ifaceState[name].downSince = null;
        }
      }

      // Still down
      for (const [name, state] of Object.entries(ifaceState)) {
        if (state.isDown && state.downSince) {
          ifaceTotalDownMs[name] += now.getTime() - new Date(state.downSince).getTime();
        }
      }

      // 3. Log alerts analysis (ARP conflicts, login denied)
      const logAlerts = device.last_log_alerts || [];
      let arpConflicts = 0;
      let loginDenied = 0;
      for (const log of logAlerts) {
        const msg = (log.message || "").toLowerCase();
        if (msg.includes("arp") && (msg.includes("conflict") || msg.includes("duplicate"))) arpConflicts++;
        if (log.category === "login" || msg.includes("login failure") || msg.includes("login failed") || msg.includes("denied")) loginDenied++;
      }

      // Also count from whatsapp logs for the week
      const { data: whatsappLogs } = await supabase
        .from("whatsapp_notification_logs")
        .select("message_preview, created_at")
        .eq("notification_type", "mikrotik_alert")
        .gte("created_at", since7d.toISOString())
        .like("message_preview", `%${device.name}%`);

      // Count reboots per day from whatsapp logs
      const rebootPerDay = Array(7).fill(0);
      let totalReboots = 0;
      for (const log of (whatsappLogs || [])) {
        const preview = (log.message_preview || "").toUpperCase();
        if (preview.includes("REINICIALIZAÇÃO")) {
          totalReboots++;
          const logTime = new Date(log.created_at).getTime();
          for (let idx = 0; idx < 7; idx++) {
            if (logTime >= dayStarts[idx].getTime() && logTime <= dayEnds[idx].getTime()) {
              rebootPerDay[idx]++;
              break;
            }
          }
        }
      }

      // Build summary
      const lines: string[] = [];
      lines.push(`📡 *${device.name}*`);
      lines.push(`🏢 ${clientName} | 🌐 ${device.host}`);
      lines.push("");

      // Temperature trend
      const hasTemp = dayPeaks.some(d => d.maxTemp > 0);
      if (hasTemp) {
        lines.push("🌡️ *Temperatura (pico/dia):*");
        const tempLine = dayLabels.map((label, idx) => {
          const t = dayPeaks[idx].maxTemp;
          if (t === 0) return `${label}: -`;
          const icon = t > 70 ? "🔴" : t > 55 ? "🟡" : "🟢";
          return `${label}: ${icon}${t}°C`;
        }).join("\n  ");
        lines.push(`  ${tempLine}`);
        lines.push("");
      }

      // CPU trend
      const hasCpu = dayPeaks.some(d => d.maxCpu > 0);
      if (hasCpu) {
        lines.push("💻 *CPU Load (pico/dia):*");
        const cpuLine = dayLabels.map((label, idx) => {
          const c = dayPeaks[idx].maxCpu;
          if (c === 0) return `${label}: -`;
          const icon = c > 80 ? "🔴" : c > 50 ? "🟡" : "🟢";
          return `${label}: ${icon}${c}%`;
        }).join("\n  ");
        lines.push(`  ${cpuLine}`);
        lines.push("");
      }

      // Memory trend
      const hasMem = dayPeaks.some(d => d.maxMem > 0);
      if (hasMem) {
        lines.push("🧠 *Memória (pico/dia):*");
        const memLine = dayLabels.map((label, idx) => {
          const m = dayPeaks[idx].maxMem;
          if (m === 0) return `${label}: -`;
          const icon = m > 80 ? "🔴" : m > 60 ? "🟡" : "🟢";
          return `${label}: ${icon}${m}%`;
        }).join("\n  ");
        lines.push(`  ${memLine}`);
        lines.push("");
      }

      // Interface downs
      const downIfaces = Object.entries(ifaceDownCount).filter(([_, c]) => c > 0);
      if (downIfaces.length > 0) {
        lines.push("🔌 *Interfaces Down (semana):*");
        for (const [name, count] of downIfaces) {
          const totalDown = ifaceTotalDownMs[name] || 0;
          const perDay = ifaceDownPerDay[name];
          const dayDetail = dayLabels.map((l, i) => perDay[i] > 0 ? `${l}:${perDay[i]}` : null).filter(Boolean).join(", ");
          const stillDown = ifaceState[name]?.isDown;
          lines.push(`  ${stillDown ? "🔴" : "🟢"} *${name}*: ${count}x total, ${formatDuration(totalDown)} down`);
          if (dayDetail) lines.push(`    📊 ${dayDetail}`);
        }
        lines.push("");
      }

      // Reboots
      lines.push("🔄 *Reinicializações:* " + (totalReboots > 0 ? `*${totalReboots}*` : "Nenhuma"));
      if (totalReboots > 0) {
        const rebootDetail = dayLabels.map((l, i) => rebootPerDay[i] > 0 ? `${l}:${rebootPerDay[i]}` : null).filter(Boolean).join(", ");
        if (rebootDetail) lines.push(`  📊 ${rebootDetail}`);
      }

      // ARP & Login
      lines.push(`⚠️ *Conflitos ARP:* ${arpConflicts}`);
      lines.push(`🔐 *Logins negados:* ${loginDenied}`);

      // Current uptime
      const sysInfo = device.last_system_info || {};
      if (sysInfo.uptime) {
        lines.push(`⏱️ *Uptime atual:* ${sysInfo.uptime}`);
      }

      summaries.push(lines.join("\n"));
    }

    // Build full message
    const brTime = new Intl.DateTimeFormat("pt-BR", {
      timeZone: "America/Sao_Paulo",
      dateStyle: "long",
    }).format(now);

    const fullLines: string[] = [];
    fullLines.push("📈 *RELATÓRIO SEMANAL MIKROTIK*");
    fullLines.push(`📅 Semana encerrada em ${brTime}`);
    fullLines.push("");

    for (let i = 0; i < summaries.length; i++) {
      fullLines.push(summaries[i]);
      if (i < summaries.length - 1) fullLines.push("\n━━━━━━━━━━━━━━━━━━━━━\n");
    }

    fullLines.push("");
    fullLines.push("━━━━━━━━━━━━━━━━━━━━━");
    fullLines.push("_🤖 Relatório semanal automático do monitoramento Mikrotik_");
    if (settingsMap.admin_contact_phone) {
      fullLines.push(`_📞 Suporte: ${settingsMap.admin_contact_phone}_`);
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

        await supabase.from("whatsapp_notification_logs").insert({
          notification_type: "mikrotik_weekly_report",
          recipient_phone: phone,
          message_preview: text.substring(0, 200),
          status: res.ok ? "sent" : "failed",
          error_message: res.ok ? null : await res.text(),
        });

        if (res.ok) sent = true;
      } catch (err: any) {
        await supabase.from("whatsapp_notification_logs").insert({
          notification_type: "mikrotik_weekly_report",
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
    console.error("Mikrotik weekly report error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
