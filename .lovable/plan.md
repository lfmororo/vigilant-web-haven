

# Botao Salvar com registro de alteracoes no chat do chamado

## O que muda

Atualmente, cada alteracao de status, prioridade ou tecnico e salva e notificada individualmente ao selecionar o valor. Com essa mudanca:

1. Os selects apenas alteram o estado local (sem salvar no banco imediatamente)
2. Um botao "Salvar Alteracoes" aparece quando ha mudancas pendentes
3. Ao clicar em Salvar, todas as alteracoes sao aplicadas de uma vez
4. Uma mensagem automatica e criada no chat do chamado detalhando todas as alteracoes, quem fez e quando
5. A notificacao por e-mail e enviada uma unica vez com todas as mudancas

## Exemplo da mensagem no chat

```
Alteracoes realizadas por Joao Silva em 13/02/2026 as 14:30:
- Status alterado de "Aberto" para "Em Andamento"
- Prioridade alterada de "Media" para "Alta"
- Tecnico responsavel alterado para "Carlos Souza"
```

## Detalhes tecnicos

**Arquivo:** `src/pages/admin/AdminTicketDetail.tsx`

1. Adicionar estados locais para armazenar valores pendentes (`pendingStatus`, `pendingPriority`, `pendingAssignedTo`)
2. Os `Select` passam a alterar apenas os estados locais em vez de chamar `updateTicket` diretamente
3. Calcular `hasChanges` comparando valores pendentes com os valores atuais do ticket
4. Substituir a funcao `updateTicket` por `saveChanges` que:
   - Monta um objeto com todos os campos alterados
   - Faz um unico `UPDATE` no banco
   - Monta a mensagem descritiva com todas as alteracoes
   - Insere a mensagem na tabela `ticket_messages` como mensagem do sistema (nao interna)
   - Envia uma unica notificacao por e-mail com todas as mudancas
5. Adicionar botao "Salvar Alteracoes" no card "Gerenciar", visivel apenas quando ha mudancas pendentes

**Nenhuma migracao ou alteracao de banco necessaria** - a tabela `ticket_messages` ja suporta o registro de mensagens.

## Resumo

| Arquivo | Mudanca |
|---------|---------|
| `src/pages/admin/AdminTicketDetail.tsx` | Refatorar selects para estado local + botao Salvar + mensagem no chat |
