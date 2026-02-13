

## Notificacao Diaria de Resumo de Chamados

Criar uma funcao backend agendada que envia um e-mail de resumo diario para todos os administradores as 09:00 e 15:00 (horario de Brasilia), usando como modelo visual a imagem fornecida.

### O que sera feito

**1. Nova funcao backend: `daily-ticket-summary`**
- Consulta tickets agrupados por status:
  - **Aguardando Cliente** (waiting_client) - card laranja "PENDENTE"
  - **Abertos** (open sem tecnico) - card azul "ABERTOS"
  - **Em Andamento** (in_progress ou open com tecnico) - card verde "EM ANDAMENTO"
- Para cada categoria, lista os tickets com numero e tecnico/cliente atribuido
- Busca todos os admins (user_roles + profiles) para envio
- Carrega configuracoes SMTP de system_settings
- Envia e-mail HTML seguindo o layout da imagem de referencia

**2. Template HTML do e-mail (baseado na imagem)**
- Cabecalho com nome da empresa (de smtp_from_name)
- Titulo "Resumo Diario de Chamados de Suporte - [data]"
- Secao "Visao Geral" com 3 cards coloridos lado a lado:
  - Laranja: contador de Pendentes (waiting_client)
  - Azul: contador de Abertos (open sem tecnico)
  - Verde: contador de Em Andamento
- Secao "Detalhes por Categoria" com tabela para cada categoria listando:
  - Numero do ticket
  - Tecnico atribuido (ou "Nao atribuido")
- Botao "Acessar Dashboard" apontando para /admin/helpdesk
- Footer com nome da empresa

**3. Agendamento via pg_cron**
- Dois jobs cron:
  - `daily-ticket-summary-9am`: executa as 12:00 UTC (09:00 BRT)
  - `daily-ticket-summary-3pm`: executa as 18:00 UTC (15:00 BRT)

**4. Configuracao**
- Adicionar `[functions.daily-ticket-summary]` com `verify_jwt = false` no config.toml

### Detalhes Tecnicos

| Arquivo | Acao |
|---|---|
| `supabase/functions/daily-ticket-summary/index.ts` | Criar - funcao que consulta tickets, monta HTML e envia via SMTP |
| `supabase/config.toml` | Adicionar entrada para daily-ticket-summary |
| SQL (pg_cron) | Criar 2 jobs agendados via INSERT no cron |

**Estrutura da funcao:**
1. Conectar com service role key
2. Contar e listar tickets por status
3. Buscar admins e suas informacoes de perfil
4. Carregar config SMTP (smtp_host, smtp_port, smtp_user, smtp_password, smtp_from_name)
5. Gerar HTML no estilo da imagem de referencia (3 cards coloridos + tabelas detalhadas)
6. Enviar para cada admin usando a mesma funcao SMTP da notify-ticket-update (reescrita local)
7. Retornar quantidade de e-mails enviados

**Layout do HTML:**
```text
+------------------------------------------+
|          [NOME DA EMPRESA]               |
|  Resumo Diario - 13 de Fevereiro, 2025  |
|------------------------------------------|
|  Visao Geral:                            |
|  [LARANJA]  [AZUL]      [VERDE]          |
|   15         30           45             |
|  PENDENTE   ABERTOS    EM ANDAMENTO      |
|------------------------------------------|
|  Detalhes por Categoria:                 |
|  Chamados Em Andamento (45)              |
|  | Ticket ID  | Tecnico Atribuido |      |
|  | #2025-015  | Jessica M         |      |
|  | #2025-018  | David L           |      |
|  ...                                     |
|  [Botao: Acessar Dashboard]              |
|  Footer: Empresa · Sistema de Suporte    |
+------------------------------------------+
```

