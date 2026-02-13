

## Padronizar Template de Novo Chamado com os Demais

### Resumo
O email de "Novo Chamado Aberto" ja usa o mesmo layout externo (header com logo, gradiente, footer), porem o conteudo interno e mais simples que os outros tipos. A alteracao vai adicionar a descricao do chamado em um bloco estilizado, igual ao bloco "Nova Mensagem" do template de atualizacao.

### O que sera feito

**Adicionar bloco de descricao ao template `ticket_opened`**
- Incluir a descricao/mensagem inicial do chamado em um bloco estilizado com borda lateral colorida (igual ao bloco "Nova Mensagem" do tipo `ticket_updated`)
- O bloco tera o titulo "Descricao do Chamado" com a cor azul (#2563eb) do tema de novo chamado
- Manter a tabela de informacoes (numero, assunto, categoria, prioridade) que ja existe

### Detalhes Tecnicos

**Arquivo:** `supabase/functions/notify-ticket-update/index.ts`
- Linhas 60-70: Adicionar apos a tabela de informacoes um bloco `div` com `border-left: 4px solid #2563eb` contendo a mensagem/descricao do chamado
- O bloco seguira o mesmo padrao visual do bloco "Nova Mensagem" (linhas 108-111) mas com cor azul e titulo "Descricao do Chamado"

**Deploy:** A funcao sera re-deployada automaticamente.
