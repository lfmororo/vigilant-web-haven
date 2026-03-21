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
  const doFetch = async (targetUrl: string, extraOpts?: Record<string, unknown>) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
      const res = await fetch(targetUrl, { ...options, ...extraOpts, signal: controller.signal } as any);
      clearTimeout(timeout);
      return res;
    } catch (err: any) {
      clearTimeout(timeout);
      if (err?.name === "AbortError") {
        throw new Error(`Timeout ao conectar em ${targetUrl} (15s)`);
      }
      throw err;
    }
  };

  try {
    return await doFetch(url);
  } catch (err: any) {
    const msg = (err?.message || "").toLowerCase();
    const isTlsLikeError = [
      "certificate", "connection reset", "ssl", "tls",
      "invalidcontenttype", "corrupt message", "handshake",
      "wrong version number", "eof",
    ].some((f) => msg.includes(f));

    if (url.startsWith("https://") && isTlsLikeError) {
      console.log(`TLS error for ${url}: ${err.message}. Retrying without cert verification...`);
      try {
        const client = Deno.createHttpClient({ caCerts: [] });
        return await doFetch(url, { client });
      } catch (retryErr: any) {
        const httpUrl = url.replace("https://", "http://");
        console.log(`HTTPS failed completely, trying HTTP: ${httpUrl}`);
        return await doFetch(httpUrl);
      }
    }

    // For non-TLS errors (connection refused, DNS, timeout), log and rethrow
    console.log(`Connection error for ${url}: ${err.message}`);
    throw err;
  }
}

async function updateDevicePollStatus(supabase: any, deviceId: string, lastError: string | null) {
  await supabase
    .from("mikrotik_devices")
    .update({ last_error: lastError, last_polled_at: new Date().toISOString() })
    .eq("id", deviceId);
}

async function fetchDeviceDataViaProxy(supabase: any, device: any) {
  const proxyUrl = device.proxy_url.replace(/\/+$/, "");
  const proxyHeaders: Record<string, string> = { "Content-Type": "application/json" };
  if (device.proxy_token) {
    proxyHeaders["x-proxy-token"] = device.proxy_token;
  }

  try {
    // Poll via proxy
    const pollRes = await safeFetch(`${proxyUrl}/poll`, {
      method: "POST",
      headers: proxyHeaders,
      body: JSON.stringify({
        host: device.host,
        port: device.api_port || 8728,
        username: device.username,
        password: device.password,
      }),
    });

    if (!pollRes.ok) {
      const errBody = await pollRes.text();
      throw new Error(`Proxy retornou ${pollRes.status}: ${errBody}`);
    }

    const data = await pollRes.json();
    if (!data.success) {
      throw new Error(data.error || "Proxy retornou erro desconhecido");
    }

    // Build IP map
    const ipMap = new Map<string, string>();
    for (const ip of (data.ipAddresses || [])) {
      if (ip.interface) ipMap.set(ip.interface, ip.address || "");
    }

    // Build PPPoE map
    const pppoeMap = new Map<string, any>();
    for (const p of (data.pppoeClients || [])) {
      if (p.name) pppoeMap.set(p.name, p);
    }

    // Upsert interfaces
    const interfacesData = data.interfaces || [];
    for (const iface of interfacesData) {
      const pppoe = pppoeMap.get(iface.name);
      const record: any = {
        device_id: device.id,
        interface_name: iface.name || "unknown",
        interface_type: iface.type || null,
        status: iface.running === true || iface.running === "true" ? "up" : "down",
        running: iface.running === true || iface.running === "true",
        disabled: iface.disabled === true || iface.disabled === "true",
        mac_address: iface["mac-address"] || null,
        tx_bytes: parseInt(iface["tx-byte"] || "0") || 0,
        rx_bytes: parseInt(iface["rx-byte"] || "0") || 0,
        tx_packets: parseInt(iface["tx-packet"] || "0") || 0,
        rx_packets: parseInt(iface["rx-packet"] || "0") || 0,
        tx_errors: parseInt(iface["tx-error"] || "0") || 0,
        rx_errors: parseInt(iface["rx-error"] || "0") || 0,
        tx_drops: parseInt(iface["tx-drop"] || "0") || 0,
        rx_drops: parseInt(iface["rx-drop"] || "0") || 0,
        speed: iface.speed || null,
        ip_address: ipMap.get(iface.name) || null,
        updated_at: new Date().toISOString(),
      };

      if (pppoe) {
        record.pppoe_user = pppoe.user || null;
        record.pppoe_service = pppoe["service-name"] || null;
        record.uptime = pppoe.uptime || null;
      }

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

    // Ping targets via proxy
    const { data: pingTargets } = await supabase
      .from("mikrotik_ping_targets")
      .select("*")
      .eq("device_id", device.id)
      .eq("is_active", true);

    if (pingTargets?.length) {
      for (const target of pingTargets) {
        try {
          const pingRes = await safeFetch(`${proxyUrl}/ping`, {
            method: "POST",
            headers: proxyHeaders,
            body: JSON.stringify({
              host: device.host,
              port: device.api_port || 8728,
              username: device.username,
              password: device.password,
              target_ip: target.target_ip,
              count: 4,
            }),
          });

          if (pingRes.ok) {
            const pingData = await pingRes.json();
            if (pingData.success && pingData.results) {
              const sent = pingData.results.sent || 4;
              const received = pingData.results.received || 0;
              const avgRtt = pingData.results["avg-rtt"] || 0;
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
          } else {
            await pingRes.text();
          }
        } catch (pingErr) {
          console.error(`Proxy ping to ${target.target_ip} failed:`, pingErr);
        }
      }
    }

    await updateDevicePollStatus(supabase, device.id, null);
    return { success: true, interfaces: interfacesData.length, via: "proxy" };
  } catch (err: any) {
    const lastError = `Erro via proxy: ${err?.message || "desconhecido"}`;
    console.error(`Proxy error for device ${device.name}:`, err);
    await updateDevicePollStatus(supabase, device.id, lastError);
    return { success: false, error: lastError };
  }
}

async function fetchDeviceDataDirect(supabase: any, device: any) {
  const auth = btoa(`${device.username}:${device.password}`);
  const headers: Record<string, string> = {
    Authorization: `Basic ${auth}`,
    "Content-Type": "application/json",
  };

  const protocols = device.use_ssl ? ["https", "http"] : ["http", "https"];
  let baseUrl = "";
  let connected = false;
  const connectionAttempts: string[] = [];
  let detectedRouterOS6 = false;

  for (const proto of protocols) {
    const candidateBaseUrl = `${proto}://${device.host}:${device.port}/rest`;

    try {
      const testRes = await safeFetch(`${candidateBaseUrl}/system/identity`, {
        headers,
        redirect: "manual",
      });
      const testBody = await testRes.text();
      const contentType = (testRes.headers.get("content-type") || "").toLowerCase();
      const looksLikeHtml =
        contentType.includes("text/html") || testBody.toLowerCase().includes("<html");

      if (testRes.status >= 200 && testRes.status < 500 && !looksLikeHtml) {
        baseUrl = candidateBaseUrl;
        connected = true;
        break;
      }

      // Detect RouterOS 6.x from WebFig HTML page
      if (looksLikeHtml && testBody.includes("RouterOS router configuration page")) {
        detectedRouterOS6 = true;
      }

      connectionAttempts.push(
        `${proto.toUpperCase()} respondeu ${testRes.status}${looksLikeHtml ? " (HTML/WebFig)" : ""}`
      );
    } catch (err: any) {
      connectionAttempts.push(`${proto.toUpperCase()} erro: ${err?.message || "desconhecido"}`);
      console.log(`${proto}://${device.host}:${device.port} failed, trying next...`);
    }
  }

  // Also try root path to detect RouterOS version
  if (!connected && !detectedRouterOS6) {
    for (const proto of (device.use_ssl ? ["https", "http"] : ["http"])) {
      try {
        const rootRes = await safeFetch(`${proto}://${device.host}:${device.port}/`, {
          headers: { "Content-Type": "text/html" },
          redirect: "manual",
        });
        const rootBody = await rootRes.text();
        if (rootBody.includes("RouterOS router configuration page")) {
          detectedRouterOS6 = true;
          break;
        }
      } catch (_) {}
    }
  }

  if (!connected) {
    let connectionError: string;
    if (detectedRouterOS6) {
      connectionError = `⚠️ ROUTEROS 6.x DETECTADO: O equipamento ${device.host}:${device.port} está rodando RouterOS 6.x que NÃO possui API REST. Para monitorar este dispositivo, configure um proxy intermediário: 1) Instale o script mikrotik-proxy.js em um VPS; 2) Preencha o campo "URL do Proxy" no cadastro deste dispositivo.`;
    } else {
      const details = connectionAttempts.length
        ? ` Detalhes: ${connectionAttempts.join(" | ")}`
        : "";
      connectionError = `Não foi possível conectar à Mikrotik ${device.host}:${device.port}. Verifique se a API REST está habilitada (RouterOS 7.1+), o IP/porta está acessível e as credenciais estão corretas.${details}`;
    }

    await updateDevicePollStatus(supabase, device.id, connectionError);
    return { success: false, error: connectionError, routeros6_detected: detectedRouterOS6 };
  }

  let interfacesData: any[] = [];
  let ipAddresses: any[] = [];
  let pppoeInterfaces: any[] = [];

  try {
    const ifRes = await safeFetch(`${baseUrl}/interface`, { headers });

    if (!ifRes.ok) {
      const body = await ifRes.text();
      if (ifRes.status === 401 || ifRes.status === 403) {
        throw new Error("Falha de autenticação na Mikrotik: usuário ou senha inválidos para API REST.");
      }

      if (ifRes.status === 404) {
        const looksLikeHtml = body.toLowerCase().includes("<html");
        throw new Error(
          looksLikeHtml
            ? `A porta ${device.port} respondeu, mas não é a API REST da Mikrotik (retornou página HTML). Ajuste porta/protocolo do serviço REST em /ip service.`
            : "API REST não encontrada. Verifique se o serviço REST está habilitado no RouterOS (7.1+)."
        );
      }

      throw new Error(`Interface API failed: ${ifRes.status} - ${body}`);
    }

    const interfacesPayload = await ifRes.json();
    interfacesData = Array.isArray(interfacesPayload) ? interfacesPayload : [];

    try {
      const ipRes = await safeFetch(`${baseUrl}/ip/address`, { headers });
      if (ipRes.ok) ipAddresses = await ipRes.json();
      else await ipRes.text();
    } catch (_) {}

    try {
      const pppoeRes = await safeFetch(`${baseUrl}/interface/pppoe-client`, { headers });
      if (pppoeRes.ok) pppoeInterfaces = await pppoeRes.json();
      else await pppoeRes.text();
    } catch (_) {}

    const ipMap = new Map<string, string>();
    for (const ip of ipAddresses) {
      if (ip.interface) ipMap.set(ip.interface, ip.address || "");
    }

    const pppoeMap = new Map<string, any>();
    for (const p of pppoeInterfaces) {
      if (p.name) pppoeMap.set(p.name, p);
    }

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

    const { data: pingTargets } = await supabase
      .from("mikrotik_ping_targets")
      .select("*")
      .eq("device_id", device.id)
      .eq("is_active", true);

    if (pingTargets?.length) {
      for (const target of pingTargets) {
        try {
          const pingRes = await safeFetch(`${baseUrl}/ping`, {
            method: "POST",
            headers,
            body: JSON.stringify({ address: target.target_ip, count: "4" }),
          });

          if (pingRes.ok) {
            const pingData = await pingRes.json();
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
          } else {
            await pingRes.text();
          }
        } catch (pingErr) {
          console.error(`Ping to ${target.target_ip} failed:`, pingErr);
        }
      }
    }

    await updateDevicePollStatus(supabase, device.id, null);
    return { success: true, interfaces: interfacesData.length, via: "direct" };
  } catch (err: any) {
    const lastError = err?.message || "Erro desconhecido ao coletar dados da Mikrotik.";
    console.error(`Error polling device ${device.name}:`, err);
    await updateDevicePollStatus(supabase, device.id, lastError);
    return { success: false, error: lastError };
  }
}

async function fetchDeviceData(supabase: any, device: any) {
  if (device.proxy_url) {
    console.log(`Device ${device.name}: using proxy at ${device.proxy_url}`);
    return fetchDeviceDataViaProxy(supabase, device);
  }
  console.log(`Device ${device.name}: using direct REST API`);
  return fetchDeviceDataDirect(supabase, device);
}