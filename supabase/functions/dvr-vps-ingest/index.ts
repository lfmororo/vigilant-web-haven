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
    // payload: { dvrs: [{ dvr_id, status, error?, cameras: [{ camera_id, status }] }] }

    const { dvrs } = payload;
    if (!dvrs || !Array.isArray(dvrs)) {
      return new Response(JSON.stringify({ error: "Invalid payload" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const now = new Date().toISOString();
    const events: any[] = [];

    for (const dvr of dvrs) {
      // Get previous DVR status
      const { data: prevDvr } = await supabase
        .from("dvr_devices")
        .select("status")
        .eq("id", dvr.dvr_id)
        .single();

      const prevStatus = prevDvr?.status || "unknown";

      // Update DVR status
      await supabase
        .from("dvr_devices")
        .update({
          status: dvr.status,
          last_error: dvr.error || null,
          last_polled_at: now,
          updated_at: now,
        })
        .eq("id", dvr.dvr_id);

      // Record DVR state change event
      if (prevStatus !== dvr.status) {
        events.push({
          dvr_id: dvr.dvr_id,
          camera_id: null,
          event_type: dvr.status === "online" ? "dvr_online" : "dvr_offline",
          message: dvr.status === "online"
            ? `DVR ficou online`
            : `DVR ficou offline${dvr.error ? `: ${dvr.error}` : ""}`,
          recorded_at: now,
        });
      }

      // Update cameras
      if (dvr.cameras && Array.isArray(dvr.cameras)) {
        for (const cam of dvr.cameras) {
          const { data: prevCam } = await supabase
            .from("dvr_cameras")
            .select("status")
            .eq("id", cam.camera_id)
            .single();

          const prevCamStatus = prevCam?.status || "unknown";

          await supabase
            .from("dvr_cameras")
            .update({
              status: cam.status,
              last_checked_at: now,
              updated_at: now,
            })
            .eq("id", cam.camera_id);

          if (prevCamStatus !== cam.status) {
            events.push({
              dvr_id: dvr.dvr_id,
              camera_id: cam.camera_id,
              event_type: cam.status === "online" ? "camera_online" : "camera_offline",
              message: cam.status === "online"
                ? `Câmera ficou online`
                : `Câmera ficou offline (perda de vídeo)`,
              recorded_at: now,
            });
          }
        }
      }
    }

    // Insert events
    if (events.length > 0) {
      await supabase.from("dvr_events").insert(events);
    }

    // Send Telegram notifications for state changes
    if (events.length > 0) {
      try {
        const telegramToken = Deno.env.get("TELEGRAM_BOT_TOKEN");
        const telegramChatId = Deno.env.get("TELEGRAM_CHAT_ID");

        if (telegramToken && telegramChatId) {
          for (const evt of events) {
            // Get DVR name
            const { data: dvrData } = await supabase
              .from("dvr_devices")
              .select("name")
              .eq("id", evt.dvr_id)
              .single();

            let camName = "";
            if (evt.camera_id) {
              const { data: camData } = await supabase
                .from("dvr_cameras")
                .select("name")
                .eq("id", evt.camera_id)
                .single();
              camName = camData?.name || "";
            }

            const icon = evt.event_type.includes("online") ? "✅" : "🚨";
            const subject = evt.camera_id
              ? `${icon} Câmera ${camName} (${dvrData?.name || "DVR"})`
              : `${icon} DVR ${dvrData?.name || ""}`;
            const msg = `${subject}\n${evt.message}`;

            await fetch(
              `https://api.telegram.org/bot${telegramToken}/sendMessage`,
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  chat_id: telegramChatId,
                  text: msg,
                }),
              }
            );
          }
        }
      } catch (e) {
        console.error("Telegram notification error:", e);
      }
    }

    return new Response(
      JSON.stringify({ ok: true, events_recorded: events.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("DVR ingest error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
