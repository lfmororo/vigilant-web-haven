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

      // Build update payload
      const dvrUpdate: any = {
        status: dvr.status,
        last_error: dvr.error || null,
        last_polled_at: now,
        updated_at: now,
      };

      // Disk info
      if (dvr.disk) {
        dvrUpdate.disk_total_gb = dvr.disk.total_gb;
        dvrUpdate.disk_used_gb = dvr.disk.used_gb;
        dvrUpdate.disk_free_gb = dvr.disk.free_gb;
        dvrUpdate.disk_usage_pct = dvr.disk.usage_pct;
      }

      // Device info
      if (dvr.device_info) {
        if (dvr.device_info.model) dvrUpdate.device_model = dvr.device_info.model;
        if (dvr.device_info.firmware) dvrUpdate.firmware_version = dvr.device_info.firmware;
        if (dvr.device_info.serial) dvrUpdate.serial_number = dvr.device_info.serial;
        if (dvr.device_info.uptime_seconds != null) dvrUpdate.uptime_seconds = dvr.device_info.uptime_seconds;
      }

      // Recording status (summary)
      if (dvr.cameras && dvr.cameras.length > 0) {
        const recordingCount = dvr.cameras.filter((c: any) => c.recording_status === "recording").length;
        const totalCams = dvr.cameras.length;
        dvrUpdate.recording_status = recordingCount === totalCams
          ? "all_recording"
          : recordingCount > 0
            ? "partial_recording"
            : "not_recording";
        dvrUpdate.total_channels = totalCams;
      }

      // Update DVR
      await supabase
        .from("dvr_devices")
        .update(dvrUpdate)
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

      // Disk alert event
      if (dvr.disk && dvr.disk.usage_pct > 90) {
        events.push({
          dvr_id: dvr.dvr_id,
          camera_id: null,
          event_type: "disk_critical",
          message: `Disco em ${dvr.disk.usage_pct.toFixed(1)}% — ${dvr.disk.free_gb.toFixed(1)} GB livres`,
          recorded_at: now,
        });
      }

      // Update cameras
      if (dvr.cameras && Array.isArray(dvr.cameras)) {
        for (const cam of dvr.cameras) {
          const { data: prevCam } = await supabase
            .from("dvr_cameras")
            .select("status, recording_status")
            .eq("id", cam.camera_id)
            .single();

          const prevCamStatus = prevCam?.status || "unknown";
          const prevRecording = prevCam?.recording_status || null;

          const camUpdate: any = {
            status: cam.status,
            last_checked_at: now,
            updated_at: now,
          };

          if (cam.recording_status) camUpdate.recording_status = cam.recording_status;
          if (cam.resolution) camUpdate.resolution = cam.resolution;
          if (cam.codec) camUpdate.codec = cam.codec;
          if (cam.fps != null) camUpdate.fps = cam.fps;
          if (cam.motion_detect != null) camUpdate.motion_detect = cam.motion_detect;
          if (cam.video_loss != null) camUpdate.video_loss = cam.video_loss;
          if (cam.camera_type) camUpdate.camera_type = cam.camera_type;

          await supabase
            .from("dvr_cameras")
            .update(camUpdate)
            .eq("id", cam.camera_id);

          // Camera status change event
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

          // Recording status change event
          if (prevRecording && prevRecording !== cam.recording_status) {
            if (cam.recording_status === "not_recording") {
              events.push({
                dvr_id: dvr.dvr_id,
                camera_id: cam.camera_id,
                event_type: "recording_stopped",
                message: `Câmera parou de gravar`,
                recorded_at: now,
              });
            } else if (cam.recording_status === "recording" && prevRecording === "not_recording") {
              events.push({
                dvr_id: dvr.dvr_id,
                camera_id: cam.camera_id,
                event_type: "recording_started",
                message: `Câmera voltou a gravar`,
                recorded_at: now,
              });
            }
          }

          // Video loss event
          if (cam.video_loss === true) {
            events.push({
              dvr_id: dvr.dvr_id,
              camera_id: cam.camera_id,
              event_type: "video_loss",
              message: `Perda de vídeo detectada`,
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

            const icons: Record<string, string> = {
              dvr_online: "✅",
              dvr_offline: "🚨",
              camera_online: "✅",
              camera_offline: "🚨",
              recording_stopped: "⏹️",
              recording_started: "⏺️",
              video_loss: "📵",
              disk_critical: "💾",
            };

            const icon = icons[evt.event_type] || "ℹ️";
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
