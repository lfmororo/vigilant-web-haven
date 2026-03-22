import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const payload = await req.json();
    // payload: { client_id: string, devices: [{ name, host, port?, username?, password?, channels?: number }] }

    const { client_id, devices } = payload;

    if (!client_id || !devices || !Array.isArray(devices) || devices.length === 0) {
      return new Response(
        JSON.stringify({ error: "Payload inválido. Envie client_id e devices[]" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let imported = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (const device of devices) {
      if (!device.name || !device.host) {
        errors.push(`Dispositivo sem nome ou host: ${JSON.stringify(device)}`);
        skipped++;
        continue;
      }

      // Check if DVR already exists (same host + client)
      const { data: existing } = await supabase
        .from("dvr_devices")
        .select("id")
        .eq("client_id", client_id)
        .eq("host", device.host)
        .maybeSingle();

      let dvrId: string;

      if (existing) {
        dvrId = existing.id;
        // Update existing
        await supabase.from("dvr_devices").update({
          name: device.name,
          port: device.port || 80,
          username: device.username || "admin",
          password: device.password || "",
          updated_at: new Date().toISOString(),
        }).eq("id", dvrId);
        skipped++;
      } else {
        // Insert new
        const { data: newDvr, error: insertErr } = await supabase
          .from("dvr_devices")
          .insert({
            client_id,
            name: device.name,
            host: device.host,
            port: device.port || 80,
            username: device.username || "admin",
            password: device.password || "",
          })
          .select("id")
          .single();

        if (insertErr) {
          errors.push(`Erro ao inserir ${device.name}: ${insertErr.message}`);
          continue;
        }
        dvrId = newDvr.id;
        imported++;
      }

      // Create cameras based on channel count
      const channels = device.channels || device.camera_count || 0;
      if (channels > 0) {
        // Check existing cameras for this DVR
        const { data: existingCams } = await supabase
          .from("dvr_cameras")
          .select("channel")
          .eq("dvr_id", dvrId);

        const existingChannels = new Set((existingCams || []).map((c: any) => c.channel));

        const newCams = [];
        for (let ch = 1; ch <= channels; ch++) {
          if (!existingChannels.has(ch)) {
            newCams.push({
              dvr_id: dvrId,
              name: `Câmera ${ch}`,
              channel: ch,
            });
          }
        }

        if (newCams.length > 0) {
          await supabase.from("dvr_cameras").insert(newCams);
        }
      }
    }

    return new Response(
      JSON.stringify({
        ok: true,
        imported,
        skipped,
        total: devices.length,
        errors: errors.length > 0 ? errors : undefined,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("DVR import error:", err);
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
