

## Captura Automatica de Emails para Abertura de Tickets

Criar uma Edge Function que conecta ao servidor IMAP configurado, le emails nao lidos, e automaticamente abre tickets no sistema. Se o remetente ja for um cliente cadastrado, abre o ticket vinculado a ele. Se nao for cadastrado, cria um novo usuario com senha provisoria, envia a senha por email via SMTP, e marca o usuario para trocar a senha no primeiro login.

---

### 1. Nova coluna `must_change_password` na tabela `profiles`

Adicionar uma coluna booleana para controlar se o usuario precisa trocar a senha no primeiro login:

```sql
ALTER TABLE public.profiles ADD COLUMN must_change_password boolean DEFAULT false;
```

---

### 2. Nova Edge Function `process-incoming-emails`

Funcao que sera chamada periodicamente (via cron externo ou manualmente pelo admin). Fluxo:

```
1. Ler configuracoes IMAP e SMTP da tabela system_settings
2. Conectar ao IMAP via TLS
3. Selecionar INBOX e buscar emails nao lidos (UNSEEN)
4. Para cada email:
   a. Extrair remetente (From), assunto (Subject) e corpo
   b. Buscar na tabela profiles se existe cliente com esse email
   c. SE EXISTE:
      - Criar ticket com client_id do perfil encontrado
      - Titulo = assunto do email
      - Descricao = corpo do email
   d. SE NAO EXISTE:
      - Gerar senha provisoria aleatoria
      - Criar usuario via supabase admin API (email_confirm: true)
      - Criar perfil com must_change_password = true
      - Atribuir role "client"
      - Criar ticket vinculado ao novo usuario
      - Enviar email via SMTP com a senha provisoria
   e. Marcar email como lido (SEEN)
5. Fechar conexao IMAP
```

Configuracao no `config.toml`:
```toml
[functions.process-incoming-emails]
verify_jwt = false
```

A funcao usara `SUPABASE_SERVICE_ROLE_KEY` para criar usuarios e tickets.

---

### 3. Alterar fluxo de login para forcar troca de senha

**Arquivo: `src/pages/Auth.tsx`**

Apos login bem-sucedido, antes de redirecionar, verificar se o perfil do usuario tem `must_change_password = true`. Se sim, mostrar um dialog/modal pedindo nova senha. Ao salvar:
- Atualizar a senha via `supabase.auth.updateUser({ password })`
- Atualizar `must_change_password = false` no perfil
- Prosseguir com o redirecionamento normal

---

### 4. Botao "Verificar Emails Agora" na pagina de Configuracoes

**Arquivo: `src/pages/admin/SystemSettings.tsx`**

Adicionar um botao na aba IMAP que chama a edge function `process-incoming-emails` manualmente, permitindo ao admin disparar a verificacao sem esperar um cron. Mostrar resultado com quantidade de tickets criados e usuarios novos.

---

### Detalhes Tecnicos

**Edge Function `process-incoming-emails`:**
- Parse do header `From` para extrair email (regex para lidar com formato `"Nome" <email@...>`)
- Parse do `Subject` com decode de MIME encoded-words (=?UTF-8?Q?...?= e =?UTF-8?B?...?=)
- Corpo do email: priorizar text/plain, fazer strip de HTML basico se necessario
- Senha provisoria: string aleatoria de 12 caracteres (letras, numeros, simbolos)
- Email de boas-vindas via SMTP incluindo: senha provisoria, link de login, instrucao para trocar a senha

**Modal de troca de senha:**
- Campo de nova senha (min 6 caracteres)
- Campo de confirmacao de senha
- Validacao com zod
- Nao permite fechar sem trocar a senha

**Protocolo IMAP usado:**
- Comandos: LOGIN, SELECT INBOX, SEARCH UNSEEN, FETCH (BODY[HEADER] e BODY[TEXT]), STORE +FLAGS (\Seen), LOGOUT
- Conexao TLS usando `Deno.connectTls`

