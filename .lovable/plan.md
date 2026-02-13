

## Roles de Usuarios, Cadastro de Clientes e Inventario de Equipamentos

### 1. Banco de Dados

**Atualizar enum `app_role`:**
- Adicionar valores `client` e `technician` ao enum existente
- Migrar registros existentes com role `user` para `client`
- O enum ficara: `admin`, `client`, `technician`, `user` (mantido por compatibilidade)

**Nova tabela `equipment_inventory` (inventario de equipamentos):**
- `id` (uuid, PK)
- `name` (text) - Nome/descricao do equipamento
- `equipment_type_id` (uuid, FK -> equipment_types) - Tipo do equipamento
- `brand` (text) - Marca
- `model` (text) - Modelo
- `serial_number` (text) - Numero de serie
- `client_id` (uuid, FK -> profiles.id, nullable) - Cliente associado
- `location` (text, nullable) - Localizacao
- `status` (enum: active, inactive, maintenance, retired) - Status do equipamento
- `purchase_date` (date, nullable) - Data de aquisicao
- `warranty_until` (date, nullable) - Garantia ate
- `notes` (text, nullable) - Observacoes
- `created_at`, `updated_at` (timestamptz)

**Novo enum `equipment_status`:** active, inactive, maintenance, retired

**RLS para `equipment_inventory`:**
- Admins e tecnicos podem CRUD
- Clientes podem ver apenas seus proprios equipamentos

### 2. Atualizar Edge Function `create-user`

- Aceitar parametro `role` (client, technician, admin) no body da requisicao
- Default para `client` se nao informado
- Validar que o role e valido

### 3. Atualizar `useAuth` Hook

- Atualizar tipo `AppRole` para incluir `client | technician | admin`
- Adicionar helper `isTechnician` ao contexto

### 4. Atualizar `AuthGuard`

- Suportar `requireTechnician` prop
- Tecnicos podem acessar paginas admin de tickets e OS (mas nao usuarios/cameras)

### 5. Nova Pagina: Cadastro de Clientes (`/admin/clients`)

Arquivo: `src/pages/admin/ClientsManagement.tsx`

- Tabela listando apenas usuarios com role `client`
- Formulario de criacao com campos: nome, email, senha, telefone, endereco (opcional)
- Badge mostrando a role do usuario
- Link para ver equipamentos do cliente
- Link para ver tickets do cliente

### 6. Atualizar Pagina de Usuarios (`/admin/users`)

- Renomear para "Gestao de Usuarios" geral
- Mostrar coluna "Perfil" com badge da role (Admin, Cliente, Tecnico)
- Select para filtrar por role
- No formulario de criacao, adicionar campo para selecionar a role (Cliente, Tecnico)

### 7. Nova Pagina: Inventario de Equipamentos (`/admin/inventory`)

Arquivo: `src/pages/admin/EquipmentInventory.tsx`

- Tabela com todos os equipamentos cadastrados
- Filtros por tipo, cliente, status
- Formulario de cadastro: nome, tipo, marca, modelo, serial, cliente, localizacao, status, data de compra, garantia, observacoes
- Edicao inline ou em dialog
- Badge de status (Ativo, Inativo, Em Manutencao, Aposentado)

### 8. Nova Pagina: Detalhes do Equipamento (`/admin/inventory/:id`)

Arquivo: `src/pages/admin/EquipmentDetail.tsx`

- Informacoes completas do equipamento
- Historico de tickets relacionados (pelo client_id + equipment_type_id)
- Historico de OS relacionadas

### 9. Atualizar AdminLayout (sidebar)

Adicionar novos itens ao menu:
- "Clientes" (icone Users) -> `/admin/clients`
- "Inventario" (icone Package) -> `/admin/inventory`

### 10. Atualizar Admin Ticket Detail

- No select de "Tecnico Responsavel", filtrar apenas usuarios com role `technician` (em vez de todos os profiles)

### 11. Rotas (App.tsx)

Novas rotas:
```text
/admin/clients       -> ClientsManagement (AuthGuard requireAdmin)
/admin/inventory     -> EquipmentInventory (AuthGuard requireAdmin)
/admin/inventory/:id -> EquipmentDetail (AuthGuard requireAdmin)
```

### 12. Arquivos a Criar/Modificar

**Criar:**
1. `src/pages/admin/ClientsManagement.tsx`
2. `src/pages/admin/EquipmentInventory.tsx`
3. `src/pages/admin/EquipmentDetail.tsx`

**Modificar:**
1. `supabase/functions/create-user/index.ts` - aceitar role
2. `src/hooks/useAuth.tsx` - novos tipos de role
3. `src/components/auth/AuthGuard.tsx` - suporte a technician
4. `src/pages/admin/UsersManagement.tsx` - coluna de role, filtro, select de role na criacao
5. `src/components/admin/AdminLayout.tsx` - novos itens no menu
6. `src/App.tsx` - novas rotas
7. `src/pages/admin/AdminTicketDetail.tsx` - filtrar tecnicos no select

**Migracao de banco:**
1. Adicionar valores ao enum `app_role`
2. Criar enum `equipment_status`
3. Criar tabela `equipment_inventory` com RLS
4. Migrar roles `user` para `client`

