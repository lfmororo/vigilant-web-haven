

## Acesso de Tecnicos e Clientes aos Tickets

### Resumo

Liberar acesso dos tecnicos ao menu de chamados (criar, atualizar, finalizar tickets) e garantir que clientes possam acessar e interagir nos tickets relacionados a eles.

---

### 1. Banco de Dados - Atualizar RLS

**Tabela `tickets`:**
- Adicionar politica SELECT para tecnicos verem tickets atribuidos a eles (`assigned_to = auth.uid()`) ou onde sao admin
- Adicionar politica UPDATE para tecnicos atualizarem tickets atribuidos a eles (status, prioridade)
- Adicionar politica INSERT para tecnicos poderem criar tickets

**Tabela `ticket_messages`:**
- Atualizar politica INSERT para permitir tecnicos enviarem mensagens em tickets atribuidos a eles
- Atualizar politica SELECT para tecnicos verem mensagens (incluindo internas) de tickets atribuidos a eles

**Tabela `service_orders`:**
- Adicionar politicas para tecnicos verem e atualizarem OS atribuidas a eles

---

### 2. Rotas e AuthGuard (App.tsx)

Alterar as rotas de tickets e OS de `requireAdmin` para `requireAdminOrTechnician`:

```text
/admin/tickets       -> requireAdminOrTechnician (era requireAdmin)
/admin/tickets/:id   -> requireAdminOrTechnician (era requireAdmin)
/admin/service-orders     -> requireAdminOrTechnician (era requireAdmin)
/admin/service-orders/:id -> requireAdminOrTechnician (era requireAdmin)
```

---

### 3. AdminLayout - Menu Condicional

Mostrar itens de menu com base na role do usuario:
- **Admin**: todos os itens (Dashboard, Usuarios, Clientes, Cameras, Inventario, Suporte, Chamados, OS)
- **Tecnico**: apenas Chamados e Ordens de Servico (e Dashboard adaptado)

Usar o hook `useAuth` para verificar `isAdmin` e filtrar os `navItems`.

---

### 4. AdminTicketsManagement - Filtro por Tecnico

Para tecnicos:
- Mostrar apenas tickets atribuidos a eles (filtro por `assigned_to`)
- Titulo muda para "Meus Chamados" em vez de "Gestao de Chamados"

Para admins: comportamento atual (ver todos).

---

### 5. AdminTicketDetail - Permissoes do Tecnico

Para tecnicos:
- Podem alterar **status** do ticket (em andamento, aguardando, resolvido, fechado)
- Podem enviar mensagens (incluindo notas internas)
- **Nao podem** reatribuir o tecnico responsavel (campo oculto ou desabilitado)
- Podem criar OS a partir do ticket

Para admins: tudo como esta.

---

### 6. TicketChat - Suporte a Tecnicos

Atualizar o componente para aceitar tecnicos como "staff" (similar a admin):
- Tecnicos podem enviar notas internas
- Prop `isAdmin` renomeada/expandida para verificar se e admin OU tecnico

---

### 7. Dashboard do Tecnico

Quando um tecnico acessa `/admin`, redirecionar para `/admin/tickets` ou mostrar um dashboard simplificado com:
- Contadores de tickets atribuidos por status
- Lista dos ultimos tickets atribuidos

---

### 8. Helpdesk do Cliente (ja existente)

Verificar que o fluxo do cliente esta completo:
- Clientes acessam `/helpdesk` -> veem seus tickets
- Podem abrir novos tickets
- Podem enviar mensagens nos tickets deles
- Podem ver OS relacionadas

O fluxo ja existe nas paginas `HelpdeskDashboard`, `ClientTicketsList`, `ClientTicketDetail`, `NewTicket`. Apenas confirmar que as RLS policies permitem a interacao correta.

---

### Arquivos a Modificar

1. **Migracao SQL** - Novas RLS policies para tecnicos em `tickets`, `ticket_messages`, `service_orders`
2. `src/App.tsx` - Alterar `requireAdmin` para `requireAdminOrTechnician` nas rotas de tickets/OS
3. `src/components/admin/AdminLayout.tsx` - Menu condicional por role
4. `src/pages/admin/AdminTicketsManagement.tsx` - Filtro por tecnico logado
5. `src/pages/admin/AdminTicketDetail.tsx` - Restricoes de UI para tecnicos
6. `src/components/helpdesk/TicketChat.tsx` - Suporte a tecnicos como staff
7. `src/pages/admin/AdminDashboard.tsx` - Dashboard adaptado para tecnicos

