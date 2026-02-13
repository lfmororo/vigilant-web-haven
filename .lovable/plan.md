

## Menu Configuracoes do Sistema

Criar uma pagina de configuracoes acessivel apenas pelo admin, com opcoes para configurar email de captura de tickets e SMTP para notificacoes.

---

### 1. Criar tabela `system_settings` no banco de dados

Tabela chave-valor para armazenar configuracoes do sistema:

```sql
CREATE TABLE public.system_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text UNIQUE NOT NULL,
  value text,
  description text,
  updated_at timestamptz DEFAULT now(),
  updated_by uuid
);
```

RLS: somente admin pode ler e gravar.

Inserir registros iniciais para as configuracoes:
- `email_imap_host` - Servidor IMAP
- `email_imap_port` - Porta IMAP
- `email_imap_user` - Email para captura de tickets
- `email_imap_password` - Senha do email (captura)
- `smtp_host` - Servidor SMTP
- `smtp_port` - Porta SMTP
- `smtp_user` - Email de envio
- `smtp_password` - Senha SMTP
- `smtp_from_name` - Nome do remetente
- `notification_enabled` - Ativar/desativar notificacoes

---

### 2. Criar pagina `src/pages/admin/SystemSettings.tsx`

Pagina com formulario organizado em secoes usando Tabs:

**Aba "Email de Captura":**
- Campos: Servidor IMAP, Porta, Email, Senha
- Descricao explicando que o sistema verificara este email para abrir tickets automaticamente

**Aba "SMTP (Notificacoes)":**
- Campos: Servidor SMTP, Porta, Email de envio, Senha, Nome do remetente
- Toggle para ativar/desativar notificacoes

Cada aba tera botao "Salvar" que faz upsert na tabela `system_settings`.

---

### 3. Adicionar rota e menu

**`src/App.tsx`:** Nova rota `/admin/settings` com `AuthGuard requireAdmin`

**`src/components/admin/AdminLayout.tsx`:** Adicionar item "Configuracoes" no menu com icone `Settings`, visivel apenas para `admin`, posicionado no final da lista

---

### Detalhes Tecnicos

- Formulario com `react-hook-form` + `zod` para validacao
- Campos de senha com tipo `password` e botao para mostrar/ocultar
- Busca inicial dos dados com `useQuery` na tabela `system_settings`
- Salvamento com `upsert` usando a coluna `key` como conflito
- Toast de sucesso/erro ao salvar
- Usa componentes shadcn/ui existentes: Card, Tabs, Input, Button, Switch, Label

