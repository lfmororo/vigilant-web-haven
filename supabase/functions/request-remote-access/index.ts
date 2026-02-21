import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const REMOTE_ACCESS_MESSAGE = `Olá! Tudo bem?

Para que possamos verificar e resolver o ocorrido com mais rapidez, precisamos acessar seu computador remotamente.

Por favor, baixe o *AnyDesk* pelo link abaixo, instale e nos envie o número (ID) exibido na tela:

👉 https://anydesk.com/pt/downloads

Após abrir o programa, aparecerá um código de acesso.
Basta nos encaminhar esse código aqui para iniciarmos o atendimento.

Se aparecer alguma mensagem pedindo permissão, pode confirmar o acesso 👍

Ficamos no aguardo!`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { ticket_id, sender_id } = await req.json();

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Fetch ticket
    const { data: ticket } = await supabaseAdmin
      .from("tickets")
      .select("ticket_number, title, client_id, created_by, assigned_to")
      .eq("id", ticket_id)
      .single();

    if (!ticket) {
      return new Response(JSON.stringify({ error: "Ticket not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get sender name
    let senderName = "Sistema";
    if (sender_id) {
      const { data: senderProfile } = await supabaseAdmin
        .from("profiles")
        .select("full_name")
        .eq("id", sender_id)
        .single();
      senderName = senderProfile?.full_name || "Sistema";
    }

    // Load settings
    const { data: settingsData } = await supabaseAdmin
      .from("system_settings")
      .select("key, value");
    const settings: Record<string, string> = {};
    settingsData?.forEach((s: any) => { settings[s.key] = s.value || ""; });

    const baseUrl = settings.app_base_url || "https://vigilant-web-haven.lovable.app";
    const ticketLink = `${baseUrl}/helpdesk/tickets/${ticket_id}`;

    // --- Send Email via notify-ticket-update (reuse SMTP infrastructure) ---
    // We'll call it with a custom message
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const emailPromise = fetch(`${supabaseUrl}/functions/v1/notify-ticket-update`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${supabaseKey}`,
      },
      body: JSON.stringify({
        ticket_id,
        sender_id,
        message: REMOTE_ACCESS_MESSAGE,
        is_internal: false,
        notification_type: "remote_access_requested",
      }),
    }).catch((err) => console.error("Email notification error:", err));

    // --- Send WhatsApp ---
    const whatsappEnabled = settings.whatsapp_enabled === "true";
    const whatsappApiUrl = settings.whatsapp_api_url;
    const whatsappApiToken = settings.whatsapp_api_token;

    let whatsappSent = 0;

    if (whatsappEnabled && whatsappApiUrl && whatsappApiToken) {
      const sendTextUrl = `${whatsappApiUrl.replace(/\/+$/, "")}/send/text`;

      const whatsappText = `🖥️ *Solicitação de Acesso Remoto*\n\n📋 *Ticket:* #${ticket.ticket_number}\n📝 *Assunto:* ${ticket.title}\n👤 *Solicitado por:* ${senderName}\n\n${REMOTE_ACCESS_MESSAGE}\n\n🔗 ${ticketLink}`;

      const phonesToSend = new Set<string>();

      // Creator's phone
      if (ticket.created_by) {
        const { data: creatorProfile } = await supabaseAdmin
          .from("profiles")
          .select("phone")
          .eq("id", ticket.created_by)
          .single();
        if (creatorProfile?.phone) {
          phonesToSend.add(creatorProfile.phone.replace(/[\s\-\(\)\+]/g, ""));
        }
      }

      // Send to individual phones
      for (const phone of phonesToSend) {
        if (phone.length >= 10) {
          try {
            const resp = await fetch(sendTextUrl, {
              method: "POST",
              headers: { "Content-Type": "application/json", token: whatsappApiToken },
              body: JSON.stringify({ number: phone, text: whatsappText, linkPreview: false }),
            });
            if (resp.ok) whatsappSent++;
            else console.error(`WhatsApp failed for ${phone}: ${resp.status}`);
          } catch (err) {
            console.error(`WhatsApp error for ${phone}:`, err);
          }
        }
      }

      // Send to client's WhatsApp group
      if (ticket.client_id) {
        const { data: clientRecord } = await supabaseAdmin
          .from("clients")
          .select("whatsapp_group_id")
          .eq("id", ticket.client_id)
          .single();
        if (clientRecord?.whatsapp_group_id) {
          try {
            const resp = await fetch(sendTextUrl, {
              method: "POST",
              headers: { "Content-Type": "application/json", token: whatsappApiToken },
              body: JSON.stringify({ number: clientRecord.whatsapp_group_id, text: whatsappText, linkPreview: false }),
            });
            if (resp.ok) whatsappSent++;
            else console.error(`WhatsApp group failed: ${resp.status}`);
          } catch (err) {
            console.error("WhatsApp group error:", err);
          }
        }
      }
    }

    await emailPromise;

    // Register in ticket chat history
    await supabaseAdmin.from("ticket_messages").insert({
      ticket_id,
      sender_id: sender_id || ticket.created_by,
      message: `🖥️ Solicitação de Acesso Remoto enviada por ${senderName}.\n\n${REMOTE_ACCESS_MESSAGE}`,
      is_internal: false,
    });

    return new Response(JSON.stringify({ success: true, whatsapp_sent: whatsappSent }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("request-remote-access error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
