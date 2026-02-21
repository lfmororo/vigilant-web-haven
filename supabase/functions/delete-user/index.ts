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
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "No authorization header" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUser = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user: callerUser }, error: userError } = await supabaseUser.auth.getUser();
    if (userError || !callerUser) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: isAdmin } = await supabaseAdmin.rpc("has_role", {
      _user_id: callerUser.id, _role: "admin",
    });

    if (!isAdmin) {
      return new Response(JSON.stringify({ error: "Only admins can delete users" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { user_id } = await req.json();
    if (!user_id) {
      return new Response(JSON.stringify({ error: "user_id is required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (user_id === callerUser.id) {
      return new Response(JSON.stringify({ error: "Você não pode excluir a si mesmo" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Delete related data first (order matters due to foreign keys)
    
    // Get all tickets where user is client or creator
    const { data: userTickets } = await supabaseAdmin
      .from("tickets")
      .select("id")
      .or(`client_id.eq.${user_id},created_by.eq.${user_id}`);
    
    if (userTickets && userTickets.length > 0) {
      const ticketIds = userTickets.map(t => t.id);
      // Delete ticket messages for those tickets
      await supabaseAdmin.from("ticket_messages").delete().in("ticket_id", ticketIds);
      // Delete service orders for those tickets
      await supabaseAdmin.from("service_orders").delete().in("ticket_id", ticketIds);
    }

    // Delete tickets where user is client
    await supabaseAdmin.from("tickets").delete().eq("client_id", user_id);
    // Nullify created_by on remaining tickets
    await supabaseAdmin.from("tickets").update({ created_by: null }).eq("created_by", user_id);
    
    // Delete service orders where user is client or technician
    await supabaseAdmin.from("service_orders").delete().eq("client_id", user_id);
    await supabaseAdmin.from("service_orders").update({ technician_id: null }).eq("technician_id", user_id);
    
    // Delete ticket messages sent by user
    await supabaseAdmin.from("ticket_messages").delete().eq("sender_id", user_id);
    
    // Nullify assigned_to on tickets
    await supabaseAdmin.from("tickets").update({ assigned_to: null }).eq("assigned_to", user_id);
    
    // Delete equipment and API keys
    await supabaseAdmin.from("equipment_inventory").delete().eq("client_id", user_id);
    await supabaseAdmin.from("inventory_api_keys").delete().eq("client_id", user_id);
    await supabaseAdmin.from("imap_accounts").delete().eq("client_id", user_id);
    
    // Update child profiles that reference this user as parent
    await supabaseAdmin.from("profiles").update({ parent_client_id: null }).eq("parent_client_id", user_id);
    
    // Delete user cameras, roles, profile
    await supabaseAdmin.from("user_cameras").delete().eq("user_id", user_id);
    await supabaseAdmin.from("user_roles").delete().eq("user_id", user_id);
    await supabaseAdmin.from("profiles").delete().eq("id", user_id);

    // Delete auth user
    const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(user_id);
    if (deleteError) {
      console.error("Error deleting auth user:", deleteError);
      return new Response(JSON.stringify({ error: deleteError.message }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
