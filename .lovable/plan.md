
# Processador, Memória e Disco no Inventário de Equipamentos

## O que será feito

Adicionar campos de hardware (CPU, RAM, Disco — espaço total, usado e livre) e data da última atualização à tabela de inventário. Esses dados serão exibidos na listagem, na tela de detalhe do equipamento e no relatório PDF. O script de sincronização via API também será atualizado para aceitar e gravar esses campos.

---

## Problemas identificados

- A tabela `equipment_inventory` **não possui** colunas para CPU, memória, disco ou data de atualização de hardware.
- A tela `/admin/inventory` (listagem) não exibe essas informações.
- A tela `/admin/inventory/:id` (detalhe) não exibe essas informações.
- O componente `EquipmentInventoryPrint` (PDF) não inclui essas colunas.
- A Edge Function `inventory-sync` (usada pelo script PowerShell/Python) não aceita nem grava esses campos.

---

## 1. Banco de dados — Migration

Adicionar as seguintes colunas à tabela `equipment_inventory`:

| Coluna | Tipo | Descrição |
|---|---|---|
| `cpu` | text | Modelo/descrição do processador |
| `ram_total_gb` | numeric | Memória RAM total (GB) |
| `disk_total_gb` | numeric | Disco total (GB) |
| `disk_used_gb` | numeric | Espaço usado em disco (GB) |
| `disk_free_gb` | numeric | Espaço livre em disco (GB) |
| `hardware_updated_at` | timestamptz | Data/hora da última atualização de hardware |

```sql
ALTER TABLE public.equipment_inventory
  ADD COLUMN IF NOT EXISTS cpu text,
  ADD COLUMN IF NOT EXISTS ram_total_gb numeric,
  ADD COLUMN IF NOT EXISTS disk_total_gb numeric,
  ADD COLUMN IF NOT EXISTS disk_used_gb numeric,
  ADD COLUMN IF NOT EXISTS disk_free_gb numeric,
  ADD COLUMN IF NOT EXISTS hardware_updated_at timestamptz;
```

---

## 2. Tela de listagem — `EquipmentInventory.tsx`

Adicionar colunas visuais na tabela de equipamentos. Como a tabela já é larga, os dados de hardware serão exibidos de forma compacta em uma coluna "Hardware" com mini-badges ou texto resumido:

```
CPU: Intel i7  |  RAM: 16 GB  |  Disco: 120/500 GB livre
```

- A coluna "Hardware" aparece apenas se ao menos um item tiver `cpu` ou `ram_total_gb` preenchidos (para não poluir quando nenhum equipamento tem dados de hardware).
- Exibir também a "Última atualização" do hardware como tooltip ou linha secundária pequena.
- Atualizar a interface `Equipment` para incluir os novos campos.

---

## 3. Tela de detalhe — `EquipmentDetail.tsx`

No card "Informações do Equipamento", adicionar uma seção "Recursos de Hardware" com os dados de forma clara:

```
Processador:   Intel Core i7-10700
RAM:           16 GB
Disco Total:   500 GB
Disco Usado:   380 GB (76%)
Disco Livre:   120 GB
Última atualização: 19/02/2026 às 14:30
```

Exibir uma barra de progresso visual para o disco (vermelho se >80% usado, amarelo se >60%, verde se normal).

---

## 4. Relatório PDF — `EquipmentInventoryPrint.tsx`

Adicionar colunas compactas ao relatório impresso:

| CPU | RAM (GB) | Disco Usado/Total (GB) | Última Atualização |
|---|---|---|---|

Atualizar a interface `Equipment` interna do componente para incluir os novos campos.

---

## 5. Edge Function `inventory-sync` — aceitação dos dados via API

Atualizar o `POST` da Edge Function para aceitar os novos campos vindos do script PowerShell/Python:

```json
{
  "client_id": "...",
  "api_key": "...",
  "equipment": [
    {
      "name": "Servidor-01",
      "serial_number": "SRV-001",
      "cpu": "Intel Xeon E5-2670",
      "ram_total_gb": 32,
      "disk_total_gb": 1000,
      "disk_used_gb": 450,
      "disk_free_gb": 550,
      "hardware_updated_at": "2026-02-19T14:30:00Z"
    }
  ]
}
```

Ao gravar, se `hardware_updated_at` não for enviado, o sistema define automaticamente como `now()`.

---

## Arquivos a modificar

| Arquivo | O que muda |
|---|---|
| `supabase/migrations/...` | Adiciona 6 novas colunas à tabela |
| `src/pages/admin/EquipmentInventory.tsx` | Interface + coluna "Hardware" na tabela |
| `src/pages/admin/EquipmentDetail.tsx` | Seção de hardware com barra de progresso de disco |
| `src/components/admin/EquipmentInventoryPrint.tsx` | Colunas de hardware no PDF |
| `supabase/functions/inventory-sync/index.ts` | Aceitar e gravar campos de hardware no POST |

---

## Comportamento esperado

- Equipamentos sem dados de hardware mostram "-" nos campos (nada quebra).
- Scripts PowerShell/Python já existentes podem ser atualizados para enviar os novos campos — o sistema aceita com ou sem eles.
- A barra de progresso do disco no detalhe oferece visibilidade rápida de equipamentos com pouco espaço livre.
- O `hardware_updated_at` indica quando o script fez a última coleta, facilitando identificar máquinas desatualizadas.
