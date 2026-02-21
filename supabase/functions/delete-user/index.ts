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

    // Desvincular dados relacionados (NÃO excluir tickets/OS/mensagens)
    
    // Check if user has tickets - if so, block deletion
    const { data: userTickets } = await supabaseAdmin
      .from("tickets")
      .select("id")
      .or(`client_id.eq.${user_id}`)
      .limit(1);
    
    if (userTickets && userTickets.length > 0) {
      return new Response(JSON.stringify({ 
        error: "Este cliente possui chamados vinculados. Reatribua ou exclua os chamados antes de excluir o cliente." 
      }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check if user has service orders
    const { data: userOrders } = await supabaseAdmin
      .from("service_orders")
      .select("id")
      .eq("client_id", user_id)
      .limit(1);
    
    if (userOrders && userOrders.length > 0) {
      return new Response(JSON.stringify({ 
        error: "Este cliente possui ordens de serviço vinculadas. Exclua-as antes de excluir o cliente." 
      }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Nullify created_by on tickets created by this user
    await supabaseAdmin.from("tickets").update({ created_by: null }).eq("created_by", user_id);
    // Nullify assigned_to on tickets assigned to this user
    await supabaseAdmin.from("tickets").update({ assigned_to: null }).eq("assigned_to", user_id);
    // Nullify technician on service orders
    await supabaseAdmin.from("service_orders").update({ technician_id: null }).eq("technician_id", user_id);
    
    // Delete equipment, API keys, IMAP accounts
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
