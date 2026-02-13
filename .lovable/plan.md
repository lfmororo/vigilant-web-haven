

## Notificacao por Email ao Atribuir Tecnico + Dashboard em Tempo Real

Existem dois problemas identificados:

1. **Email nao enviado ao atribuir tecnico**: A funcao `updateTicket` em `AdminTicketDetail.tsx` atualiza o ticket no banco mas NAO chama a edge function `notify-ticket-update`. As notificacoes por email so sao disparadas quando uma mensagem e enviada no chat.

2. **Dashboard nao atualiza em tempo real**: O `AdminHelpdeskDashboard.tsx` busca os tickets apenas uma vez ao carregar a pagina (sem Realtime). Quando um ticket e atualizado (status, tecnico), o dashboard nao reflete a mudanca ate um reload manual.

---

### 1. Enviar notificacao ao atribuir tecnico ou alterar status

No arquivo `AdminTicketDetail.tsx`, apos o `updateTicket` ser bem-sucedido, chamar a edge function `notify-ticket-update` com uma mensagem automatica informando a alteracao.

Exemplo de mensagens automaticas:
- Atribuicao de tecnico: "O tecnico [Nome] foi atribuido ao chamado."
- Mudanca de status: "O status do chamado foi alterado para [Status]."

A chamada sera fire-and-forget, igual ao padrao ja usado no `TicketChat`.

### 2. Adicionar Realtime ao Dashboard

No `AdminHelpdeskDashboard.tsx`, adicionar uma subscription Realtime na tabela `tickets` para que qualquer INSERT, UPDATE ou DELETE atualize automaticamente a lista de tickets no dashboard.

---

### Detalhes Tecnicos

**Arquivo: `src/pages/admin/AdminTicketDetail.tsx`**
- Na funcao `updateTicket`, apos o sucesso, montar uma mensagem descritiva baseada no campo alterado e chamar `supabase.functions.invoke("notify-ticket-update", ...)`.
- Buscar o nome do tecnico da lista `technicians` quando o campo for `assigned_to`.
- Mapear os valores de status para labels em portugues.

**Arquivo: `src/pages/admin/AdminHelpdeskDashboard.tsx`**
- Adicionar um `useEffect` com `supabase.channel('dashboard-tickets')` escutando `postgres_changes` (event: `*`) na tabela `tickets`.
- Ao receber qualquer mudanca, re-buscar os tickets do banco para atualizar metricas e graficos.

**Nenhuma mudanca necessaria** na edge function `notify-ticket-update` -- ela ja suporta receber qualquer mensagem e enviar para os envolvidos.

