
## Notificacoes por E-mail com Templates HTML para Tickets

Atualizar o sistema de notificacoes por e-mail para usar templates HTML visuais e profissionais, baseados nos modelos da imagem de referencia. Cada situacao do ticket tera um template especifico.

---

### Templates de E-mail (4 modelos)

1. **Ticket Aberto** - Quando um novo ticket e criado pelo cliente
   - Titulo: "Ticket Aberto"
   - Conteudo: numero do ticket, assunto, categoria do equipamento, prioridade
   - Botao: "Visualizar detalhes do ticket"

2. **Ticket Atualizado** - Quando ha nova mensagem ou mudanca de status/prioridade/tecnico
   - Titulo: "Ticket Atualizado"
   - Conteudo: numero do ticket, assunto, categoria, prioridade, descricao da atualizacao
   - Botao: "Visualizar detalhes do ticket"

3. **Ticket Resolvido** - Quando o status muda para "resolved"
   - Titulo: "Ticket Resolvido"
   - Conteudo: numero do ticket, categoria, sumario da resolucao
   - Botao: "Visualizar detalhes do ticket"

4. **Ticket Encerrado** - Quando o status muda para "closed"
   - Titulo: "Ticket Encerrado"
   - Conteudo: numero do ticket, sumario, mensagem de agradecimento
   - Botao: "Visualizar detalhes do ticket"

Cada template segue o layout visual:
- Cabecalho azul com "Notificacao de Ticket de Suporte"
- Ilustracao tematica (via emoji/icone em HTML)
- Titulo em destaque
- Corpo com dados do ticket
- Botao azul de acao
- Rodape azul com nome da empresa

---

### Alteracoes Necessarias

#### 1. Edge Function `notify-ticket-update`

Refatorar para:
- Aceitar um campo `notification_type` no body: `"ticket_opened"`, `"ticket_updated"`, `"ticket_resolved"`, `"ticket_closed"`
- Aceitar campos extras opcionais: `category`, `priority_label`, `resolution_summary`
- Gerar HTML do e-mail com base no tipo, usando uma funcao `buildEmailHtml()` que monta o template correto
- Alterar o `Content-Type` do e-mail de `text/plain` para `text/html`
- Buscar dados extras do ticket (equipment_type name) para preencher a "Categoria"

#### 2. Frontend - `NewTicket.tsx`

- Apos criar o ticket com sucesso, disparar notificacao com `notification_type: "ticket_opened"` para alertar os administradores sobre o novo chamado

#### 3. Frontend - `AdminTicketDetail.tsx`

- Ao mudar status para `resolved`: enviar com `notification_type: "ticket_resolved"`
- Ao mudar status para `closed`: enviar com `notification_type: "ticket_closed"`
- Demais mudancas (status, prioridade, tecnico): enviar com `notification_type: "ticket_updated"`

#### 4. Frontend - `TicketChat.tsx`

- Mensagens no chat continuam usando `notification_type: "ticket_updated"`

---

### Detalhes Tecnicos

**Funcao `buildEmailHtml()`** na edge function:
- Recebe: tipo, nome destinatario, numero do ticket, titulo, categoria, prioridade, mensagem, link, nome da empresa, resolucao
- Retorna string HTML com inline CSS (compatibilidade com clientes de e-mail)
- Layout: tabela centralizada com largura maxima de 600px
- Cabecalho: fundo `#2563eb`, texto branco
- Corpo: fundo branco, textos em cinza/preto
- Botao: fundo `#2563eb`, texto branco, border-radius
- Rodape: fundo `#2563eb`, texto branco com nome da empresa

**Mudanca no SMTP**: Alterar header `Content-Type: text/plain` para `Content-Type: text/html; charset=utf-8` na funcao `sendSmtpEmail`

**Compatibilidade**: Manter retrocompatibilidade - se `notification_type` nao for enviado, usar template "ticket_updated" como padrao
