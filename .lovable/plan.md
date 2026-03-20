

## Plano: Galeria de Imagens Anexadas nos Chamados

### Problema
As imagens enviadas por e-mail são armazenadas no bucket `ticket-attachments` e aparecem apenas inline nas mensagens do chat. Não há uma seção dedicada para visualizar todas as imagens de um chamado.

### Solução

**1. Criar componente `TicketAttachments`**
- Novo arquivo: `src/components/helpdesk/TicketAttachments.tsx`
- Lista todos os arquivos do bucket `ticket-attachments/{ticketId}/` usando `supabase.storage.from("ticket-attachments").list(ticketId)`
- Filtra apenas imagens (jpg, jpeg, png, gif, webp)
- Exibe em grid com thumbnails clicáveis que abrem a imagem em tamanho completo (lightbox simples com Dialog)
- Mostra o nome do arquivo e data de upload

**2. Adicionar o componente nas páginas de detalhe**
- `src/pages/admin/AdminTicketDetail.tsx`: Adicionar card "Anexos" na coluna lateral (ao lado de Detalhes/Assinaturas)
- `src/pages/helpdesk/ClientTicketDetail.tsx`: Mesmo card na coluna lateral

### Detalhes Técnicos
- O bucket `ticket-attachments` já é público, então as URLs públicas podem ser construídas diretamente
- A listagem do storage usa `supabase.storage.from("ticket-attachments").list(ticketId)` que retorna os arquivos dentro da pasta do ticket
- RLS do storage não precisa de alteração pois o bucket é público
- Nenhuma migração de banco necessária

### Arquivos Afetados
- `src/components/helpdesk/TicketAttachments.tsx` (novo)
- `src/pages/admin/AdminTicketDetail.tsx` (adicionar card)
- `src/pages/helpdesk/ClientTicketDetail.tsx` (adicionar card)

