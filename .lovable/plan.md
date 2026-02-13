

# Sistema de Help Desk / Suporte Tecnico (estilo ServiceBuddy)

Criar um modulo completo de Help Desk integrado ao projeto SecureTech, com gestao de tickets, ordens de servico, central do cliente e relatorios.

---

## Visao Geral da Arquitetura

O sistema sera adicionado como um conjunto de subpaginas dentro do projeto existente, reutilizando a autenticacao e perfis ja implementados.

- **Clientes** acessam pelo Dashboard (`/helpdesk`) para abrir e acompanhar chamados
- **Admins** gerenciam tudo pelo painel admin (`/admin/helpdesk`, `/admin/tickets`, `/admin/service-orders`)

---

## 1. Banco de Dados - Novas Tabelas

### Tabela `equipment_types` (tipos de equipamento)
- `id` (uuid, PK)
- `name` (text) - Ex: Camera, Impressora, PC, Ar-condicionado, Rede, Alarme
- `icon` (text) - Nome do icone Lucide
- `created_at` (timestamptz)

### Tabela `tickets` (chamados de suporte)
- `id` (uuid, PK)
- `ticket_number` (serial) - Numero sequencial para exibicao
- `title` (text) - Titulo do chamado
- `description` (text) - Descricao detalhada
- `status` (enum: open, in_progress, waiting_client, resolved, closed)
- `priority` (enum: low, medium, high, urgent)
- `equipment_type_id` (uuid, FK -> equipment_types)
- `equipment_info` (text) - Modelo, marca, serie do equipamento
- `client_id` (uuid, FK -> profiles.id) - Cliente que abriu
- `assigned_to` (uuid, FK -> profiles.id, nullable) - Tecnico responsavel
- `created_at`, `updated_at` (timestamptz)

### Tabela `ticket_messages` (mensagens/historico do ticket)
- `id` (uuid, PK)
- `ticket_id` (uuid, FK -> tickets)
- `sender_id` (uuid, FK -> profiles.id)
- `message` (text)
- `is_internal` (boolean, default false) - Nota interna (so admin ve)
- `created_at` (timestamptz)

### Tabela `service_orders` (ordens de servico)
- `id` (uuid, PK)
- `order_number` (serial) - Numero sequencial
- `ticket_id` (uuid, FK -> tickets, nullable)
- `client_id` (uuid, FK -> profiles.id)
- `technician_id` (uuid, FK -> profiles.id, nullable)
- `status` (enum: draft, in_progress, completed, cancelled)
- `diagnosis` (text) - Diagnostico tecnico
- `solution` (text) - Solucao aplicada
- `parts_used` (jsonb) - Lista de pecas utilizadas [{name, qty, cost}]
- `labor_cost` (numeric)
- `total_cost` (numeric)
- `started_at`, `completed_at` (timestamptz, nullable)
- `client_signature` (text, nullable) - Assinatura eletronica (base64)
- `notes` (text, nullable)
- `created_at`, `updated_at` (timestamptz)

### Enums novos
- `ticket_status`: open, in_progress, waiting_client, resolved, closed
- `ticket_priority`: low, medium, high, urgent
- `service_order_status`: draft, in_progress, completed, cancelled

### Politicas RLS
- **tickets**: Clientes veem apenas seus proprios tickets; Admins veem todos
- **ticket_messages**: Clientes veem mensagens nao-internas dos seus tickets; Admins veem tudo
- **service_orders**: Clientes veem apenas suas OS; Admins veem todas
- **equipment_types**: Leitura publica para autenticados; Admins gerenciam

### Dados iniciais (equipment_types)
Inserir tipos: Camera/CFTV, Alarme, Controle de Acesso, PC/Notebook, Impressora, Rede/Switch, Ar-condicionado, Outros

---

## 2. Paginas do Cliente

### `/helpdesk` - Central do Cliente (protegida por AuthGuard)
- Dashboard com resumo: tickets abertos, em andamento, resolvidos
- Cards com contadores e status
- Lista dos ultimos tickets
- Botao "Abrir Novo Chamado"

### `/helpdesk/tickets` - Lista de Tickets do Cliente
- Tabela com todos os tickets do cliente
- Filtros por status e prioridade
- Busca por titulo/numero

### `/helpdesk/tickets/new` - Abrir Novo Chamado
- Formulario com: titulo, descricao, tipo de equipamento, info do equipamento, prioridade
- Validacao com Zod

### `/helpdesk/tickets/:id` - Detalhes do Ticket
- Informacoes do ticket
- Historico de mensagens (chat)
- Campo para enviar nova mensagem
- Status atual e timeline

### `/helpdesk/orders` - Ordens de Servico do Cliente
- Lista de OS vinculadas ao cliente
- Visualizacao dos detalhes (diagnostico, pecas, custo)

---

## 3. Paginas do Admin

### `/admin/helpdesk` - Dashboard de Suporte (Admin)
- Metricas: total de tickets, tempo medio de resposta, tickets por status
- Graficos com Recharts (ja instalado)
- Lista de tickets recentes

### `/admin/tickets` - Gestao de Tickets (Admin)
- Tabela completa com todos os tickets
- Filtros por status, prioridade, cliente, tecnico
- Acoes: atribuir tecnico, alterar status, responder

### `/admin/tickets/:id` - Detalhes do Ticket (Admin)
- Todas as informacoes + mensagens internas
- Atribuir tecnico, alterar prioridade/status
- Converter ticket em Ordem de Servico

### `/admin/service-orders` - Gestao de Ordens de Servico
- Tabela com todas as OS
- Criar nova OS (vinculada ou nao a um ticket)
- Editar OS: diagnostico, pecas, custos
- Finalizar com assinatura do cliente

### `/admin/service-orders/:id` - Detalhes da OS
- Formulario completo com todos os campos tecnicos
- Lista de pecas com nome, quantidade e custo
- Campo de assinatura eletronica (canvas)
- Botao para gerar PDF (futuro)

### Atualizar sidebar do AdminLayout
- Adicionar itens: "Chamados", "Ordens de Servico" no menu lateral

---

## 4. Componentes Compartilhados

### Novos componentes
- `TicketStatusBadge` - Badge colorido por status
- `PriorityBadge` - Badge colorido por prioridade
- `TicketChat` - Componente de mensagens do ticket
- `ServiceOrderForm` - Formulario de OS com pecas
- `HelpdeskLayout` - Layout para area do cliente com sidebar/nav
- `EquipmentTypeSelect` - Select dos tipos de equipamento

---

## 5. Rotas (App.tsx)

Novas rotas a adicionar:

```text
/helpdesk                        -> HelpdeskDashboard (AuthGuard)
/helpdesk/tickets                -> ClientTicketsList (AuthGuard)
/helpdesk/tickets/new            -> NewTicket (AuthGuard)
/helpdesk/tickets/:id            -> ClientTicketDetail (AuthGuard)
/helpdesk/orders                 -> ClientServiceOrders (AuthGuard)
/admin/helpdesk                  -> AdminHelpdeskDashboard (AuthGuard requireAdmin)
/admin/tickets                   -> AdminTicketsManagement (AuthGuard requireAdmin)
/admin/tickets/:id               -> AdminTicketDetail (AuthGuard requireAdmin)
/admin/service-orders            -> AdminServiceOrders (AuthGuard requireAdmin)
/admin/service-orders/:id        -> AdminServiceOrderDetail (AuthGuard requireAdmin)
```

---

## 6. Arquivos a Criar/Modificar

### Criar (novos arquivos):
1. `src/pages/helpdesk/HelpdeskDashboard.tsx`
2. `src/pages/helpdesk/ClientTicketsList.tsx`
3. `src/pages/helpdesk/NewTicket.tsx`
4. `src/pages/helpdesk/ClientTicketDetail.tsx`
5. `src/pages/helpdesk/ClientServiceOrders.tsx`
6. `src/pages/admin/AdminHelpdeskDashboard.tsx`
7. `src/pages/admin/AdminTicketsManagement.tsx`
8. `src/pages/admin/AdminTicketDetail.tsx`
9. `src/pages/admin/AdminServiceOrders.tsx`
10. `src/pages/admin/AdminServiceOrderDetail.tsx`
11. `src/components/helpdesk/HelpdeskLayout.tsx`
12. `src/components/helpdesk/TicketStatusBadge.tsx`
13. `src/components/helpdesk/PriorityBadge.tsx`
14. `src/components/helpdesk/TicketChat.tsx`
15. `src/components/helpdesk/ServiceOrderForm.tsx`
16. `src/components/helpdesk/EquipmentTypeSelect.tsx`

### Modificar (arquivos existentes):
1. `src/App.tsx` - Adicionar novas rotas
2. `src/components/admin/AdminLayout.tsx` - Adicionar itens de menu
3. `src/pages/Dashboard.tsx` - Adicionar link para Help Desk

### Migracao de banco:
1. Criar enums, tabelas, RLS policies e dados iniciais em uma unica migracao

---

## 7. Ordem de Implementacao

Como e um sistema grande, recomendo implementar em etapas:

**Etapa 1**: Banco de dados (migracao completa com todas as tabelas e RLS)

**Etapa 2**: Paginas do Admin (gestao de tickets e OS)

**Etapa 3**: Paginas do Cliente (central do cliente, abrir chamados)

**Etapa 4**: Relatorios e graficos no dashboard admin

Isso e um projeto grande - vou implementar por etapas para garantir qualidade. Ao aprovar, comeco pela Etapa 1 (banco de dados) e Etapa 2 (admin).

