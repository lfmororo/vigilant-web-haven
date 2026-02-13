

## Melhorar Notificacoes por Email - Template HTML Elegante

### Resumo
Atualizar todos os templates de email do sistema para um design mais moderno, profissional e consistente, com logo da FM TechFlow em todas as funcoes de envio.

### O que sera feito

**1. Template do `notify-ticket-update` (refinamento visual)**
- Adicionar gradiente sutil no header em vez de cor solida
- Melhorar a tabela de dados com bordas arredondadas e sombras leves
- Adicionar icone visual para cada tipo de prioridade (alem da cor)
- Incluir separador visual elegante entre secoes
- Adicionar data/hora da notificacao no corpo do email
- Melhorar o botao CTA com efeito de hover (usando MSO para Outlook)
- Adicionar texto de rodape com "Este email foi enviado automaticamente, nao responda"
- Incluir o nome do remetente da mensagem no template de atualizacao

**2. Template do `daily-ticket-summary` (adicionar logo + melhorar)**
- Adicionar a logo da FM TechFlow no header (igual ao notify-ticket-update)
- Usar o `app_base_url` das configuracoes para o link do dashboard (corrigir bug atual que usa URL errada)
- Manter o design atual que ja esta bom, apenas alinhar com o padrao visual

**3. Template do `test-smtp-connection` (converter para HTML)**
- Converter de texto puro para template HTML elegante
- Usar o mesmo layout base (header com logo, footer com empresa)
- Incluir informacoes de teste como data/hora e servidor utilizado

### Detalhes Tecnicos

**Arquivo:** `supabase/functions/notify-ticket-update/index.ts`
- Refinar a funcao `buildEmailHtml` com melhorias visuais
- Adicionar campo `senderName` ao `EmailParams` para exibir quem enviou
- Melhorar estilos inline para maior compatibilidade com clientes de email (Outlook, Gmail, etc.)

**Arquivo:** `supabase/functions/daily-ticket-summary/index.ts`
- Adicionar logo no header usando a mesma URL do storage
- Corrigir `baseUrl` para usar `app_base_url` das settings (linha 276 atualmente usa URL incorreta)

**Arquivo:** `supabase/functions/test-smtp-connection/index.ts`
- Criar template HTML para o email de teste
- Usar a logo do storage e manter consistencia visual

**Deploy:** As 3 funcoes serao re-deployadas automaticamente apos as alteracoes.

