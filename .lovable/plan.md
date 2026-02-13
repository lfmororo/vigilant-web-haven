

## Notificacao por Email nas Interacoes do Ticket

Criar uma Edge Function `notify-ticket-update` que envia emails para todos os envolvidos no ticket sempre que houver uma nova mensagem (exceto notas internas). A funcao sera chamada automaticamente apos cada mensagem enviada no chat.

---

### 1. Nova Edge Function `notify-ticket-update`

Recebe o `ticket_id`, `sender_id` e `message` como payload. Fluxo:

```
1. Buscar dados do ticket (titulo, ticket_number, client_id, assigned_to)
2. Buscar email do cliente (profiles)
3. Buscar email do tecnico responsavel, se houver (profiles)
4. Buscar emails de todos os admins (user_roles + profiles)
5. Remover o remetente da lista (nao notificar quem enviou)
6. Carregar configuracoes SMTP da tabela system_settings
7. Enviar email para cada destinatario com:
   - Assunto: "Atualizacao no Chamado #NNN - Titulo"
   - Corpo: nome do remetente, mensagem, link para o ticket
```

Notas internas (`is_internal = true`) nao disparam notificacao.

Configuracao no `config.toml`:
```toml
[functions.notify-ticket-update]
verify_jwt = false
```

Usa `SUPABASE_SERVICE_ROLE_KEY` para acessar dados de todos os envolvidos.

---

### 2. Alterar `TicketChat.tsx`

Apos inserir a mensagem com sucesso no banco, chamar a edge function `notify-ticket-update` passando `ticket_id`, `sender_id`, `message` e `is_internal`. A chamada sera fire-and-forget (nao bloqueia o chat).

---

### 3. Alterar `process-incoming-emails`

Apos criar um ticket via email, NAO enviar notificacao (o email ja e a propria interacao do cliente). Sem mudancas necessarias nessa funcao.

---

### Detalhes Tecnicos

**Destinatarios por interacao:**
- Cliente do ticket (sempre, exceto se ele for o remetente)
- Tecnico responsavel (se atribuido, exceto se ele for o remetente)
- Todos os admins (exceto se o admin for o remetente)

**Conteudo do email:**
- Assunto: `Atualizacao no Chamado #123 - Titulo do chamado`
- Corpo: Nome de quem enviou, texto da mensagem, link para acessar o ticket

**Edge Function reutiliza** a mesma logica SMTP ja presente em `process-incoming-emails` (funcao `sendSmtpEmail`).

