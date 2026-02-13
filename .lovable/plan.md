

# Filtro padrao "Em Aberto" e colunas de tempo nos chamados

## Mudancas

### 1. Filtro padrao alterado para "open"
Ambas as telas de listagem de chamados (admin e cliente) iniciarao com o filtro de status em "Aberto" em vez de "Todos".

- `AdminTicketsManagement.tsx`: `useState("all")` passa para `useState("open")`
- `ClientTicketsList.tsx`: `useState("all")` passa para `useState("open")`

### 2. Duas novas colunas na tabela

**Tempo Aberto** - Tempo desde a criacao do chamado (`created_at`) ate agora, exibido em formato legivel (ex: "2d 5h", "3h 20min", "45min").

**Sem Interacao** - Tempo desde a ultima mensagem no chamado (`ticket_messages`) ate agora. Se nao houver mensagens, usa a data de criacao do ticket.

### 3. Busca da ultima mensagem

A query de tickets sera ajustada para incluir a ultima mensagem de cada ticket. Como o Supabase nao suporta agregacoes complexas diretamente, a abordagem sera:

- Na tela **admin**, apos carregar os tickets, fazer uma segunda query buscando a ultima mensagem de cada ticket (agrupado por `ticket_id`, pegando o `MAX(created_at)`)
- Na tela **cliente**, mesma abordagem

### 4. Funcao auxiliar de formatacao de tempo

Uma funcao `formatTimeAgo` sera criada para converter a diferenca de tempo em texto legivel:
- Menos de 1h: "Xmin"
- 1h a 24h: "Xh Ymin"
- Mais de 24h: "Xd Yh"

## Detalhes tecnicos

| Arquivo | Mudanca |
|---------|---------|
| `src/pages/admin/AdminTicketsManagement.tsx` | Filtro padrao "open", query para ultima mensagem, 2 novas colunas |
| `src/pages/helpdesk/ClientTicketsList.tsx` | Filtro padrao "open", query para ultima mensagem, 2 novas colunas |

Nenhuma migracao necessaria. Os dados ja existem nas tabelas `tickets` e `ticket_messages`.

