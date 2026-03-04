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

function extractPollData(body: any): { voterPhone: string; selectedOption: string } {
  let voterPhone = "";
  let selectedOption = "";

  // uazapi format: { EventType: "poll_vote" | "messages.upsert", event: { ... } }
  const eventType = body.EventType || body.eventType || body.event_type || "";
  const eventData = body.event || body.data || body;

  console.log(`EventType: "${eventType}"`);

  // Handle poll_vote EventType from uazapi
  if (eventType === "poll_vote" || eventType === "poll.vote") {
    // uazapi poll_vote: event.Voter, event.SelectedOption / event.Vote
    if (eventData.Voter) {
      voterPhone = cleanPhone(String(eventData.Voter).replace(/@.*/, ""));
    } else if (eventData.voter) {
      voterPhone = cleanPhone(String(eventData.voter).replace(/@.*/, ""));
    } else if (eventData.Chat) {
      voterPhone = cleanPhone(String(eventData.Chat).replace(/@.*/, ""));
    } else if (eventData.chatid) {
      voterPhone = cleanPhone(String(eventData.chatid).replace(/@.*/, ""));
    } else if (eventData.Sender) {
      voterPhone = cleanPhone(String(eventData.Sender).replace(/@.*/, ""));
    }

    selectedOption = eventData.SelectedOption || eventData.selectedOption || eventData.Vote || eventData.vote || "";
    if (!selectedOption && eventData.SelectedOptions) {
      const opts = eventData.SelectedOptions;
      selectedOption = Array.isArray(opts) ? (opts[0]?.Name || opts[0]?.name || opts[0] || "") : "";
    }
    if (!selectedOption && eventData.selectedOptions) {
      const opts = eventData.selectedOptions;
      selectedOption = Array.isArray(opts) ? (opts[0]?.name || opts[0]?.Name || opts[0] || "") : "";
    }
  }

  // Handle messages.upsert with poll data
  if (!selectedOption && (eventType === "messages.upsert" || eventType === "messages_upsert")) {
    const msg = eventData.message || eventData.Message || eventData;
    const pollUpdate = msg.pollUpdateMessage || msg.PollUpdateMessage || msg.pollUpdate || msg.PollUpdate;
    
    if (pollUpdate) {
      if (msg.key?.remoteJid) {
        voterPhone = cleanPhone(String(msg.key.remoteJid).replace(/@.*/, ""));
      } else if (msg.Key?.RemoteJid) {
        voterPhone = cleanPhone(String(msg.Key.RemoteJid).replace(/@.*/, ""));
      }
      
      const votes = pollUpdate.vote || pollUpdate.Vote || pollUpdate.selectedOptions || pollUpdate.SelectedOptions || [];
      if (Array.isArray(votes) && votes.length > 0) {
        selectedOption = votes[0]?.name || votes[0]?.Name || votes[0] || "";
      } else if (typeof votes === "string") {
        selectedOption = votes;
      }
    }
  }

  // Flat format fallback
  if (!voterPhone) {
    const from = body.from || body.From || eventData.from || eventData.From || "";
    if (from) voterPhone = cleanPhone(String(from).replace(/@.*/, ""));
  }
  if (!selectedOption) {
    selectedOption = body.selectedOption || body.SelectedOption || body.vote || body.Vote || "";
  }
  if (!selectedOption && (body.selectedOptions || body.SelectedOptions)) {
    const opts = body.selectedOptions || body.SelectedOptions;
    selectedOption = Array.isArray(opts) ? (opts[0]?.name || opts[0]?.Name || opts[0] || "") : "";
  }

  return { voterPhone, selectedOption: String(selectedOption).trim() };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const bodyStr = JSON.stringify(body);
    console.log("whatsapp-webhook received:", bodyStr.substring(0, 800));

    // Skip delivery/read receipts early
    const eventType = body.EventType || body.eventType || "";
    if (eventType === "messages_update" || eventType === "message_revoke" || eventType === "presence") {
      return new Response(JSON.stringify({ success: true, skipped: "irrelevant_event" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { voterPhone, selectedOption } = extractPollData(body);

    if (!voterPhone || !selectedOption) {
      console.log(`Not a poll vote or missing data. voterPhone="${voterPhone}", selectedOption="${selectedOption}"`);
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

    // Find the profile by phone number - try multiple formats
    const phonesToTry = [voterPhone];
    if (!voterPhone.startsWith("55") && voterPhone.length <= 11) {
      phonesToTry.push(`55${voterPhone}`);
    }
    if (voterPhone.startsWith("55")) {
      phonesToTry.push(voterPhone.substring(2));
    }

    let profile: any = null;

    // Direct match first
    const { data: profiles } = await supabaseAdmin
      .from("profiles")
      .select("id, parent_client_id, phone")
      .or(phonesToTry.map(p => `phone.ilike.%${p}%`).join(","));

    if (profiles && profiles.length > 0) {
      profile = profiles[0];
    } else {
      // Partial match fallback
      const { data: allProfiles } = await supabaseAdmin
        .from("profiles")
        .select("id, phone, parent_client_id")
        .not("phone", "is", null);

      profile = allProfiles?.find(p => {
        const clean = cleanPhone(p.phone || "");
        return clean === voterPhone || clean.endsWith(voterPhone) || voterPhone.endsWith(clean);
      });
    }

    if (!profile) {
      console.log(`No profile found for phone ${voterPhone}`);
      return new Response(JSON.stringify({ success: true, skipped: "no_profile" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`Matched profile ${profile.id} (phone: ${profile.phone}), client: ${profile.parent_client_id}`);

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
