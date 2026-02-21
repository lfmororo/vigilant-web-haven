const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { ticket_title, ticket_description, ticket_category, ticket_priority, messages } = await req.json();

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    // Build context from ticket data and recent messages
    const chatHistory = (messages || [])
      .slice(-10)
      .map((m: any) => `[${m.sender_name}]: ${m.message}`)
      .join("\n");

    const systemPrompt = `Você é um assistente de suporte técnico especializado em TI. Seu trabalho é sugerir respostas profissionais e úteis para técnicos de suporte responderem aos clientes.

Regras:
- Responda SEMPRE em português brasileiro
- Sugira exatamente 3 respostas diferentes, do mais formal ao mais casual
- Cada sugestão deve ser prática e direta
- Considere o contexto do chamado e as mensagens anteriores
- Use linguagem técnica quando apropriado, mas mantenha a clareza
- Formate cada sugestão como um bloco separado
- Não inclua saudações como "Olá" no início (o técnico pode adicionar depois)
- Foque em resolver o problema ou dar o próximo passo claro ao cliente`;

    const userPrompt = `Chamado: ${ticket_title}
Descrição: ${ticket_description}
${ticket_category ? `Categoria: ${ticket_category}` : ""}
Prioridade: ${ticket_priority}

Histórico recente do chat:
${chatHistory || "(sem mensagens ainda)"}

Sugira 3 respostas que o técnico pode enviar ao cliente:`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        stream: true,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Limite de requisições excedido. Tente novamente em alguns segundos." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Créditos de IA insuficientes. Adicione créditos em Configurações > Workspace > Uso." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      return new Response(JSON.stringify({ error: "Erro no serviço de IA" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(response.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (e) {
    console.error("ai-suggest-reply error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
