import { createClient } from "npm:@supabase/supabase-js@2";
import { waFetch } from "../_shared/whatsapp.ts";

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
  return (phone || "").replace(/[\s\-\(\)\+]/g, "");
}

/**
 * Normaliza o payload do webhook. Na Evolution API o corpo é
 * `{ event: "messages.upsert", instance, data: {...} }` — ou seja, `event` é uma
 * STRING e os dados ficam em `data`. Formatos legados enviavam objetos em `event`.
 */
function normalizeEvent(body: any): { eventType: string; eventData: any } {
  const rawEvent = body?.event;
  const eventType = String(
    (typeof rawEvent === "string" ? rawEvent : "") ||
      body?.EventType || body?.eventType || body?.event_type || "",
  ).toLowerCase();
  const eventData =
    body?.data ||
    (rawEvent && typeof rawEvent === "object" ? rawEvent : null) ||
    body?.message ||
    body ||
    {};
  return { eventType, eventData };
}

function extractPollData(body: any): { voterPhone: string; selectedOption: string } {
  let voterPhone = "";
  let selectedOption = "";
  const { eventType, eventData } = normalizeEvent(body);


  if (eventType === "poll_vote" || eventType === "poll.vote") {
    if (eventData.Voter) voterPhone = cleanPhone(String(eventData.Voter).replace(/@.*/, ""));
    else if (eventData.voter) voterPhone = cleanPhone(String(eventData.voter).replace(/@.*/, ""));
    else if (eventData.Chat) voterPhone = cleanPhone(String(eventData.Chat).replace(/@.*/, ""));
    else if (eventData.chatid) voterPhone = cleanPhone(String(eventData.chatid).replace(/@.*/, ""));
    else if (eventData.Sender) voterPhone = cleanPhone(String(eventData.Sender).replace(/@.*/, ""));

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

  if (
    !selectedOption &&
    ["messages.upsert", "messages_upsert", "messages.update", "messages_update"].includes(eventType)
  ) {
    // Na Evolution o voto chega em data.message.pollUpdateMessage
    const msg = eventData.message || eventData.Message || eventData;

    const pollUpdate = msg.pollUpdateMessage || msg.PollUpdateMessage || msg.pollUpdate || msg.PollUpdate;
    if (pollUpdate) {
      if (msg.key?.remoteJid) voterPhone = cleanPhone(String(msg.key.remoteJid).replace(/@.*/, ""));
      else if (msg.Key?.RemoteJid) voterPhone = cleanPhone(String(msg.Key.RemoteJid).replace(/@.*/, ""));
      const votes = pollUpdate.vote || pollUpdate.Vote || pollUpdate.selectedOptions || pollUpdate.SelectedOptions || [];
      if (Array.isArray(votes) && votes.length > 0) selectedOption = votes[0]?.name || votes[0]?.Name || votes[0] || "";
      else if (typeof votes === "string") selectedOption = votes;
    }
  }

  if (!voterPhone) {
    const from =
      eventData.key?.remoteJid || eventData.Key?.RemoteJid ||
      body.from || body.From || eventData.from || eventData.From || "";
    if (from) voterPhone = cleanPhone(String(from).replace(/@.*/, ""));
  }

  if (!selectedOption) selectedOption = body.selectedOption || body.SelectedOption || body.vote || body.Vote || "";

  return { voterPhone, selectedOption: String(selectedOption).trim() };
}

function extractTextMessage(body: any): { phone: string; text: string; fromMe: boolean; isGroup: boolean; messageType: string } {
  const { eventData } = normalizeEvent(body);
  const msg = eventData.message || eventData.Message || eventData;


  const fromMe = Boolean(
    eventData.fromMe ?? eventData.FromMe ?? eventData.isFromMe ?? eventData.IsFromMe ??
    msg?.fromMe ?? msg?.FromMe ?? msg?.key?.fromMe ?? msg?.Key?.FromMe ?? false
  );

  const remoteJid: string =
    eventData.chatid ||
    eventData.chatId ||
    eventData.Chat ||
    eventData.chat ||
    eventData.sender ||
    eventData.Sender ||
    eventData.from ||
    eventData.From ||
    msg?.chatid ||
    msg?.key?.remoteJid ||
    msg?.Key?.RemoteJid ||
    "";
  const isGroup = String(remoteJid).includes("@g.us");
  const phone = cleanPhone(String(remoteJid).replace(/@.*/, ""));

  const messageType: string = eventData.messageType || eventData.type || msg?.messageType || "";

  let text = "";
  const candidates = [
    eventData.text, eventData.Text,
    eventData.body, eventData.Body,
    eventData.content, eventData.Content,
    eventData.messageText, eventData.MessageText,
    eventData.caption, eventData.Caption,
    msg?.text, msg?.body, msg?.content, msg?.caption, msg?.conversation,
    msg?.message?.conversation,
    msg?.message?.extendedTextMessage?.text,
    msg?.extendedTextMessage?.text,
    msg?.imageMessage?.caption,
    msg?.videoMessage?.caption,
    msg?.documentMessage?.caption,
  ];
  for (const c of candidates) {
    if (typeof c === "string" && c.trim()) { text = c; break; }
  }

  return { phone, text: (text || "").trim(), fromMe, isGroup, messageType };
}

async function loadSettings(supabaseAdmin: any) {
  const { data } = await supabaseAdmin.from("system_settings").select("key, value");
  const s: Record<string, string> = {};
  data?.forEach((r: any) => { s[r.key] = r.value || ""; });
  return s;
}

async function sendWhatsApp(apiUrl: string, apiToken: string, number: string, text: string) {
  const base = apiUrl.replace(/\/+$/, "");
  const resp = await waFetch(`${base}/send/text`, {
    method: "POST",
    headers: { "Content-Type": "application/json", token: apiToken },
    body: JSON.stringify({ number, text, linkPreview: false }),
  });
  if (!resp.ok) {
    const b = await resp.text();
    console.error(`WA send failed to ${number}: ${resp.status} ${b}`);
    return false;
  }
  return true;
}

async function findProfileByPhone(supabaseAdmin: any, phone: string) {
  const phonesToTry = [phone];
  if (!phone.startsWith("55") && phone.length <= 11) phonesToTry.push(`55${phone}`);
  if (phone.startsWith("55")) phonesToTry.push(phone.substring(2));

  const { data: profiles } = await supabaseAdmin
    .from("profiles")
    .select("id, full_name, parent_client_id, phone")
    .or(phonesToTry.map(p => `phone.ilike.%${p}%`).join(","));
  if (profiles && profiles.length > 0) return profiles[0];

  const { data: allProfiles } = await supabaseAdmin
    .from("profiles")
    .select("id, full_name, parent_client_id, phone")
    .not("phone", "is", null);
  return allProfiles?.find((p: any) => {
    const clean = cleanPhone(p.phone || "");
    return clean === phone || clean.endsWith(phone) || phone.endsWith(clean);
  }) || null;
}

async function callAI(systemPrompt: string, userPrompt: string): Promise<string> {
  const key = Deno.env.get("LOVABLE_API_KEY");
  if (!key) throw new Error("LOVABLE_API_KEY not configured");
  const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      response_format: { type: "json_object" },
    }),
  });
  if (!resp.ok) {
    const t = await resp.text();
    throw new Error(`AI gateway ${resp.status}: ${t}`);
  }
  const data = await resp.json();
  return data.choices?.[0]?.message?.content || "{}";
}

async function classifyAndReply(userText: string, history: string): Promise<{
  intent: "support" | "greeting" | "human_request" | "not_resolved" | "resolved" | "other";
  reply: string;
}> {
  const systemPrompt = `Você é um assistente virtual de suporte técnico da FM TechFlow (TI: redes, computadores, servidores, câmeras, DVR, MikroTik, VMware).
Sua tarefa: classificar a mensagem do cliente E gerar uma resposta amigável em português brasileiro.

Retorne APENAS JSON válido no formato:
{"intent":"support|greeting|human_request|not_resolved|resolved|other","reply":"texto da resposta"}

Regras de classificação:
- "support": problema técnico, dúvida técnica, algo não funciona
- "greeting": saudação, "oi", "bom dia", conversa geral
- "human_request": pede atendente/humano/técnico ("quero falar com alguém", "atendente", "humano")
- "not_resolved": após uma resposta anterior, indica que não resolveu ("não resolveu", "continua igual", "não funcionou")
- "resolved": confirma que resolveu ("obrigado", "resolveu", "funcionou", "consegui")
- "other": qualquer outra coisa

Regras de resposta:
- Se "support": tente ajudar com passos claros e diretos (reiniciar, verificar cabo, testar, etc.). No final pergunte "Isso resolveu seu problema? Responda SIM ou NÃO."
- Se "greeting": cumprimente e pergunte como pode ajudar
- Se "human_request": diga que vai abrir um chamado e um técnico entrará em contato
- Se "not_resolved": diga que vai abrir um chamado para atendimento humano
- Se "resolved": agradeça e finalize cordialmente
- Se "other": responda educadamente e oriente a descrever o problema técnico se precisar de suporte
- Máximo 500 caracteres na resposta. Sem markdown pesado. Emojis moderados.`;

  const userPrompt = `Histórico recente:\n${history || "(sem histórico)"}\n\nMensagem atual do cliente:\n${userText}`;
  const raw = await callAI(systemPrompt, userPrompt);
  try {
    const parsed = JSON.parse(raw);
    return {
      intent: parsed.intent || "other",
      reply: String(parsed.reply || "Desculpe, não entendi. Pode reformular?").slice(0, 1000),
    };
  } catch {
    return { intent: "other", reply: "Desculpe, tive um problema ao processar. Pode repetir sua dúvida?" };
  }
}

async function createTicketFromConversation(
  supabaseAdmin: any,
  profile: any,
  userText: string,
  context: any
): Promise<{ ticketId: string | null; ticketNumber: number | null }> {
  if (!profile?.parent_client_id) return { ticketId: null, ticketNumber: null };

  const title = (context.original_question || userText).slice(0, 100);
  const description = [
    `Chamado aberto automaticamente via WhatsApp.`,
    ``,
    `Cliente escreveu: ${context.original_question || userText}`,
    context.ai_reply ? `\nIA respondeu: ${context.ai_reply}` : "",
    context.original_question ? `\nCliente indicou que não resolveu.` : "",
  ].filter(Boolean).join("\n");

  const { data, error } = await supabaseAdmin
    .from("tickets")
    .insert({
      client_id: profile.parent_client_id,
      created_by: profile.id,
      title,
      description,
      priority: "medium",
      status: "open",
    })
    .select("id, ticket_number")
    .single();

  if (error) {
    console.error("Failed to create ticket from WhatsApp:", error);
    return { ticketId: null, ticketNumber: null };
  }
  return { ticketId: data.id, ticketNumber: data.ticket_number };
}

async function notifyAdminsUnknownContact(supabaseAdmin: any, phone: string, text: string) {
  try {
    await supabaseAdmin.functions.invoke("notify-telegram", {
      body: {
        ticket_id: "00000000-0000-0000-0000-000000000000",
        notification_type: "ticket_updated",
        message: `📱 Contato desconhecido no WhatsApp\nTelefone: ${phone}\nMensagem: ${text.slice(0, 300)}`,
        sender_name: phone,
      },
    });
  } catch (e) {
    console.log("Telegram unknown-contact notify skipped:", e);
  }
}

async function handleTextMessage(supabaseAdmin: any, phone: string, text: string) {
  const settings = await loadSettings(supabaseAdmin);
  const enabled = settings.whatsapp_enabled === "true";
  const apiUrl = settings.whatsapp_api_url;
  const apiToken = settings.whatsapp_api_token;
  const aiWebhookEnabled = settings.whatsapp_ai_webhook_enabled !== "false"; // default on

  if (!enabled || !apiUrl || !apiToken || !aiWebhookEnabled) {
    return { skipped: "disabled" };
  }

  // Load or create conversation
  const { data: existingConv } = await supabaseAdmin
    .from("whatsapp_conversations")
    .select("*")
    .eq("phone", phone)
    .maybeSingle();

  const profile = await findProfileByPhone(supabaseAdmin, phone);

  // Unknown contact flow
  if (!profile) {
    const state = existingConv?.state || "idle";

    if (state === "awaiting_identification") {
      // They answered identification — notify admins, keep in idle
      await notifyAdminsUnknownContact(supabaseAdmin, phone, text);
      await sendWhatsApp(apiUrl, apiToken, phone,
        "Obrigado! Recebemos suas informações e nossa equipe entrará em contato em breve. 🙏");
      await supabaseAdmin.from("whatsapp_conversations").upsert({
        phone, state: "idle", context: { identified_as: text.slice(0, 200) }, last_message_at: new Date().toISOString(),
      });
      return { handled: "identification_received" };
    }

    // First contact from unknown number
    await sendWhatsApp(apiUrl, apiToken, phone,
      "Olá! 👋 Sou o assistente virtual da *FM TechFlow*.\n\nSeu número ainda não está cadastrado em nosso sistema. Para atendê-lo, por favor informe:\n\n• Seu *nome completo*\n• Nome da *empresa*\n\nAssim que recebermos, nossa equipe entrará em contato. 🙌");
    await supabaseAdmin.from("whatsapp_conversations").upsert({
      phone, state: "awaiting_identification", context: {}, last_message_at: new Date().toISOString(),
    });
    return { handled: "asked_identification" };
  }

  // Known contact — AI flow
  const context = existingConv?.context || {};
  const state = existingConv?.state || "idle";
  const history = context.history || "";

  let classification: { intent: string; reply: string };
  try {
    classification = await classifyAndReply(text, history);
  } catch (e) {
    console.error("AI classify error:", e);
    await sendWhatsApp(apiUrl, apiToken, phone,
      "Desculpe, estou com dificuldades no momento. Nossa equipe foi notificada. 🙏");
    return { handled: "ai_error" };
  }

  let newState = "idle";
  const newContext: any = {
    history: `${history}\n[cliente]: ${text}\n[bot]: ${classification.reply}`.slice(-1500),
  };

  let replyText = classification.reply;
  let ticketNumber: number | null = null;

  const shouldOpenTicket =
    classification.intent === "human_request" ||
    classification.intent === "not_resolved" ||
    (state === "awaiting_resolution" && /\b(nao|não|no|negativo)\b/i.test(text.trim()));

  if (shouldOpenTicket) {
    const ctx = {
      original_question: context.original_question || text,
      ai_reply: context.ai_reply || classification.reply,
    };
    const { ticketId, ticketNumber: tn } = await createTicketFromConversation(supabaseAdmin, profile, text, ctx);
    ticketNumber = tn;
    if (ticketId) {
      newContext.active_ticket_id = ticketId;
      replyText = `✅ Abri o chamado *#${tn}* para você. Um técnico entrará em contato em breve.\n\nSe precisar acompanhar, acesse nosso portal.`;
      // Notify team via notify-ticket-update
      try {
        await supabaseAdmin.functions.invoke("notify-ticket-update", {
          body: { ticket_id: ticketId, notification_type: "ticket_opened", message: ctx.original_question, sender_name: profile.full_name || phone },
        });
      } catch (e) { console.log("notify-ticket-update skipped:", e); }
    } else {
      replyText = "Não consegui abrir o chamado automaticamente. Por favor entre em contato pelo portal ou aguarde nossa equipe.";
    }
    newState = "idle";
  } else if (classification.intent === "support") {
    newState = "awaiting_resolution";
    newContext.original_question = text;
    newContext.ai_reply = classification.reply;
  } else {
    newState = "idle";
  }

  await sendWhatsApp(apiUrl, apiToken, phone, replyText);

  await supabaseAdmin.from("whatsapp_conversations").upsert({
    phone,
    profile_id: profile.id,
    client_id: profile.parent_client_id || null,
    state: newState,
    context: newContext,
    active_ticket_id: newContext.active_ticket_id || null,
    last_message_at: new Date().toISOString(),
  });

  return { handled: classification.intent, ticket_number: ticketNumber };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json();
    const eventType = body.EventType || body.eventType || "";
    console.log(`whatsapp-webhook eventType=${eventType} body:`, JSON.stringify(body).substring(0, 2000));

    if (eventType === "messages_update" || eventType === "message_revoke" || eventType === "presence" ||
        eventType === "chats" || eventType === "chats_update" || eventType === "contacts" ||
        eventType === "connection" || eventType === "history" || eventType === "call") {
      return new Response(JSON.stringify({ success: true, skipped: "irrelevant_event", eventType }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // 1) Poll vote (existing satisfaction survey flow)
    const { voterPhone, selectedOption } = extractPollData(body);
    if (voterPhone && selectedOption) {
      const rating = POLL_RATING_MAP[selectedOption];
      if (!rating) {
        return new Response(JSON.stringify({ success: true, skipped: "unknown_option" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const phonesToTry = [voterPhone];
      if (!voterPhone.startsWith("55") && voterPhone.length <= 11) phonesToTry.push(`55${voterPhone}`);
      if (voterPhone.startsWith("55")) phonesToTry.push(voterPhone.substring(2));
      let profile: any = null;
      const { data: profiles } = await supabaseAdmin
        .from("profiles").select("id, parent_client_id, phone")
        .or(phonesToTry.map(p => `phone.ilike.%${p}%`).join(","));
      if (profiles && profiles.length > 0) profile = profiles[0];
      else {
        const { data: allProfiles } = await supabaseAdmin
          .from("profiles").select("id, phone, parent_client_id").not("phone", "is", null);
        profile = allProfiles?.find((p: any) => {
          const clean = cleanPhone(p.phone || "");
          return clean === voterPhone || clean.endsWith(voterPhone) || voterPhone.endsWith(clean);
        });
      }
      if (!profile) {
        return new Response(JSON.stringify({ success: true, skipped: "no_profile" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      let query = supabaseAdmin.from("ticket_ratings")
        .select("id, ticket_id").is("rating", null)
        .order("created_at", { ascending: false }).limit(1);
      if (profile.parent_client_id) query = query.eq("client_id", profile.parent_client_id);
      const { data: pending } = await query;
      if (!pending || pending.length === 0) {
        return new Response(JSON.stringify({ success: true, skipped: "no_pending_rating" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      await supabaseAdmin.from("ticket_ratings").update({
        rating, comment: `Via WhatsApp: ${selectedOption}`,
        rated_at: new Date().toISOString(), rating_source: "whatsapp",
      }).eq("id", pending[0].id);
      return new Response(JSON.stringify({ success: true, rating }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 2) Text message → AI flow
    const { phone, text, fromMe, isGroup, messageType } = extractTextMessage(body);
    console.log(`extracted: phone=${phone} fromMe=${fromMe} isGroup=${isGroup} messageType=${messageType} text="${text.substring(0, 100)}"`);
    if (fromMe || isGroup || !phone || !text) {
      return new Response(JSON.stringify({ success: true, skipped: "not_actionable_text", phone, fromMe, isGroup, hasText: Boolean(text), messageType }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const result = await handleTextMessage(supabaseAdmin, phone, text);
    console.log(`handleTextMessage result:`, JSON.stringify(result));
    return new Response(JSON.stringify({ success: true, ...result }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("whatsapp-webhook error:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
