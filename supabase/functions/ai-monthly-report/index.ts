import { createClient } from "npm:@supabase/supabase-js@2";

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
    const { client_id, month, year, sector_ids } = await req.json();

    if (!client_id || !month || !year) {
      return new Response(JSON.stringify({ error: "client_id, month and year are required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const startDate = new Date(year, month - 1, 1).toISOString();
    const endDate = new Date(year, month, 0, 23, 59, 59, 999).toISOString();

    const { data: client } = await supabaseAdmin
      .from("clients")
      .select("full_name")
      .eq("id", client_id)
      .single();

    if (!client) {
      return new Response(JSON.stringify({ error: "Client not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Build query
    let query = supabaseAdmin
      .from("tickets")
      .select(`
        id, ticket_number, title, description, status, priority,
        created_at, updated_at,
        assigned:profiles!tickets_assigned_to_fkey(full_name),
        equipment_type:equipment_types(name),
        sector:client_sectors!tickets_sector_id_fkey(name)
      `)
      .eq("client_id", client_id)
      .gte("created_at", startDate)
      .lte("created_at", endDate)
      .order("created_at", { ascending: true });

    // Filter by sector_ids if provided
    if (sector_ids && Array.isArray(sector_ids) && sector_ids.length > 0) {
      query = query.in("sector_id", sector_ids);
    }

    const { data: tickets } = await query;

    // Get sector names for the filter description
    let sectorFilterNames: string[] = [];
    if (sector_ids && Array.isArray(sector_ids) && sector_ids.length > 0) {
      const { data: sectorData } = await supabaseAdmin
        .from("client_sectors")
        .select("name")
        .in("id", sector_ids);
      sectorFilterNames = (sectorData || []).map((s: any) => s.name);
    }

    if (!tickets?.length) {
      const sectorNote = sectorFilterNames.length > 0 ? ` nos setores: ${sectorFilterNames.join(", ")}` : "";
      return new Response(JSON.stringify({ summary: `Nenhum chamado registrado para ${client.full_name}${sectorNote} no período selecionado.`, ticketCount: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const statusCount: Record<string, number> = {};
    const priorityCount: Record<string, number> = {};
    const technicianCount: Record<string, number> = {};
    const equipmentCount: Record<string, number> = {};
    const sectorCount: Record<string, number> = {};

    for (const t of tickets) {
      statusCount[t.status] = (statusCount[t.status] || 0) + 1;
      priorityCount[t.priority] = (priorityCount[t.priority] || 0) + 1;
      const techName = (t as any).assigned?.full_name || "Não atribuído";
      technicianCount[techName] = (technicianCount[techName] || 0) + 1;
      const equipName = (t as any).equipment_type?.name || "Não informado";
      equipmentCount[equipName] = (equipmentCount[equipName] || 0) + 1;
      const secName = (t as any).sector?.name || "Sem setor";
      sectorCount[secName] = (sectorCount[secName] || 0) + 1;
    }

    const resolved = tickets.filter(t => t.status === "resolved" || t.status === "closed");
    let avgHours = 0;
    if (resolved.length) {
      const total = resolved.reduce((sum, t) => {
        return sum + (new Date(t.updated_at).getTime() - new Date(t.created_at).getTime()) / 3600000;
      }, 0);
      avgHours = Math.round(total / resolved.length);
    }

    const monthNames = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];

    const sectorFilterText = sectorFilterNames.length > 0
      ? `\nFiltro de setores aplicado: ${sectorFilterNames.join(", ")}`
      : "";

    const ticketList = tickets.map(t =>
      `- #${t.ticket_number} "${t.title}" | Status: ${t.status} | Prioridade: ${t.priority} | Técnico: ${(t as any).assigned?.full_name || "N/A"} | Equipamento: ${(t as any).equipment_type?.name || "N/A"} | Setor: ${(t as any).sector?.name || "N/A"}`
    ).join("\n");

    const prompt = `Gere um relatório mensal profissional e detalhado de atendimentos de suporte técnico de TI para o cliente "${client.full_name}", referente ao mês de ${monthNames[month - 1]} de ${year}.${sectorFilterText}

Dados do período:
- Total de chamados: ${tickets.length}
- Por status: ${JSON.stringify(statusCount)}
- Por prioridade: ${JSON.stringify(priorityCount)}
- Por técnico: ${JSON.stringify(technicianCount)}
- Por equipamento: ${JSON.stringify(equipmentCount)}
- Por setor: ${JSON.stringify(sectorCount)}
- Resolvidos/Fechados: ${resolved.length}
- Tempo médio de resolução: ${avgHours}h

Lista de chamados:
${ticketList}

Gere o relatório com as seguintes seções:
1. **Visão Geral**: Resumo executivo do mês${sectorFilterNames.length > 0 ? " (mencione que o relatório é filtrado pelos setores selecionados)" : ""}
2. **Métricas Principais**: Total, resolvidos, tempo médio, distribuição por prioridade
3. **Análise por Setor**: Performance por setor do cliente
4. **Análise por Equipamento**: Tipos de equipamento mais demandados
5. **Desempenho dos Técnicos**: Distribuição de atendimentos
6. **Chamados Críticos**: Destaque para urgentes/altos não resolvidos
7. **Recomendações**: Sugestões de melhoria baseadas nos dados
8. **Conclusão**: Resumo final

Regras:
- Responda SEMPRE em português brasileiro
- Use formatação Markdown
- Seja analítico e profissional
- Inclua percentuais quando relevante
- Destaque pontos de atenção`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: "Você é um analista de suporte técnico especializado em relatórios gerenciais de TI." },
          { role: "user", content: prompt },
        ],
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Tente novamente em alguns segundos." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      throw new Error("AI gateway error");
    }

    const aiData = await response.json();
    const summary = aiData.choices?.[0]?.message?.content || "Não foi possível gerar o relatório.";

    return new Response(JSON.stringify({ summary, ticketCount: tickets.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("ai-monthly-report error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
