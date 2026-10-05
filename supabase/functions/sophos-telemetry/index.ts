/**
 * POST /functions/v1/sophos-telemetry
 *
 * Recebe telemetria dos agentes Sophos XG/SFOS.
 * Header: Authorization: Bearer <api_token>
 *
 * Body (JSON):
 *   { cpuUsage, memoryUsage, diskUsage, interfaces, vpnTunnels, rawPayload? }
 *
 * Regras de alerta automáticas:
 *   - cpuUsage > 90  → severity=critical
 *   - vpnTunnel.status == "disconnected" → severity=warning
 */
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace(/^Bearer\s+/i, "").trim();
    if (!token) return json({ error: "Token ausente" }, 401);

    const body = await req.json().catch(() => ({}));
    const {
      cpuUsage,
      memoryUsage,
      diskUsage,
      interfaces,
      vpnTunnels,
      rawPayload,
      model,
      firmwareVersion,
    } = body as {
      cpuUsage?: number;
      memoryUsage?: number;
      diskUsage?: number;
      interfaces?: Array<{ name: string; status: string; ip?: string; rxMbps?: number; txMbps?: number }>;
      vpnTunnels?: Array<{ name: string; type: string; status: string; localSubnet?: string; remoteSubnet?: string }>;
      rawPayload?: unknown;
      model?: string;
      firmwareVersion?: string;
    };

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // 1. Validar token e buscar firewall
    const { data: firewall, error: fwError } = await supabase
      .from("sophos_firewalls")
      .select("id, name")
      .eq("api_token", token)
      .single();

    if (fwError || !firewall) {
      return json({ error: "Token inválido ou firewall não encontrado" }, 401);
    }

    const now = new Date().toISOString();
    const updates: Record<string, unknown> = {
      status: "online",
      last_seen_at: now,
      updated_at: now,
    };
    if (model)           updates.model = model;
    if (firmwareVersion) updates.firmware_version = firmwareVersion;

    await supabase
      .from("sophos_firewalls")
      .update(updates)
      .eq("id", firewall.id);

    // 2. Inserir telemetria
    const { error: logError } = await supabase.from("sophos_telemetry_logs").insert({
      firewall_id: firewall.id,
      cpu_usage:    cpuUsage ?? null,
      memory_usage: memoryUsage ?? null,
      disk_usage:   diskUsage ?? null,
      interfaces:   interfaces ?? null,
      vpn_tunnels:  vpnTunnels ?? null,
      raw_payload:  rawPayload ?? null,
    });

    if (logError) {
      console.error("sophos-telemetry insert log error:", logError);
      return json({ error: "Falha ao salvar telemetria" }, 500);
    }

    // 3. Regras de alerta
    const alertsToInsert: Array<{
      firewall_id: string;
      severity: "info" | "warning" | "critical";
      title: string;
      message: string;
    }> = [];

    if (cpuUsage !== undefined && cpuUsage > 90) {
      alertsToInsert.push({
        firewall_id: firewall.id,
        severity: "critical",
        title: "CPU elevado no firewall",
        message: `Uso de CPU em ${cpuUsage}% no firewall ${firewall.name} (${firewall.id}). Limiar: 90%.`,
      });
    }

    if (vpnTunnels && Array.isArray(vpnTunnels)) {
      for (const tunnel of vpnTunnels) {
        if (tunnel.status === "disconnected") {
          alertsToInsert.push({
            firewall_id: firewall.id,
            severity: "warning",
            title: `VPN desconectada: ${tunnel.name}`,
            message: `Túnel ${tunnel.type?.toUpperCase() ?? "VPN"} "${tunnel.name}" está desconectado` +
              (tunnel.remoteSubnet ? ` (subrede remota: ${tunnel.remoteSubnet})` : "") +
              ` no firewall ${firewall.name}.`,
          });
        }
      }
    }

    if (alertsToInsert.length > 0) {
      // Limita a 10 alertas por chamada para evitar flood
      for (const alert of alertsToInsert.slice(0, 10)) {
        await supabase.from("sophos_alerts").insert(alert);
      }
    }

    return json({ success: true, timestamp: now });
  } catch (err) {
    console.error("sophos-telemetry error:", err);
    return json({ error: String(err) }, 500);
  }
});
