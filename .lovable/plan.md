

## Respostas de E-mail vinculadas ao Chamado Existente

### Problema Atual
Quando um usuario responde a um e-mail de notificacao de ticket (ex: "Re: Atualizacao no Chamado #15 - Problema no sistema"), a funcao `process-incoming-emails` cria um novo chamado em vez de adicionar a resposta ao chamado original.

### Solucao

Modificar a funcao `process-incoming-emails` para:

1. **Detectar respostas** - Ao processar cada e-mail, verificar se o assunto contem um numero de ticket (padrao `#NNNN`) que indica uma resposta a uma notificacao existente
2. **Vincular ao chamado existente** - Se encontrar o numero do ticket, buscar o chamado no banco e adicionar o conteudo do e-mail como nova mensagem no chat do ticket
3. **Reabrir chamados finalizados** - Se o ticket estiver com status `resolved` ou `closed`, alterar automaticamente para `open`
4. **Manter comportamento atual** - Se nao for uma resposta (sem numero de ticket no assunto), criar novo chamado normalmente

### Logica de Deteccao

Os assuntos das notificacoes seguem o padrao:
- "Novo Chamado #15 - Titulo"
- "Atualizacao no Chamado #15 - Titulo"
- "Chamado Resolvido #15 - Titulo"

Quando o usuario responde, o assunto fica:
- "Re: Atualizacao no Chamado #15 - Titulo"

A funcao vai extrair o numero `15` usando regex `#(\d+)` e buscar o ticket com `ticket_number = 15`.

### Detalhes Tecnicos

| Arquivo | Acao |
|---|---|
| `supabase/functions/process-incoming-emails/index.ts` | Modificar - adicionar logica de deteccao de resposta |

**Fluxo modificado dentro do loop de e-mails:**

```text
Para cada e-mail nao lido:
  1. Extrair remetente e assunto
  2. Verificar se assunto contem #NNNN (regex)
  3. SE contem numero de ticket:
     a. Buscar ticket por ticket_number
     b. SE ticket existe E remetente eh o cliente do ticket:
        - Adicionar mensagem no ticket (ticket_messages)
        - SE status = 'resolved' ou 'closed': atualizar para 'open'
        - Notificar admins/tecnico sobre nova mensagem
        - Contabilizar como "resposta processada"
        - Marcar e-mail como lido
        - Pular para proximo e-mail
  4. SENAO (e-mail novo):
     - Fluxo atual: criar usuario se necessario, criar ticket, notificar
```

**Mudancas no codigo:**
- Nova funcao `extractTicketNumber(subject)` que retorna o numero do ticket ou null
- Novo bloco condicional antes da criacao de ticket
- Chamada ao `notify-ticket-update` com tipo `ticket_updated` quando adicionar resposta
- Novos contadores de retorno: `replies_added` alem de `tickets_created` e `users_created`

