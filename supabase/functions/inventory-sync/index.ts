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

          const record: any = {
            name: item.name,
            serial_number: item.serial_number,
            brand: item.brand || null,
            model: item.model || null,
            location: item.location || null,
            notes: item.notes || null,
            client_id: client_id,
            status: "active",
          };
          if (equipmentTypeId) record.equipment_type_id = equipmentTypeId;

          if (existing) {
            // Update
            const { error: upErr } = await supabase
              .from("equipment_inventory")
              .update(record)
              .eq("id", existing.id);
            if (upErr) throw upErr;
            updated++;
          } else {
            // Insert
            const { error: inErr } = await supabase
              .from("equipment_inventory")
              .insert(record);
            if (inErr) throw inErr;
            created++;
          }
        } catch (err: any) {
          errors.push(`Error processing ${item.serial_number || item.name}: ${err.message}`);
        }
      }

      return new Response(
        JSON.stringify({
          success: true,
          summary: { created, updated, errors: errors.length },
          errors: errors.length > 0 ? errors : undefined,
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
