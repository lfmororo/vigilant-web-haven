

# Filtro por cliente, edicao de equipamentos, novos tipos e relatorio PDF

## Mudancas

### 1. Filtro por cliente na listagem
Adicionar um terceiro Select nos filtros existentes para selecionar um cliente especifico. O estado `filterClient` (padrao "all") sera adicionado e incluido nas dependencias do useEffect. No `fetchEquipment`, quando diferente de "all", aplica `.eq("client_id", filterClient)`.

### 2. Edicao de equipamentos
Adicionar botao "Editar" (icone de lapis) na coluna de acoes da tabela. Ao clicar, abre um Dialog pre-preenchido com os dados do equipamento. Ao salvar, faz UPDATE no banco e recarrega a lista.

- Novo estado `editTarget: Equipment | null`
- Quando definido, abre Dialog com formulario identico ao de criacao, porem preenchido
- Ao submeter: `supabase.from("equipment_inventory").update({...}).eq("id", editTarget.id)`
- Fecha dialog e recarrega lista

### 3. Novos tipos de equipamento
Inserir na tabela `equipment_types` via migracao:
- **Maquina Virtual** (icone: "monitor")
- **Servidor** (icone: "server")

### 4. Relatorio PDF do inventario
Criar um componente `EquipmentInventoryPrint.tsx` seguindo o mesmo padrao do `ServiceOrderPrint.tsx` existente (layout de impressao com `window.print()` e CSS para pagina A4).

O relatorio incluira:
- Cabecalho com dados da empresa (buscados de `system_settings`)
- Titulo "Relatorio de Inventario de Equipamentos"
- Filtros aplicados no momento (status, tipo, cliente)
- Tabela com todos os equipamentos filtrados: Nome, Tipo, Marca/Modelo, Serie, Cliente, Localizacao, Status
- Data de geracao do relatorio
- Contagem total de equipamentos

Um botao "Gerar PDF" sera adicionado ao lado dos botoes existentes no cabecalho da pagina. Ao clicar, abre o componente de impressao (mesmo mecanismo do ServiceOrderPrint: renderiza uma pagina de impressao e chama `window.print()`).

## Detalhes tecnicos

| Arquivo / Recurso | Mudanca |
|---|---|
| `src/pages/admin/EquipmentInventory.tsx` | Filtro por cliente, botao Editar com dialog, botao Gerar PDF, estado `editTarget`, `filterClient`, `showPrint` |
| `src/components/admin/EquipmentInventoryPrint.tsx` | Novo componente de layout de impressao para o relatorio |
| Banco de dados (migracao) | INSERT de "Maquina Virtual" e "Servidor" na tabela `equipment_types` |

### Estrutura do relatorio PDF

O componente `EquipmentInventoryPrint.tsx` recebera:
- `equipment: Equipment[]` (lista filtrada atual)
- `filters: { status, type, client }` (filtros ativos para exibir no cabecalho)
- `onClose: () => void`

Usara o mesmo padrao visual do `ServiceOrderPrint`: fundo branco, bordas pretas, secoes com cabecalho cinza, texto pequeno, botoes "Imprimir" e "Voltar" ocultos na impressao.

