
# Notificações via WhatsApp (Whatsapi.my)

## Resumo

Integrar o sistema de notificações de tickets com a API Whatsapi.my para enviar mensagens WhatsApp automaticamente quando tickets forem abertos, atualizados, resolvidos ou encerrados -- seguindo o mesmo padrão já existente para Email (SMTP) e Telegram.

---

## Arquitetura

A integração seguirá o padrão fire-and-forget já usado pelo Telegram:

1. O `notify-ticket-update` (edge function central de notificações) fará um POST para uma nova edge function `notify-whatsapp`
2. A `notify-whatsapp` buscará o telefone do(s) destinatário(s) na tabela `profiles.phone`, formatará a mensagem e chamará `POST /send/text` na API Whatsapi.my
3. As configurações (URL da API, token da instancia, ativar/desativar) ficam na tabela `system_settings`
4. A tela de Configurações do Sistema ganha uma nova aba "WhatsApp"

---

## 1. Banco de dados -- Migration

Inserir as chaves de configuração do WhatsApp na tabela `system_settings`:

| Key | Descricao |
|---|---|
| `whatsapp_api_url` | URL base da API (ex: `https://ipazua.uazapi.com`) |
| `whatsapp_api_token` | Token da instancia WhatsApp |
| `whatsapp_enabled` | `true` / `false` para ativar/desativar |

```sql
INSERT INTO system_settings (key, value, description) VALUES
  ('whatsapp_api_url', '', 'URL base da API WhatsApp (Whatsapi.my)'),
  ('whatsapp_api_token', '', 'Token da instância WhatsApp'),
  ('whatsapp_enabled', 'false', 'Ativar notificações via WhatsApp')
ON CONFLICT (key) DO NOTHING;
```

Nota: Sera necessario criar uma constraint UNIQUE na coluna `key` caso nao exista, ou usar uma logica de upsert alternativa.

---

## 2. Nova Edge Function -- `notify-whatsapp`

Arquivo: `supabase/functions/notify-whatsapp/index.ts`

**Comportamento:**
- Recebe `{ ticket_id, notification_type, message, sender_name, resolution_summary }` (mesmo payload do notify-telegram)
- Busca o ticket (numero, titulo, prioridade, client_id, assigned_to, equipment_type)
- Busca os telefones dos destinatarios na tabela `profiles` (campo `phone`)
- Le as configuracoes `whatsapp_api_url`, `whatsapp_api_token` e `whatsapp_enabled` da `system_settings`
- Se desabilitado ou sem configuracao, retorna silenciosamente
- Para cada destinatario com telefone preenchido, envia `POST {whatsapp_api_url}/send/text` com:
  - Header: `token: {whatsapp_api_token}`
  - Body: `{ "number": "{phone}", "text": "{mensagem formatada}" }`
- A mensagem sera formatada em texto simples (WhatsApp suporta *negrito*, _italico_) com emojis, similar ao Telegram

**Formato da mensagem (exemplo para novo ticket):**
```
🆕 *Novo Chamado*

📋 *Ticket:* #1234
📝 *Assunto:* Impressora nao funciona
🏷️ *Categoria:* Impressoras
⚡ *Prioridade:* 🔴 Urgente
👤 *Por:* Joao Silva

💬 *Descricao:*
A impressora do 2o andar parou de imprimir.
```

**Config no `supabase/config.toml`:**
```toml
[functions.notify-whatsapp]
verify_jwt = false
```

---

## 3. Atualizar `notify-ticket-update`

Adicionar chamada fire-and-forget para `notify-whatsapp`, identica ao padrao ja usado para Telegram:

```typescript
// --- Send WhatsApp notification (fire-and-forget) ---
const whatsappPromise = (async () => {
  try {
    const whatsappUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/notify-whatsapp`;
    await fetch(whatsappUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
      },
      body: JSON.stringify({
        ticket_id,
        notification_type: emailType,
        message,
        sender_name: senderName,
        resolution_summary,
      }),
    });
  } catch (err) {
    console.error("WhatsApp notification failed:", err);
  }
})();
```

E no final, aguardar ambos: `await Promise.all([telegramPromise, whatsappPromise]);`

---

## 4. Tela de Configuracoes -- Nova aba "WhatsApp"

No `SystemSettings.tsx`, adicionar uma terceira aba com:

- Campo "URL da API" (text input, placeholder: `https://ipazua.uazapi.com`)
- Campo "Token da Instancia" (password input com toggle de visibilidade)
- Switch "Ativar notificacoes WhatsApp"
- Botao "Salvar"
- Botao "Testar Conexao" (chama `GET {url}/instance/status` com header `token` para verificar se a instancia esta conectada)

---

## Arquivos a criar/modificar

| Arquivo | Acao |
|---|---|
| Migration SQL | Inserir 3 chaves na `system_settings` |
| `supabase/functions/notify-whatsapp/index.ts` | **Criar** -- nova edge function |
| `supabase/config.toml` | Adicionar `[functions.notify-whatsapp]` |
| `supabase/functions/notify-ticket-update/index.ts` | Adicionar chamada fire-and-forget para WhatsApp |
| `src/pages/admin/SystemSettings.tsx` | Adicionar aba WhatsApp com formulario de configuracao |

---

## Detalhes tecnicos

- A API Whatsapi.my autentica via header `token` (nao Bearer, apenas o valor direto)
- O endpoint `POST /send/text` requer `{ number, text }` onde `number` e o telefone em formato internacional (ex: `5511999999999`)
- Os telefones dos clientes ja existem na tabela `profiles.phone` -- serao limpos (remover espacos, parenteses, hifens) antes do envio
- Se o campo `phone` estiver vazio para um destinatario, ele sera ignorado silenciosamente (a notificacao por email continua funcionando normalmente)
- Nenhuma API key externa precisa ser salva como secret do Supabase -- tudo fica na `system_settings` (mesma abordagem do SMTP)
