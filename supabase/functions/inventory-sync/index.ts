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
    // GET - List equipment for a client (via query params)
    if (req.method === "GET") {
      const url = new URL(req.url);
      const clientId = url.searchParams.get("client_id");
      const apiKey = url.searchParams.get("api_key");

      if (!clientId || !apiKey) {
        return new Response(
          JSON.stringify({ error: "client_id and api_key are required" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Validate API key
      const { data: keyData, error: keyError } = await supabase
        .from("inventory_api_keys")
        .select("id, client_id, is_active")
        .eq("api_key", apiKey)
        .eq("client_id", clientId)
        .single();

      if (keyError || !keyData || !keyData.is_active) {
        return new Response(
          JSON.stringify({ error: "Invalid or inactive API key" }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Update last_used_at
      await supabase
        .from("inventory_api_keys")
        .update({ last_used_at: new Date().toISOString() })
        .eq("id", keyData.id);

      // Fetch equipment
      const { data: equipment, error: eqError } = await supabase
        .from("equipment_inventory")
        .select("id, name, serial_number, brand, model, location, status, notes")
        .eq("client_id", clientId);

      if (eqError) throw eqError;

      return new Response(
        JSON.stringify({ equipment: equipment || [] }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // POST - Upsert equipment
    if (req.method === "POST") {
      const body = await req.json();
      const { client_id, api_key, equipment } = body;

      if (!client_id || !api_key) {
        return new Response(
          JSON.stringify({ error: "client_id and api_key are required" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (!equipment || !Array.isArray(equipment) || equipment.length === 0) {
        return new Response(
          JSON.stringify({ error: "equipment array is required and must not be empty" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Validate API key
      const { data: keyData, error: keyError } = await supabase
        .from("inventory_api_keys")
        .select("id, client_id, is_active")
        .eq("api_key", api_key)
        .eq("client_id", client_id)
        .single();

      if (keyError || !keyData || !keyData.is_active) {
        return new Response(
          JSON.stringify({ error: "Invalid or inactive API key" }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Update last_used_at
      await supabase
        .from("inventory_api_keys")
        .update({ last_used_at: new Date().toISOString() })
        .eq("id", keyData.id);

      // Load equipment types for name resolution
      const { data: eqTypes } = await supabase
        .from("equipment_types")
        .select("id, name");

      const typeMap = new Map(
        (eqTypes || []).map((t: any) => [t.name.toLowerCase(), t.id])
      );

      let created = 0;
      let updated = 0;
      const errors: string[] = [];
      const diskAlerts: { name: string; serial_number: string; disk_used_gb: number; disk_total_gb: number; pct: number }[] = [];

      for (const item of equipment) {
        try {
          if (!item.name || !item.serial_number) {
            errors.push(`Item skipped: name and serial_number are required`);
            continue;
          }

          // Resolve equipment_type by name
          let equipmentTypeId: string | null = null;
          if (item.equipment_type) {
            equipmentTypeId = typeMap.get(item.equipment_type.toLowerCase()) || null;
          }

          // Check if equipment exists (by serial_number + client_id)
          const { data: existing } = await supabase
            .from("equipment_inventory")
            .select("id")
            .eq("serial_number", item.serial_number)
            .eq("client_id", client_id)
            .maybeSingle();

          // Compute aggregated disk values from disks array or fallback to flat fields
          let aggDiskTotal: number | null = null;
          let aggDiskUsed: number | null = null;
          let aggDiskFree: number | null = null;
          const disksArr: any[] = Array.isArray(item.disks) ? item.disks : [];
          if (disksArr.length > 0) {
            aggDiskTotal = disksArr.reduce((s: number, d: any) => s + (d.disk_total_gb || 0), 0);
            aggDiskUsed = disksArr.reduce((s: number, d: any) => s + (d.disk_used_gb || 0), 0);
            aggDiskFree = disksArr.reduce((s: number, d: any) => s + (d.disk_free_gb || 0), 0);
          } else if (item.disk_total_gb) {
            aggDiskTotal = item.disk_total_gb;
            aggDiskUsed = item.disk_used_gb ?? null;
            aggDiskFree = item.disk_free_gb ?? null;
          }

          const record: any = {
            name: item.name,
            serial_number: item.serial_number,
            brand: item.brand || null,
            model: item.model || null,
            location: item.location || null,
            notes: item.notes || null,
            client_id: client_id,
            status: "active",
            cpu: item.cpu || null,
            ram_total_gb: item.ram_total_gb ?? null,
            disk_total_gb: aggDiskTotal,
            disk_used_gb: aggDiskUsed,
            disk_free_gb: aggDiskFree,
            hardware_updated_at: item.hardware_updated_at || new Date().toISOString(),
            logged_in_user: item.logged_in_user || null,
          };
          if (equipmentTypeId) record.equipment_type_id = equipmentTypeId;

          let equipmentId: string;

          if (existing) {
            equipmentId = existing.id;
            const { error: upErr } = await supabase
              .from("equipment_inventory")
              .update(record)
              .eq("id", existing.id);
            if (upErr) throw upErr;
            updated++;
          } else {
            const { data: inserted, error: inErr } = await supabase
              .from("equipment_inventory")
              .insert(record)
              .select("id")
              .single();
            if (inErr) throw inErr;
            equipmentId = inserted.id;
            created++;
          }

          // Upsert individual disks if provided
          if (disksArr.length > 0) {
            // Delete old disks for this equipment
            await supabase.from("equipment_disks").delete().eq("equipment_id", equipmentId);
            // Insert new ones
            const diskRecords = disksArr.map((d: any) => ({
              equipment_id: equipmentId,
              drive_letter: d.drive_letter || d.letter || null,
              label: d.label || null,
              disk_total_gb: d.disk_total_gb ?? null,
              disk_used_gb: d.disk_used_gb ?? null,
              disk_free_gb: d.disk_free_gb ?? null,
              file_system: d.file_system || null,
            }));
            await supabase.from("equipment_disks").insert(diskRecords);
          }

          // Check disk usage > 90% per disk
          const checkDisks = disksArr.length > 0 ? disksArr : (aggDiskTotal && aggDiskTotal > 0 ? [{ drive_letter: "C:", disk_total_gb: aggDiskTotal, disk_used_gb: aggDiskUsed }] : []);
          for (const d of checkDisks) {
            if (d.disk_total_gb && d.disk_used_gb && d.disk_total_gb > 0) {
              const pct = Math.round((d.disk_used_gb / d.disk_total_gb) * 100);
              if (pct > 90) {
                diskAlerts.push({
                  name: `${item.name}${d.drive_letter ? ` [${d.drive_letter}]` : ""}`,
                  serial_number: item.serial_number || "",
                  disk_used_gb: d.disk_used_gb,
                  disk_total_gb: d.disk_total_gb,
                  pct,
                });
              }
            }
          }
        } catch (err: any) {
          errors.push(`Error processing ${item.serial_number || item.name}: ${err.message}`);
        }
      }

      // Send notifications if new equipment was created
      if (created > 0) {
        try {
          // Get client name
          const { data: clientProfile } = await supabase
            .from("profiles")
            .select("full_name")
            .eq("id", client_id)
            .single();
          const clientName = clientProfile?.full_name || "Cliente";

          // Collect new equipment names for the message
          const newItems = equipment
            .filter((item: any) => item.name && item.serial_number)
            .slice(0, 10)
            .map((item: any) => `• ${item.name}${item.serial_number ? ` (S/N: ${item.serial_number})` : ""}`)
            .join("\n");

          const summary = `📦 *Novos Equipamentos no Inventário*\n\n👤 *Cliente:* ${clientName}\n📊 *Adicionados:* ${created}\n🔄 *Atualizados:* ${updated}\n\n🆕 *Equipamentos:*\n${newItems}${created > 10 ? `\n... e mais ${created - 10}` : ""}`;

          // Telegram notification (fire-and-forget)
          const telegramToken = Deno.env.get("TELEGRAM_BOT_TOKEN");
          const telegramChatId = Deno.env.get("TELEGRAM_CHAT_ID");
          if (telegramToken && telegramChatId) {
            const escaped = summary.replace(/([_*\[\]()~`>#+\-=|{}.!\\])/g, "\\$1");
            fetch(`https://api.telegram.org/bot${telegramToken}/sendMessage`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ chat_id: telegramChatId, text: escaped, parse_mode: "MarkdownV2" }),
            }).catch((e) => console.error("Telegram notify error:", e));
          }

          // WhatsApp notification (fire-and-forget)
          const { data: settingsData } = await supabase
            .from("system_settings")
            .select("key, value");
          const settings: Record<string, string> = {};
          settingsData?.forEach((s: any) => { settings[s.key] = s.value || ""; });

          if (settings.whatsapp_enabled === "true" && settings.whatsapp_api_url && settings.whatsapp_api_token) {
            // Get admin phones
            const { data: adminRoles } = await supabase
              .from("user_roles")
              .select("user_id")
              .eq("role", "admin");
            const adminIds = (adminRoles || []).map((r: any) => r.user_id);

            if (adminIds.length > 0) {
              const { data: adminProfiles } = await supabase
                .from("profiles")
                .select("phone")
                .in("id", adminIds);

              const sendUrl = `${settings.whatsapp_api_url.replace(/\/+$/, "")}/send/text`;
              const plainText = summary.replace(/\*/g, "*"); // WhatsApp uses simple markdown

              for (const admin of adminProfiles || []) {
                if (!admin.phone) continue;
                const phone = admin.phone.replace(/[\s\-\(\)\+]/g, "");
                if (phone.length < 10) continue;
                waFetch(sendUrl, {
                  method: "POST",
                  headers: { "Content-Type": "application/json", token: settings.whatsapp_api_token },
                  body: JSON.stringify({ number: phone, text: plainText }),
                }).catch((e) => console.error("WhatsApp notify error:", e));
              }
            }
          }
        } catch (notifyErr) {
          console.error("Notification error (non-blocking):", notifyErr);
        }
      }

      // Disk usage > 90% alerts
      if (diskAlerts.length > 0) {
        try {
          const { data: clientProfile } = await supabase
            .from("profiles")
            .select("full_name")
            .eq("id", client_id)
            .single();
          const clientName = clientProfile?.full_name || "Cliente";

          const alertItems = diskAlerts
            .map((a) => `• ${a.name} (S/N: ${a.serial_number}) — ${a.pct}% usado (${a.disk_used_gb}/${a.disk_total_gb} GB)`)
            .join("\n");

          const alertMsg = `🚨 *Alerta de Disco Cheio (>90%)*\n\n👤 *Cliente:* ${clientName}\n📊 *Equipamentos:* ${diskAlerts.length}\n\n${alertItems}`;

          // Telegram
          const telegramToken = Deno.env.get("TELEGRAM_BOT_TOKEN");
          const telegramChatId = Deno.env.get("TELEGRAM_CHAT_ID");
          if (telegramToken && telegramChatId) {
            const escaped = alertMsg.replace(/([_*\[\]()~`>#+\-=|{}.!\\])/g, "\\$1");
            fetch(`https://api.telegram.org/bot${telegramToken}/sendMessage`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ chat_id: telegramChatId, text: escaped, parse_mode: "MarkdownV2" }),
            }).catch((e) => console.error("Telegram disk alert error:", e));
          }

          // WhatsApp
          const { data: settingsData2 } = await supabase.from("system_settings").select("key, value");
          const s2: Record<string, string> = {};
          settingsData2?.forEach((s: any) => { s2[s.key] = s.value || ""; });

          if (s2.whatsapp_enabled === "true" && s2.whatsapp_api_url && s2.whatsapp_api_token) {
            const { data: adminRoles2 } = await supabase.from("user_roles").select("user_id").eq("role", "admin");
            const adminIds2 = (adminRoles2 || []).map((r: any) => r.user_id);
            if (adminIds2.length > 0) {
              const { data: adminProfiles2 } = await supabase.from("profiles").select("phone").in("id", adminIds2);
              const sendUrl2 = `${s2.whatsapp_api_url.replace(/\/+$/, "")}/send/text`;
              const plainAlert = alertMsg.replace(/\*/g, "*");
              for (const admin of adminProfiles2 || []) {
                if (!admin.phone) continue;
                const phone = admin.phone.replace(/[\s\-\(\)\+]/g, "");
                if (phone.length < 10) continue;
                waFetch(sendUrl2, {
                  method: "POST",
                  headers: { "Content-Type": "application/json", token: s2.whatsapp_api_token },
                  body: JSON.stringify({ number: phone, text: plainAlert }),
                }).catch((e) => console.error("WhatsApp disk alert error:", e));
              }
            }
          }
        } catch (diskNotifyErr) {
          console.error("Disk alert notification error (non-blocking):", diskNotifyErr);
        }
      }

      return new Response(
        JSON.stringify({
          success: true,
          summary: { created, updated, errors: errors.length, disk_alerts: diskAlerts.length },
          errors: errors.length > 0 ? errors : undefined,
          disk_alerts: diskAlerts.length > 0 ? diskAlerts : undefined,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ error: "Method not allowed" }),
      { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
