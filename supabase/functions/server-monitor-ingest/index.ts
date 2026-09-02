import { createClient } from "npm:@supabase/supabase-js@2";
import { getEvolutionConfig, waFetch } from "../_shared/whatsapp.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * Envia um alerta de hardware por WhatsApp para todos os administradores que
 * possuem telefone cadastrado. Falhas de envio nunca derrubam a ingestão.
 */
async function notifyAdmins(supabase: any, text: string): Promise<void> {
  try {
    const cfg = await getEvolutionConfig();
    if (!cfg.enabled || !cfg.baseUrl || !cfg.apiKey) return;

    const { data: adminRoles } = await supabase
      .from("user_roles")
      .select("user_id")
      .eq("role", "admin");
    if (!adminRoles?.length) return;

    const ids = adminRoles.map((r: any) => r.user_id);
    const { data: profiles } = await supabase
      .from("profiles")
      .select("phone")
      .in("id", ids);

    const phones = new Set<string>(
      (profiles || [])
        .map((p: any) => String(p.phone || "").replace(/[\s\-()+]/g, ""))
        .filter((p: string) => p.length >= 10),
    );

    for (const number of phones) {
      await waFetch(`${cfg.baseUrl}/send/text`, {
        method: "POST",
        headers: { "Content-Type": "application/json", token: cfg.apiKey },
        body: JSON.stringify({ number, text, linkPreview: false }),
      });
    }
  } catch (err) {
    console.error("notifyAdmins error:", err);
  }
}

/** Sensor recebido do coletor (Redfish/iLO). */
interface SensorPayload {
  sensor_type?: string;
  name?: string;
  reading?: number | null;
  unit?: string | null;
  status?: string | null;
  health?: string | null;
  upper_critical?: number | null;
  location?: string | null;
}

/** Saúde considerada normal pelo Redfish. */
const SAUDE_OK = new Set(["ok", "enabled", "absent", "n/a", ""]);

/**
 * Classifica um sensor. Devolve `null` quando ele está saudável.
 * Regras:
 *  - health "Critical" -> alerta crítico
 *  - health "Warning" / status não habilitado -> alerta de atenção
 *  - leitura acima do limite crítico informado pelo hardware -> alerta crítico
 */
function classificarSensor(s: SensorPayload): { severity: "warning" | "critical"; motivo: string } | null {
  const health = String(s.health || "").trim().toLowerCase();
  const status = String(s.status || "").trim().toLowerCase();

  if (health === "critical") return { severity: "critical", motivo: "saúde crítica" };
  if (
    typeof s.reading === "number" &&
    typeof s.upper_critical === "number" &&
    s.upper_critical > 0 &&
    s.reading >= s.upper_critical
  ) {
    return { severity: "critical", motivo: `leitura acima do limite (${s.upper_critical}${s.unit || ""})` };
  }
  if (health === "warning") return { severity: "warning", motivo: "saúde em atenção" };
  if (health && !SAUDE_OK.has(health)) return { severity: "warning", motivo: `saúde "${s.health}"` };
  if (status && !SAUDE_OK.has(status)) return { severity: "warning", motivo: `estado "${s.status}"` };
  return null;
}

/** Rótulos amigáveis por tipo de sensor. */
const TIPO_LABEL: Record<string, string> = {
  temperature: "🌡️ Temperatura",
  fan: "🌀 Ventilador",
  power: "🔌 Fonte",
  voltage: "⚡ Tensão",
  storage: "💽 Armazenamento",
  memory: "🧠 Memória",
  processor: "🖳 Processador",
  network: "🌐 Rede",
  other: "🔧 Sensor",
};

/**
 * Reconcilia o estado dos sensores com a tabela `server_sensor_alerts` e envia
 * UMA notificação de WhatsApp por sensor que entrou em alerta (e uma por
 * normalização). O estado persistido evita reenvio a cada coleta.
 */
async function processarAlertasDeSensores(
  supabase: any,
  serverId: string,
  serverName: string,
  sensors: SensorPayload[],
): Promise<{ novos: number; resolvidos: number }> {
  const atuais = new Map<string, { s: SensorPayload; c: { severity: "warning" | "critical"; motivo: string } }>();

  for (const s of sensors) {
    const classificacao = classificarSensor(s);
    if (!classificacao) continue;
    const key = `${String(s.sensor_type || "other")}:${String(s.name || "—")}`.substring(0, 200);
    atuais.set(key, { s, c: classificacao });
  }

  const { data: existentes, error: exErr } = await supabase
    .from("server_sensor_alerts")
    .select("id, sensor_key, sensor_name, severity, status")
    .eq("server_id", serverId);
  if (exErr) {
    console.error("server_sensor_alerts select error:", exErr.message);
    return { novos: 0, resolvidos: 0 };
  }

  const porChave = new Map<string, any>((existentes || []).map((r: any) => [r.sensor_key, r]));
  const agora = new Date().toISOString();
  let novos = 0;
  let resolvidos = 0;

  // 1) Sensores em alerta -> cria/atualiza e notifica somente na abertura ou piora.
  for (const [key, { s, c }] of atuais) {
    const anterior = porChave.get(key);
    const deveNotificar =
      !anterior || anterior.status === "resolved" || (anterior.severity !== "critical" && c.severity === "critical");

    const leitura = typeof s.reading === "number" ? `${s.reading}${s.unit ? ` ${s.unit}` : ""}` : "—";
    const mensagem = `${c.motivo} (leitura: ${leitura})`;

    const { error: upErr } = await supabase.from("server_sensor_alerts").upsert(
      {
        server_id: serverId,
        sensor_key: key,
        sensor_name: String(s.name || "—").substring(0, 200),
        sensor_type: String(s.sensor_type || "other"),
        severity: c.severity,
        status: "active",
        reading: typeof s.reading === "number" ? s.reading : null,
        unit: s.unit ?? null,
        message: mensagem.substring(0, 500),
        last_seen_at: agora,
        resolved_at: null,
        ...(deveNotificar ? { last_notified_at: agora, first_detected_at: agora } : {}),
      },
      { onConflict: "server_id,sensor_key" },
    );
    if (upErr) {
      console.error("server_sensor_alerts upsert error:", upErr.message);
      continue;
    }

    if (deveNotificar) {
      novos++;
      const icone = c.severity === "critical" ? "🔥" : "⚠️";
      const tipo = TIPO_LABEL[String(s.sensor_type || "other")] || TIPO_LABEL.other;
      await notifyAdmins(
        supabase,
        [
          `${icone} *Alerta de sensor — ${serverName}*`,
          "",
          `${tipo}: *${s.name || "—"}*`,
          `Severidade: ${c.severity === "critical" ? "CRÍTICO" : "Atenção"}`,
          `Motivo: ${c.motivo}`,
          `Leitura: ${leitura}`,
          s.location ? `Local: ${s.location}` : "",
          "",
          `_Detectado em ${new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}_`,
        ]
          .filter(Boolean)
          .join("\n"),
      );
    }
  }

  // 2) Sensores que voltaram ao normal -> marca resolvido e avisa uma única vez.
  for (const anterior of existentes || []) {
    if (atuais.has(anterior.sensor_key) || anterior.status === "resolved") continue;

    const { error: resErr } = await supabase
      .from("server_sensor_alerts")
      .update({ status: "resolved", resolved_at: agora, last_notified_at: agora })
      .eq("id", anterior.id);
    if (resErr) {
      console.error("server_sensor_alerts resolve error:", resErr.message);
      continue;
    }

    resolvidos++;
    await notifyAdmins(
      supabase,
      [
        `✅ *Sensor normalizado — ${serverName}*`,
        "",
        `Sensor: *${anterior.sensor_name}*`,
        "O hardware voltou a reportar estado saudável.",
      ].join("\n"),
    );
  }

  return { novos, resolvidos };
}




Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const body = await req.json();
    const { type } = body;

    if (type === "windows") {
      const { server_id, status: serverStatus, cpu_usage, ram_total_gb, ram_used_gb, ram_usage_pct, disk_total_gb, disk_used_gb, disk_free_gb, disk_usage_pct, uptime_seconds, last_boot_time, os_version, services_status, last_error } = body;

      if (!server_id) {
        return new Response(JSON.stringify({ error: "server_id required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const updateData: Record<string, any> = {
        status: serverStatus || "online",
        last_polled_at: new Date().toISOString(),
        last_error: last_error || null,
        updated_at: new Date().toISOString(),
      };

      // Only set metrics if provided (online with full data)
      if (cpu_usage !== undefined) updateData.cpu_usage = cpu_usage;
      if (ram_total_gb !== undefined) updateData.ram_total_gb = ram_total_gb;
      if (ram_used_gb !== undefined) updateData.ram_used_gb = ram_used_gb;
      if (ram_usage_pct !== undefined) updateData.ram_usage_pct = ram_usage_pct;
      if (disk_total_gb !== undefined) updateData.disk_total_gb = disk_total_gb;
      if (disk_used_gb !== undefined) updateData.disk_used_gb = disk_used_gb;
      if (disk_free_gb !== undefined) updateData.disk_free_gb = disk_free_gb;
      if (disk_usage_pct !== undefined) updateData.disk_usage_pct = disk_usage_pct;
      if (uptime_seconds !== undefined) updateData.uptime_seconds = uptime_seconds;
      if (last_boot_time !== undefined) updateData.last_boot_time = last_boot_time;
      if (os_version !== undefined) updateData.os_version = os_version;
      if (services_status !== undefined) updateData.services_status = services_status;

      const { error } = await supabase.from("windows_servers").update(updateData).eq("id", server_id);

      if (error) throw error;

      return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (type === "vmware") {
      const { host_id, cpu_cores, cpu_usage_pct, ram_total_gb, ram_used_gb, ram_usage_pct, esxi_version, uptime_seconds, datastores, vms } = body;

      if (!host_id) {
        return new Response(JSON.stringify({ error: "host_id required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // Update host
      const { error: hostErr } = await supabase.from("vmware_hosts").update({
        status: "online",
        cpu_cores,
        cpu_usage_pct,
        ram_total_gb,
        ram_used_gb,
        ram_usage_pct,
        esxi_version,
        uptime_seconds,
        datastores,
        last_polled_at: new Date().toISOString(),
        last_error: null,
        updated_at: new Date().toISOString(),
      }).eq("id", host_id);

      if (hostErr) throw hostErr;

      // Sync VMs
      if (vms && Array.isArray(vms)) {
        // Delete old VMs for this host
        await supabase.from("vmware_vms").delete().eq("host_id", host_id);

        // Insert new ones
        if (vms.length > 0) {
          const vmRecords = vms.map((vm: any) => ({
            host_id,
            name: vm.name,
            power_state: vm.power_state || "unknown",
            guest_os: vm.guest_os,
            cpu_count: vm.cpu_count,
            ram_mb: vm.ram_mb,
            ip_address: vm.ip_address,
            tools_status: vm.tools_status,
            disk_used_gb: vm.disk_used_gb,
            disk_provisioned_gb: vm.disk_provisioned_gb,
            uptime_seconds: vm.uptime_seconds,
          }));
          const { error: vmErr } = await supabase.from("vmware_vms").insert(vmRecords);
          if (vmErr) throw vmErr;
        }
      }

      return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    /**
     * HP iLO4 (Redfish). O coletor roda na rede do cliente e envia o snapshot
     * completo do servidor: saúde, sensores e eventos de hardware (IML).
     */
    if (type === "ilo") {
      const {
        server_id,
        status: iloStatus,
        last_error: iloError,
        info,
        health,
        sensors,
        events,
      } = body;

      if (!server_id) {
        return new Response(JSON.stringify({ error: "server_id required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // Estado anterior — usado para notificar apenas mudanças para crítico.
      const { data: previous } = await supabase
        .from("ilo_servers")
        .select("id, name, status, health_summary, client_id")
        .eq("id", server_id)
        .maybeSingle();

      if (!previous) {
        return new Response(JSON.stringify({ error: "Server not found" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const updateData: Record<string, any> = {
        status: iloStatus || "online",
        last_error: iloError || null,
        last_polled_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const infoFields = [
        "server_model", "serial_number", "ilo_version", "ilo_firmware", "bios_version",
        "cpu_model", "cpu_count", "ram_total_gb", "power_state", "post_state",
        "indicator_led", "uptime_seconds", "health_summary",
      ];
      for (const field of infoFields) {
        if (info && info[field] !== undefined) updateData[field] = info[field];
      }

      const healthFields = [
        "health_processor", "health_memory", "health_storage",
        "health_fans", "health_power", "health_temperature", "health_network",
      ];
      for (const field of healthFields) {
        if (health && health[field] !== undefined) updateData[field] = health[field];
      }

      const { error: srvErr } = await supabase.from("ilo_servers").update(updateData).eq("id", server_id);
      if (srvErr) throw srvErr;

      // Sensores: substituição total do snapshot (mesma estratégia usada nas VMs).
      if (Array.isArray(sensors)) {
        await supabase.from("ilo_sensors").delete().eq("server_id", server_id);
        if (sensors.length > 0) {
          const rows = sensors.slice(0, 500).map((s: any) => ({
            server_id,
            sensor_type: String(s.sensor_type || "other"),
            name: String(s.name || "—"),
            reading: s.reading ?? null,
            unit: s.unit ?? null,
            status: s.status ?? null,
            health: s.health ?? null,
            upper_critical: s.upper_critical ?? null,
            location: s.location ?? null,
            details: s.details ?? null,
          }));
          const { error: sensorErr } = await supabase.from("ilo_sensors").insert(rows);
          if (sensorErr) throw sensorErr;
        }
      }

      // Eventos IML: upsert por chave única para não duplicar a cada coleta.
      const newCritical: string[] = [];
      if (Array.isArray(events) && events.length > 0) {
        const rows = events.slice(0, 200).map((e: any) => ({
          server_id,
          event_key: String(e.event_key ?? `${e.recorded_at}-${e.message}`).substring(0, 200),
          severity: String(e.severity || "info"),
          category: e.category ?? null,
          message: String(e.message || "").substring(0, 2000),
          recorded_at: e.recorded_at || new Date().toISOString(),
        }));

        const { data: inserted, error: evErr } = await supabase
          .from("ilo_events")
          .upsert(rows, { onConflict: "server_id,event_key", ignoreDuplicates: true })
          .select("id, severity, message");
        if (evErr) console.error("ilo events upsert error:", evErr.message);

        (inserted || []).forEach((e: any) => {
          if (e.severity === "critical") newCritical.push(e.message);
        });
      }

      // Alertas: apenas em transições (evita spam a cada coleta).
      const becameOffline = iloStatus === "offline" && previous.status !== "offline";
      const becameCritical =
        updateData.health_summary === "Critical" && previous.health_summary !== "Critical";

      if (becameOffline || becameCritical || newCritical.length > 0) {
        const lines = [`🖥️ *Alerta iLO — ${previous.name}*`, ""];
        if (becameOffline) lines.push("🔴 Servidor iLO inacessível (offline).");
        if (becameCritical) lines.push("🔥 Saúde geral do hardware em estado CRÍTICO.");
        newCritical.slice(0, 5).forEach((m) => lines.push(`⚠️ ${m}`));
        await notifyAdmins(supabase, lines.join("\n"));
      }

      return new Response(JSON.stringify({ success: true, new_critical: newCritical.length }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    /**
     * Proxmox VE. O coletor roda na rede do cliente, consulta a API REST do
     * Proxmox e envia o snapshot do nó (métricas, storages e VMs/containers).
     */
    if (type === "proxmox") {
      const { node_id, status: pveStatus, last_error: pveError, info, storages, guests } = body;

      if (!node_id) {
        return new Response(JSON.stringify({ error: "node_id required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const { data: previousNode } = await supabase
        .from("proxmox_nodes")
        .select("id, name, status")
        .eq("id", node_id)
        .maybeSingle();

      if (!previousNode) {
        return new Response(JSON.stringify({ error: "Node not found" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const nodeUpdate: Record<string, any> = {
        status: pveStatus || "online",
        last_error: pveError || null,
        last_polled_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const infoFields = [
        "node_name", "pve_version", "cpu_model", "cpu_cores", "cpu_usage_pct",
        "ram_total_gb", "ram_used_gb", "ram_usage_pct", "swap_total_gb", "swap_used_gb",
        "disk_total_gb", "disk_used_gb", "disk_usage_pct", "load_avg", "uptime_seconds",
      ];
      for (const field of infoFields) {
        if (info && info[field] !== undefined) nodeUpdate[field] = info[field];
      }
      if (Array.isArray(storages)) nodeUpdate.storages = storages.slice(0, 100);

      const { error: nodeErr } = await supabase.from("proxmox_nodes").update(nodeUpdate).eq("id", node_id);
      if (nodeErr) throw nodeErr;

      // VMs e containers: substituição total do snapshot (mesma estratégia do VMware).
      if (Array.isArray(guests)) {
        await supabase.from("proxmox_guests").delete().eq("node_id", node_id);
        if (guests.length > 0) {
          const rows = guests.slice(0, 500).map((g: any) => ({
            node_id,
            vmid: Number(g.vmid) || 0,
            name: String(g.name || `VM ${g.vmid}`).substring(0, 200),
            guest_type: g.guest_type === "lxc" ? "lxc" : "qemu",
            status: String(g.status || "unknown"),
            cpu_count: g.cpu_count ?? null,
            cpu_usage_pct: g.cpu_usage_pct ?? null,
            ram_total_gb: g.ram_total_gb ?? null,
            ram_used_gb: g.ram_used_gb ?? null,
            ram_usage_pct: g.ram_usage_pct ?? null,
            disk_total_gb: g.disk_total_gb ?? null,
            disk_used_gb: g.disk_used_gb ?? null,
            uptime_seconds: g.uptime_seconds ?? null,
            tags: g.tags ?? null,
          }));
          const { error: guestErr } = await supabase.from("proxmox_guests").insert(rows);
          if (guestErr) throw guestErr;
        }
      }

      // Alertas apenas em transições, evitando spam a cada coleta.
      const pveBecameOffline = (pveStatus === "offline") && previousNode.status !== "offline";
      const diskCritical = typeof nodeUpdate.disk_usage_pct === "number" && nodeUpdate.disk_usage_pct >= 90;
      if (pveBecameOffline || diskCritical) {
        const lines = [`🧱 *Alerta Proxmox — ${previousNode.name}*`, ""];
        if (pveBecameOffline) lines.push(`🔴 Nó inacessível: ${pveError || "sem resposta da API"}`);
        if (diskCritical) lines.push(`💾 Disco do nó em ${nodeUpdate.disk_usage_pct}% de uso.`);
        await notifyAdmins(supabase, lines.join("\n"));
      }

      return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (type === "list-proxmox") {
      const { data } = await supabase
        .from("proxmox_nodes")
        .select("id, name, host, port, node_name, auth_mode, username, token_name, token_secret, password")
        .eq("is_active", true);
      return new Response(JSON.stringify(data || []), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }


    // List servers/hosts for collector script
    if (type === "list-windows") {
      const { data } = await supabase.from("windows_servers").select("id, name, host").eq("is_active", true);
      return new Response(JSON.stringify(data || []), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (type === "list-vmware") {
      const { data } = await supabase.from("vmware_hosts").select("id, name, host, username, password, port").eq("is_active", true);
      return new Response(JSON.stringify(data || []), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (type === "list-ilo") {
      const { data } = await supabase
        .from("ilo_servers")
        .select("id, name, host, username, password, port")
        .eq("is_active", true);
      return new Response(JSON.stringify(data || []), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }


    return new Response(JSON.stringify({ error: "Unknown type" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    console.error(err);
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
