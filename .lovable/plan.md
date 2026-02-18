
# Vinculação de Usuário a Cliente + Domínio de Email Automático

## Problemas identificados

1. O campo "Vinculado ao Cliente" existe no código mas está **fora do dialog de edição** — ele aparece solto na página principal, entre o filtro e o card de listagem, causando um bug visual.
2. O dialog de edição **não inclui o campo** de vinculação ao cliente.
3. Não existe ainda o campo `email_domain` na tabela de perfis dos clientes para vinculação automática por domínio.
4. O fluxo de criação de usuário via email (`process-incoming-emails`) não verifica domínio para vincular automaticamente ao cliente.

---

## O que será implementado

### 1. Corrigir o dialog de edição de usuário (`UsersManagement.tsx`)
- Remover o bloco "Vinculado ao Cliente" que está solto na página (entre as linhas 336–349)
- Adicionar corretamente o campo **"Vinculado ao Cliente"** dentro do dialog de edição (após o campo Perfil), com dropdown listando apenas usuários com role `client`
- A vinculação já funciona na lógica de `handleEditUser` (salva `parent_client_id`) — só precisa do campo no lugar certo

### 2. Adicionar campo de domínio de email na gestão de clientes (`ClientsManagement.tsx`)
- Adicionar campo de banco de dados `email_domain` (text, nullable) na tabela `profiles`
- No dialog de criação/edição do cliente, exibir o campo **"Domínio de Email"** (ex: `empresa.com.br`)
- Placeholder e texto de ajuda: "Ex: empresa.com.br — usuários com esse domínio serão vinculados automaticamente"
- Salvar o valor no campo `email_domain` do perfil do cliente

### 3. Vinculação automática por domínio no fluxo de email (`process-incoming-emails`)
- Quando um novo email chega e o usuário **ainda não existe**, após criar o perfil, verificar se algum cliente tem `email_domain` igual ao domínio do email do remetente
- Se encontrar, definir `parent_client_id` no perfil do novo usuário automaticamente
- Quando o usuário **já existe** mas `parent_client_id` é nulo, fazer a mesma verificação e atualizar

---

## Detalhes Técnicos

### Banco de dados — Migration
Adicionar coluna `email_domain` à tabela `profiles`:
```sql
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS email_domain text;
```
Nenhuma outra mudança de schema é necessária — `parent_client_id` já existe.

### Arquivos a modificar

| Arquivo | O que muda |
|---|---|
| `supabase/migrations/...` | Adiciona coluna `email_domain` |
| `src/pages/admin/UsersManagement.tsx` | Corrige posição do campo "Vinculado ao Cliente" no dialog de edição |
| `src/pages/admin/ClientsManagement.tsx` | Adiciona campo "Domínio de Email" no cadastro/edição do cliente |
| `supabase/functions/process-incoming-emails/index.ts` | Vinculação automática por domínio ao criar/encontrar usuário |

### Lógica de vinculação automática (Edge Function)
```typescript
// Extrair domínio do email do remetente
const emailDomain = senderEmail.split("@")[1];

// Buscar cliente com esse domínio cadastrado
const { data: domainClient } = await supabaseAdmin
  .from("profiles")
  .select("id")
  .eq("email_domain", emailDomain)
  .maybeSingle();

// Se encontrou, vincular ao criar o perfil
if (domainClient) {
  parentClientId = domainClient.id;
}

// Ao inserir o perfil novo:
await supabaseAdmin.from("profiles").insert({
  id: clientId,
  email: senderEmail,
  full_name: senderName,
  must_change_password: true,
  parent_client_id: parentClientId || null,
});

// Se usuário já existe sem vínculo, atualizar:
if (existingProfile && !existingProfile.parent_client_id && domainClient) {
  await supabaseAdmin.from("profiles")
    .update({ parent_client_id: domainClient.id })
    .eq("id", existingProfile.id);
}
```

### Comportamento esperado
- Admin edita um usuário → vê o campo "Vinculado ao Cliente" dentro do modal de edição → seleciona o cliente → salva
- Admin cadastra cliente e preenche "Domínio: empresa.com.br"
- Quando um email de `joao@empresa.com.br` chega, o sistema cria o usuário João e já vincula automaticamente ao cliente `empresa.com.br` sem intervenção manual
- O relatório de chamados filtrado pelo cliente empresa.com.br incluirá todos os chamados de usuários vinculados

### Sem alterações necessárias em
- Lógica de relatório (`TicketReports.tsx`) — já usa `parent_client_id` corretamente
- Tabela de permissões (RLS) — `profiles` já permite `update` por admins
