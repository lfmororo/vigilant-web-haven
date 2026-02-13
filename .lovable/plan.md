

## Dashboard de Suporte Estilo GLPI

Recriar o dashboard de suporte (`AdminHelpdeskDashboard.tsx`) com visual inspirado no GLPI, usando graficos e metricas detalhadas.

---

### Layout do Dashboard (3 linhas)

**Linha 1 - Contadores por Status:**
5 cards em linha: Novo (open), Atribuido (in_progress), Pendente (waiting_client), Solucionado (resolved), Total Aberto (open + in_progress + waiting_client)

**Linha 2 - Metricas Detalhadas:**
4 cards:
- Tempo e Data (relogio em tempo real, dia da semana, data)
- Total de Chamados (numero total com mini grafico sparkline dos ultimos 7 dias)
- Chamados de Hoje (quantidade criada hoje com percentual de variacao vs ontem)
- Chamados no Prazo % (gauge/indicador visual com percentual de chamados resolvidos)

**Linha 3 - Graficos:**
4 cards com graficos Recharts:
- Chamados por Prioridade (PieChart - low, medium, high, urgent)
- Chamados por Tipo de Equipamento (BarChart horizontal - por equipment_type)
- Tempo de Solucao (PieChart - faixas: < 1 dia, 1-2 dias, 2-3 dias, etc.)
- Top 5 Tecnicos (BarChart horizontal - tecnicos com mais chamados resolvidos)

---

### Dados Necessarios

Buscar todos os tickets (sem limit) para calcular as metricas:
- Todos os tickets com joins em `profiles` (client + assigned_to) e `equipment_types`
- Agrupar por status, prioridade, tipo de equipamento
- Calcular tempo de resolucao (diferenca entre `created_at` e `updated_at` para resolvidos/fechados)
- Contar chamados criados hoje vs ontem
- Agrupar por tecnico atribuido para ranking

---

### Detalhes Tecnicos

**Arquivo a modificar:** `src/pages/admin/AdminHelpdeskDashboard.tsx`

**Bibliotecas utilizadas (ja instaladas):**
- `recharts` - PieChart, BarChart, ResponsiveContainer, Cell, Tooltip
- `date-fns` - formatacao de datas, calculo de diferencas
- Componentes shadcn/ui existentes (Card, etc.)

**Relogio em tempo real:** useState + setInterval atualizando a cada segundo

**Calculo do gauge "Chamados no Prazo":** Percentual de tickets resolvidos/fechados sobre o total (excluindo abertos recentes)

**Sparkline "Total de Chamados":** Agrupar tickets por dia nos ultimos 7 dias usando `created_at` e renderizar com LineChart simplificado

**Cores dos graficos:** Palette escura compativel com o tema atual (cyan/teal para principal, tons de verde, amarelo, vermelho para prioridades)

