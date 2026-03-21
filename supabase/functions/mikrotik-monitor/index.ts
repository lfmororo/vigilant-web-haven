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
    const body = await req.json();
    const { action, device_id } = body;

    if (action === "poll") {
      return await pollDevice(supabase, device_id);
    }

    if (action === "poll_all") {
      return await pollAllDevices(supabase);
    }

    return new Response(
      JSON.stringify({ error: "Invalid action. Use 'poll' or 'poll_all'" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Mikrotik monitor error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

async function pollDevice(supabase: any, deviceId: string) {
  const { data: device, error } = await supabase
    .from("mikrotik_devices")
    .select("*")
    .eq("id", deviceId)
    .eq("is_active", true)
    .single();

  if (error || !device) {
    return new Response(
      JSON.stringify({ error: "Device not found or inactive" }),
      { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const result = await fetchDeviceData(supabase, device);

  return new Response(
    JSON.stringify(result),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
}

async function pollAllDevices(supabase: any) {
  const { data: devices, error } = await supabase
    .from("mikrotik_devices")
    .select("*")
    .eq("is_active", true);

  if (error || !devices?.length) {
    return new Response(
      JSON.stringify({ success: true, message: "No active devices", results: [] }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const results = [];
  for (const device of devices) {
    const result = await fetchDeviceData(supabase, device);
    results.push({ device_id: device.id, name: device.name, ...result });
  }

  return new Response(
    JSON.stringify({ success: true, results }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
}

async function safeFetch(url: string, options: RequestInit): Promise<Response> {
  // Try with default fetch first, then fallback with no TLS verification
  try {
    return await fetch(url, options);
  } catch (err: any) {
    const msg = err?.message || "";
    // If SSL/TLS error, retry without certificate verification
    if (msg.includes("certificate") || msg.includes("Connection reset") || msg.includes("ssl") || msg.includes("tls") || msg.includes("CERTIFICATE")) {
      try {
        const client = Deno.createHttpClient({ caCerts: [] });
        return await fetch(url, { ...options, client } as any);
      } catch (_) {
        // createHttpClient may not be available, try HTTP fallback
      }
    }
    throw err;
  }
}

async function fetchDeviceData(supabase: any, device: any) {
  const auth = btoa(`${device.username}:${device.password}`);
  const headers: Record<string, string> = {
    "Authorization": `Basic ${auth}`,
    "Content-Type": "application/json",
  };

  // Try HTTPS first, then HTTP as fallback
  const protocols = device.use_ssl ? ["https", "http"] : ["http", "https"];
  let baseUrl = "";
  let connected = false;

  for (const proto of protocols) {
    baseUrl = `${proto}://${device.host}:${device.port}/rest`;
    try {
      const testRes = await safeFetch(`${baseUrl}/system/identity`, { headers });
      if (testRes.ok || testRes.status === 401) {
        await testRes.text(); // consume body
        connected = true;
        break;
      }
      await testRes.text();
    } catch (_) {
      console.log(`${proto}://${device.host}:${device.port} failed, trying next...`);
    }
  }

  if (!connected) {
    throw new Error(`Não foi possível conectar à Mikrotik ${device.host}:${device.port}. Verifique se a API REST está habilitada (RouterOS 7.1+), o IP/porta está acessível e as credenciais estão corretas.`);
  }

  let interfacesData: any[] = [];
  let ipAddresses: any[] = [];
  let pppoeInterfaces: any[] = [];
  let lastError: string | null = null;

  try {
    // Fetch interfaces
    const ifRes = await safeFetch(`${baseUrl}/interface`, { headers });
    if (!ifRes.ok) {
      const body = await ifRes.text();
      throw new Error(`Interface API failed: ${ifRes.status} - ${body}`);
    }
    interfacesData = await ifRes.json();

    // Fetch IP addresses
    try {
      const ipRes = await safeFetch(`${baseUrl}/ip/address`, { headers });
      if (ipRes.ok) ipAddresses = await ipRes.json();
      else await ipRes.text();

    // Fetch PPPoE client interfaces
    try {
      const pppoeRes = await fetch(`${baseUrl}/interface/pppoe-client`, { headers });
      if (pppoeRes.ok) pppoeInterfaces = await pppoeRes.json();
    } catch (_) { /* optional */ }

    // Build IP map: interface -> ip
    const ipMap = new Map<string, string>();
    for (const ip of ipAddresses) {
      if (ip.interface) {
        ipMap.set(ip.interface, ip.address || "");
      }
    }

    // Build PPPoE map
    const pppoeMap = new Map<string, any>();
    for (const p of pppoeInterfaces) {
      if (p.name) {
        pppoeMap.set(p.name, p);
      }
    }

    // Upsert interfaces
    for (const iface of interfacesData) {
      const pppoe = pppoeMap.get(iface.name);
      const record: any = {
        device_id: device.id,
        interface_name: iface.name || "unknown",
        interface_type: iface.type || null,
        status: iface.running === "true" || iface.running === true ? "up" : "down",
        running: iface.running === "true" || iface.running === true,
        disabled: iface.disabled === "true" || iface.disabled === true,
        mac_address: iface["mac-address"] || null,
        tx_bytes: parseInt(iface["tx-byte"] || "0") || 0,
        rx_bytes: parseInt(iface["rx-byte"] || "0") || 0,
        tx_packets: parseInt(iface["tx-packet"] || "0") || 0,
        rx_packets: parseInt(iface["rx-packet"] || "0") || 0,
        tx_errors: parseInt(iface["tx-error"] || "0") || 0,
        rx_errors: parseInt(iface["rx-error"] || "0") || 0,
        tx_drops: parseInt(iface["tx-drop"] || "0") || 0,
        rx_drops: parseInt(iface["rx-drop"] || "0") || 0,
        speed: iface.speed || iface["actual-mtu"] || null,
        ip_address: ipMap.get(iface.name) || null,
        updated_at: new Date().toISOString(),
      };

      if (pppoe) {
        record.pppoe_user = pppoe.user || null;
        record.pppoe_service = pppoe["service-name"] || null;
        record.uptime = pppoe.uptime || null;
      }

      // Upsert by device_id + interface_name
      const { data: existing } = await supabase
        .from("mikrotik_interfaces")
        .select("id")
        .eq("device_id", device.id)
        .eq("interface_name", record.interface_name)
        .maybeSingle();

      if (existing) {
        await supabase.from("mikrotik_interfaces").update(record).eq("id", existing.id);
      } else {
        await supabase.from("mikrotik_interfaces").insert(record);
      }
    }

    // Run ping targets
    const { data: pingTargets } = await supabase
      .from("mikrotik_ping_targets")
      .select("*")
      .eq("device_id", device.id)
      .eq("is_active", true);

    if (pingTargets?.length) {
      for (const target of pingTargets) {
        try {
          const pingRes = await fetch(`${baseUrl}/ping`, {
            method: "POST",
            headers,
            body: JSON.stringify({
              address: target.target_ip,
              count: "4",
            }),
          });

          if (pingRes.ok) {
            const pingData = await pingRes.json();
            // RouterOS returns array of ping results
            const results = Array.isArray(pingData) ? pingData : [];
            const lastResult = results[results.length - 1];

            if (lastResult) {
              const sent = parseInt(lastResult.sent || "4");
              const received = parseInt(lastResult.received || "0");
              const avgRtt = parseInt(lastResult["avg-rtt"] || "0");
              const loss = sent > 0 ? Math.round(((sent - received) / sent) * 100) : 100;

              await supabase
                .from("mikrotik_ping_targets")
                .update({
                  latency_ms: avgRtt,
                  packet_loss_pct: loss,
                  last_checked_at: new Date().toISOString(),
                })
                .eq("id", target.id);
            }
          }
        } catch (pingErr) {
          console.error(`Ping to ${target.target_ip} failed:`, pingErr);
        }
      }
    }

    // Update device last_polled_at
    await supabase
      .from("mikrotik_devices")
      .update({ last_polled_at: new Date().toISOString(), last_error: null })
      .eq("id", device.id);

    return { success: true, interfaces: interfacesData.length };
  } catch (err: any) {
    lastError = err.message;
    console.error(`Error polling device ${device.name}:`, err);

    await supabase
      .from("mikrotik_devices")
      .update({ last_error: lastError, last_polled_at: new Date().toISOString() })
      .eq("id", device.id);

    return { success: false, error: lastError };
  }
}
