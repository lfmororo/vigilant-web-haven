
# Notificar admin quando ticket for aberto via e-mail

## Situacao atual

- **Tickets abertos pela interface (UI):** Ja enviam notificacao para admins via a funcao `notify-ticket-update` com `notification_type: "ticket_opened"`. Funcionando corretamente.
- **Tickets abertos por e-mail recebido:** A funcao `process-incoming-emails` cria o ticket e a mensagem, mas **nao notifica os admins**.

## Alteracao necessaria

Adicionar, na funcao `process-incoming-emails`, uma chamada direta para enviar e-mail aos admins logo apos a criacao do ticket via e-mail.

Em vez de chamar a edge function `notify-ticket-update` (o que adicionaria complexidade de rede desnecessaria), a notificacao sera feita diretamente dentro da propria funcao, reutilizando as configuracoes SMTP ja carregadas.

## Detalhes tecnicos

**Arquivo:** `supabase/functions/process-incoming-emails/index.ts`

Apos o bloco que cria o ticket e a mensagem (linhas 452-469), adicionar:

1. Buscar todos os admins na tabela `user_roles` (role = 'admin')
2. Buscar seus e-mails na tabela `profiles`
3. Para cada admin, enviar um e-mail informando o novo chamado com:
   - Numero do ticket
   - Titulo (assunto do e-mail)
   - Nome do cliente
   - Descricao resumida
   - Link para o ticket no painel admin

O template do e-mail sera simples em texto plano, consistente com o que ja e usado nessa funcao para o e-mail de boas-vindas.

## Resumo das mudancas

| Arquivo | Mudanca |
|---------|---------|
| `supabase/functions/process-incoming-emails/index.ts` | Adicionar envio de e-mail para admins apos criacao de ticket |

Nenhuma tabela ou migracao necessaria.
