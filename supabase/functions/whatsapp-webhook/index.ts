import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Map poll choices to numeric ratings
const POLL_RATING_MAP: Record<string, number> = {
  "Ótimo": 10,
  "Otimo": 10,
  "Bom": 7,
  "Regular": 4,
  "Péssimo": 1,
  "Pessimo": 1,
};

function cleanPhone(phone: string): string {
  return phone.replace(/[\s\-\(\)\+]/g, "");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    console.log("whatsapp-webhook received:", JSON.stringify(body).substring(0, 500));

    // uazapi sends poll vote data in different formats; handle common ones
    // Typical structure: { event: "messages.upsert", data: { ... } }
    // or direct message object with pollUpdate/poll info

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Extract poll vote info from webhook payload
    let voterPhone = "";
    let selectedOption = "";

    // Handle uazapi webhook format
    if (body.event === "poll.vote" || body.event === "messages.upsert") {
      const data = body.data || body;
      
      // Try to extract voter phone and selected option
      if (data.voter) {
        voterPhone = cleanPhone(data.voter.replace(/@.*/, ""));
      } else if (data.key?.remoteJid) {
        voterPhone = cleanPhone(data.key.remoteJid.replace(/@.*/, ""));
      } else if (data.from) {
        voterPhone = cleanPhone(String(data.from).replace(/@.*/, ""));
      }

      // Get selected option from various possible formats
      if (data.selectedOption) {
        selectedOption = data.selectedOption;
      } else if (data.vote) {
        selectedOption = Array.isArray(data.vote) ? data.vote[0] : data.vote;
      } else if (data.selectedOptions && Array.isArray(data.selectedOptions)) {
        selectedOption = data.selectedOptions[0]?.name || data.selectedOptions[0] || "";
      }
    }

    // Also handle flat format
    if (!voterPhone && body.from) {
      voterPhone = cleanPhone(String(body.from).replace(/@.*/, ""));
    }
    if (!selectedOption && body.selectedOption) {
      selectedOption = body.selectedOption;
    }
    if (!selectedOption && body.vote) {
      selectedOption = Array.isArray(body.vote) ? body.vote[0] : body.vote;
    }
    if (!selectedOption && body.selectedOptions) {
      selectedOption = Array.isArray(body.selectedOptions) 
        ? (body.selectedOptions[0]?.name || body.selectedOptions[0] || "")
        : "";
    }

    if (!voterPhone || !selectedOption) {
      console.log("Not a poll vote or missing data, ignoring webhook");
      return new Response(JSON.stringify({ success: true, skipped: "not_poll_vote" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`Poll vote from ${voterPhone}: "${selectedOption}"`);

    // Map the option to a rating
    const rating = POLL_RATING_MAP[selectedOption];
    if (!rating) {
      console.log(`Unknown poll option: "${selectedOption}", ignoring`);
      return new Response(JSON.stringify({ success: true, skipped: "unknown_option" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Find the profile by phone number
    const { data: profiles } = await supabaseAdmin
      .from("profiles")
      .select("id, parent_client_id")
      .or(`phone.eq.${voterPhone},phone.eq.+${voterPhone},phone.eq.+55${voterPhone}`);

    if (!profiles || profiles.length === 0) {
      // Try partial match
      const { data: allProfiles } = await supabaseAdmin
        .from("profiles")
        .select("id, phone, parent_client_id")
        .not("phone", "is", null);

      const matched = allProfiles?.find(p => {
        const clean = cleanPhone(p.phone || "");
        return clean === voterPhone || clean.endsWith(voterPhone) || voterPhone.endsWith(clean);
      });

      if (!matched) {
        console.log(`No profile found for phone ${voterPhone}`);
        return new Response(JSON.stringify({ success: true, skipped: "no_profile" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      profiles.push(matched);
    }

    const profile = profiles[0];
    const clientId = profile.parent_client_id;

    // Find the most recent pending ticket_rating for this client
    let query = supabaseAdmin
      .from("ticket_ratings")
      .select("id, ticket_id")
      .is("rating", null)
      .order("created_at", { ascending: false })
      .limit(1);

    if (clientId) {
      query = query.eq("client_id", clientId);
    }

    const { data: pendingRatings } = await query;

    if (!pendingRatings || pendingRatings.length === 0) {
      console.log(`No pending rating found for client ${clientId}`);
      return new Response(JSON.stringify({ success: true, skipped: "no_pending_rating" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const pendingRating = pendingRatings[0];

    // Update the rating
    const { error: updateError } = await supabaseAdmin
      .from("ticket_ratings")
      .update({
        rating,
        comment: `Via WhatsApp: ${selectedOption}`,
        rated_at: new Date().toISOString(),
        rating_source: "whatsapp",
      })
      .eq("id", pendingRating.id);

    if (updateError) {
      console.error("Failed to update rating:", updateError);
      return new Response(JSON.stringify({ error: updateError.message }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`Rating updated: ticket_rating ${pendingRating.id} -> ${rating} (${selectedOption}) via WhatsApp`);

    return new Response(JSON.stringify({ success: true, rating, ticket_rating_id: pendingRating.id }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("whatsapp-webhook error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
