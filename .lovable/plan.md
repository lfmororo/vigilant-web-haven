
# Relatorio de Chamados por Cliente, Situacao e Periodo

## Objetivo
Criar uma nova pagina de relatorios no painel administrativo que permita filtrar chamados por cliente, status e periodo de datas, com visualizacao em tabela, metricas resumidas e opcao de exportar/imprimir.

## Funcionalidades

1. **Filtros**
   - Selecao de cliente (dropdown com todos os clientes)
   - Selecao de status (todos, aberto, em andamento, aguardando, resolvido, fechado)
   - Periodo de datas (data inicial e data final com date picker)
   - Botao para limpar filtros

2. **Metricas Resumidas (Cards)**
   - Total de chamados no periodo
   - Chamados abertos
   - Chamados resolvidos/fechados
   - Tempo medio de resolucao

3. **Tabela de Resultados**
   - Numero do chamado, titulo, cliente, equipamento, tecnico, prioridade, status, data de abertura, data de resolucao
   - Ordenacao por data

4. **Exportacao**
   - Botao para imprimir o relatorio (window.print com CSS de impressao)

5. **Navegacao**
   - Nova entrada "Relatorios" no menu lateral do admin com icone BarChart3

## Detalhes Tecnicos

### Arquivos a criar
- `src/pages/admin/TicketReports.tsx` - Pagina principal do relatorio

### Arquivos a modificar
- `src/App.tsx` - Adicionar rota `/admin/reports`
- `src/components/admin/AdminLayout.tsx` - Adicionar item "Relatorios" no menu lateral

### Implementacao
- Consulta ao Supabase na tabela `tickets` com joins em `profiles` (cliente e tecnico) e `equipment_types`
- Filtro por `client_id`, `status` e `created_at` entre as datas selecionadas
- Uso dos componentes existentes: `AdminLayout`, `Card`, `Table`, `Select`, `Button`, `Calendar/Popover` (date picker), `TicketStatusBadge`, `PriorityBadge`
- Calculo do tempo medio de resolucao comparando `created_at` com `updated_at` dos chamados resolvidos/fechados
- CSS de impressao com `@media print` para ocultar sidebar e filtros, mostrando apenas o relatorio

### Nao requer alteracoes no banco de dados
Todos os dados necessarios ja existem nas tabelas `tickets`, `profiles` e `equipment_types`.
