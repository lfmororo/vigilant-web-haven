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

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  try {
    // Threshold: dispositivos sem poll há mais de 10 minutos
    const STALE_MINUTES = 10;
    // Cooldown: não reenviar alerta do mesmo dispositivo por 2 horas
    const COOLDOWN_MINUTES = 120;
    const cutoff = new Date(Date.now() - STALE_MINUTES * 60 * 1000).toISOString();

    // Buscar dispositivos ativos que não enviam dados há tempo
    const { data: staleDevices, error } = await supabase
      .from("mikrotik_devices")
      .select("id, name, host, client_id, last_polled_at")
      .eq("is_active", true)
      .not("last_polled_at", "is", null)
      .lt("last_polled_at", cutoff);

    if (error) throw error;

    // Também verificar dispositivos que NUNCA enviaram dados e foram criados há mais de 10 min
    const neverPolledCutoff = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const { data: neverPolled } = await supabase
      .from("mikrotik_devices")
      .select("id, name, host, client_id, last_polled_at, created_at")
      .eq("is_active", true)
      .is("last_polled_at", null)
      .lt("created_at", neverPolledCutoff);

    const allStale = [...(staleDevices || []), ...(neverPolled || [])];
    if (allStale.length === 0) {
      return new Response(
        JSON.stringify({ success: true, stale_devices: 0, message: "Nenhum coletor inativo" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Deduplicação: verificar se já alertou sobre estes dispositivos recentemente
    const cooldownCutoff = new Date(Date.now() - COOLDOWN_MINUTES * 60 * 1000).toISOString();
    const { data: recentAlerts } = await supabase
      .from("whatsapp_notification_logs")
      .select("message_preview, created_at")
      .eq("notification_type", "mikrotik_stale_collector")
      .eq("status", "sent")
      .gte("created_at", cooldownCutoff)
      .order("created_at", { ascending: false })
      .limit(10);

    // Extrair nomes de dispositivos já alertados recentemente
    const recentlyAlertedDevices = new Set<string>();
    for (const alert of (recentAlerts || [])) {
      const preview = alert.message_preview || "";
      // Extrair nomes dos dispositivos do preview (formato: *NOME* (HOST))
      const matches = preview.matchAll(/\*([^*]+)\*\s*\(/g);
      for (const m of matches) {
        recentlyAlertedDevices.add(m[1]);
      }
    }

    // Filtrar dispositivos que já foram alertados no cooldown
    const newStaleDevices = allStale.filter((dev: any) => !recentlyAlertedDevices.has(dev.name));

    if (newStaleDevices.length === 0) {
      return new Response(
        JSON.stringify({ 
          success: true, 
          stale_devices: allStale.length, 
          skipped_cooldown: allStale.length,
          message: "Todos já alertados recentemente" 
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Carregar configurações WhatsApp
    const { data: settings } = await supabase
      .from("system_settings")
      .select("key, value");

    const settingsMap: Record<string, string> = {};
    for (const s of (settings || [])) {
      settingsMap[s.key] = s.value || "";
    }

    if (settingsMap.whatsapp_enabled !== "true" || settingsMap.notif_mikrotik_alert === "false") {
      return new Response(
        JSON.stringify({ success: true, stale_devices: newStaleDevices.length, whatsapp_disabled: true }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const apiUrl = settingsMap.whatsapp_api_url;
    const apiToken = settingsMap.whatsapp_api_token;
    if (!apiUrl || !apiToken) {
      return new Response(
        JSON.stringify({ success: false, error: "WhatsApp não configurado" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Buscar admins
    const { data: adminRoles } = await supabase
      .from("user_roles")
      .select("user_id")
      .eq("role", "admin");

    if (!adminRoles?.length) {
      return new Response(
        JSON.stringify({ success: false, error: "Nenhum admin encontrado" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: adminProfiles } = await supabase
      .from("profiles")
      .select("phone, full_name")
      .in("id", adminRoles.map((r: any) => r.user_id))
      .not("phone", "is", null);

    if (!adminProfiles?.length) {
      return new Response(
        JSON.stringify({ success: false, error: "Nenhum admin com telefone" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Buscar nomes dos clientes
    const clientIds = [...new Set(newStaleDevices.map((d: any) => d.client_id))];
    const { data: clients } = await supabase
      .from("clients")
      .select("id, full_name")
      .in("id", clientIds);

    const clientMap: Record<string, string> = {};
    for (const c of (clients || [])) {
      clientMap[c.id] = c.full_name;
    }

    // Montar mensagem
    const lines: string[] = [];
    lines.push("🚨 *ALERTA: DISPOSITIVO SEM COMUNICAÇÃO*");
    lines.push("");
    lines.push(`Os seguintes dispositivos não enviam dados há mais de ${STALE_MINUTES} minutos:`);
    lines.push("");

    for (const dev of newStaleDevices) {
      const clientName = clientMap[dev.client_id] || "N/A";
      const lastPoll = dev.last_polled_at
        ? new Intl.DateTimeFormat("pt-BR", {
            timeZone: "America/Sao_Paulo",
            dateStyle: "short",
            timeStyle: "medium",
          }).format(new Date(dev.last_polled_at))
        : "Nunca";

      const minutesAgo = dev.last_polled_at
        ? Math.round((Date.now() - new Date(dev.last_polled_at).getTime()) / 60000)
        : null;

      const timeAgoText = minutesAgo
        ? minutesAgo >= 60
          ? `${Math.floor(minutesAgo / 60)}h${minutesAgo % 60}min atrás`
          : `${minutesAgo} min atrás`
        : "";

      lines.push(`🔴 *${dev.name}* (${dev.host})`);
      lines.push(`   🏢 Cliente: ${clientName}`);
      lines.push(`   🕐 Último envio: ${lastPoll}${timeAgoText ? ` (${timeAgoText})` : ""}`);
      lines.push("");
    }

    lines.push("⚙️ Verifique se o script coletor está rodando na VPS.");
    lines.push("_ℹ️ Próximo alerta sobre estes dispositivos somente em 2 horas._");
    lines.push("");

    const now = new Date();
    const brTime = new Intl.DateTimeFormat("pt-BR", {
      timeZone: "America/Sao_Paulo",
      dateStyle: "short",
      timeStyle: "medium",
    }).format(now);
    lines.push(`🕐 ${brTime}`);
    lines.push("_🤖 Alerta automático do monitoramento_");

    const text = lines.join("\n");

    // Enviar para admins
    let sent = false;
    for (const admin of adminProfiles) {
      const phone = admin.phone.replace(/[\s\-\(\)\+]/g, "");
      if (!phone || phone.length < 10) continue;

      try {
        const res = await waFetch(`${apiUrl}/send/text`, {
          method: "POST",
          headers: { "Content-Type": "application/json", token: apiToken },
          body: JSON.stringify({ number: phone, text, linkPreview: false }),
        });

        const status = res.ok ? "sent" : "failed";
        const errMsg = res.ok ? null : await res.text();

        await supabase.from("whatsapp_notification_logs").insert({
          notification_type: "mikrotik_stale_collector",
          recipient_phone: phone,
          message_preview: text.substring(0, 200),
          status,
          error_message: errMsg,
        });

        if (res.ok) sent = true;
      } catch (err: any) {
        await supabase.from("whatsapp_notification_logs").insert({
          notification_type: "mikrotik_stale_collector",
          recipient_phone: phone,
          message_preview: text.substring(0, 200),
          status: "failed",
          error_message: err.message,
        });
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        stale_devices: newStaleDevices.length,
        skipped_cooldown: allStale.length - newStaleDevices.length,
        whatsapp_sent: sent,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Mikrotik stale collector error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
