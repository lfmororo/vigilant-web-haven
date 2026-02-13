
## Ordem de Servico para Impressao - Layout Completo

Implementar um botao "Imprimir OS" na pagina de detalhe da OS que gera um layout para impressao identico ao PDF de exemplo, com todos os campos necessarios adicionados ao banco de dados.

---

### 1. Alteracoes no Banco de Dados

Adicionar campos faltantes nas tabelas existentes:

**Tabela `profiles`** (endereco do cliente):
- `address` (text) - Endereco/Rua
- `address_number` (text) - Numero
- `address_complement` (text) - Complemento
- `neighborhood` (text) - Bairro
- `city` (text) - Cidade

**Tabela `service_orders`** (campos da OS):
- `arrival_date` (timestamptz) - Data de chegada
- `departure_date` (timestamptz) - Data de saida
- `travel_cost` (numeric, default 0) - Valor de deslocamento
- `equipment_removed` (text) - Equipamento retirado
- `material_used` (text) - Descricao do material utilizado
- `service_description` (text) - Descricao do servico realizado
- `checked_by` (text) - Conferido por
- `technician_signature` (text) - Assinatura do tecnico (texto/nome)
- `client_signature` ja existe na tabela

---

### 2. Atualizar Formulario da OS (AdminServiceOrderDetail.tsx)

Adicionar os novos campos no formulario de edicao:
- Secao "Servico": descricao do servico, equipamento retirado, material utilizado
- Secao "Datas": data chegada, data saida
- Secao "Custos": valor de deslocamento (junto ao campo existente de mao de obra)
- Secao "Configuracoes": conferido por

---

### 3. Criar Componente de Impressao (ServiceOrderPrint.tsx)

Novo componente `src/components/admin/ServiceOrderPrint.tsx` com layout identico ao PDF:

**Pagina 1 - Cabecalho e Historico:**
- Logo/dados da empresa (buscados de `system_settings`)
- Titulo "Ordem de servico ID: #N"
- Dados do cliente em grid: nome, endereco, numero, complemento, bairro, cidade, contato, telefone
- Categoria (tipo de equipamento do ticket vinculado)
- Assunto do problema (titulo do ticket)
- Descricao do problema
- Acompanhamentos: tabela com data, hora, responsavel, acao e descricao (mensagens do ticket)

**Pagina 2 - Resumo do Servico:**
- Descricao do servico realizado
- Equipamento retirado
- Material utilizado
- Grid: Tecnico | Conferido por
- Grid: Data chegada | Data saida
- Grid: Data criacao | Data ultima atualizacao
- Grid: Pecas | Mao de obra | Valor total | Valor de deslocamento
- Areas de assinatura: tecnico e cliente

---

### 4. Botao de Impressao

Adicionar botao "Imprimir" ao lado do botao "Salvar" na pagina `AdminServiceOrderDetail.tsx`. Ao clicar, abre o componente de impressao em uma nova janela ou usa `window.print()` com CSS `@media print` para ocultar elementos da interface e exibir apenas o layout da OS.

---

### Detalhes Tecnicos

- O componente de impressao busca os dados do ticket vinculado (via `ticket_id`) incluindo mensagens (`ticket_messages`) para montar a tabela de acompanhamentos
- Busca dados da empresa de `system_settings` (chaves como `company_name`, `company_address`, `company_phone`, `company_cnpj`)
- CSS com `@media print` para esconder navbar/sidebar e mostrar apenas o conteudo da OS
- Layout usa classes Tailwind com `print:` prefix para estilizacao de impressao
- Os novos campos no profiles serao editaveis na pagina de gestao de clientes existente
