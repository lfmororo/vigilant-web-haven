

## Endpoint API para Receber Dados de Inventario via POST

Criar uma backend function que aceita dados de equipamentos via POST, permitindo que scripts externos (PowerShell, Python, etc.) enviem informacoes das maquinas automaticamente para o inventario.

---

### 1. Nova Backend Function: `inventory-sync`

Arquivo: `supabase/functions/inventory-sync/index.ts`

**Autenticacao:** Via API key do cliente (usando o `client_id` + um token gerado). O endpoint valida o token antes de aceitar dados.

**Endpoints (via metodo HTTP):**

- `POST` - Cadastrar ou atualizar equipamento (upsert por `serial_number`)
- `GET` - Listar equipamentos do cliente (para o script verificar o que ja foi enviado)

**Campos aceitos no body:**
```json
{
  "client_id": "uuid-do-cliente",
  "api_key": "chave-de-acesso",
  "equipment": [
    {
      "name": "PC-RECEPCAO-01",
      "serial_number": "SN123456",
      "brand": "Dell",
      "model": "OptiPlex 7090",
      "equipment_type": "PC/Notebook",
      "location": "Recepcao",
      "notes": "Windows 11 Pro, 16GB RAM, Intel i7-11700, SSD 512GB, IP: 192.168.1.50"
    }
  ]
}
```

**Logica:**
- Valida o `client_id` e `api_key` contra uma nova tabela `inventory_api_keys`
- Para cada equipamento, faz upsert por `serial_number` + `client_id` (se ja existe, atualiza; senao, cria)
- Resolve `equipment_type` pelo nome (busca na tabela `equipment_types`)
- Retorna resumo: quantos criados, quantos atualizados, erros

---

### 2. Banco de Dados - Nova Tabela

**Tabela `inventory_api_keys`:**
- `id` (uuid, PK)
- `client_id` (uuid, FK -> profiles.id) - Cliente dono da chave
- `api_key` (text, unique) - Chave de acesso gerada (UUID v4)
- `description` (text) - Descricao/nome do script
- `is_active` (boolean, default true)
- `last_used_at` (timestamptz, nullable)
- `created_at` (timestamptz)

**RLS:** Admins podem CRUD; Clientes podem ver suas proprias chaves.

---

### 3. UI - Gerenciar Chaves de API

**Adicionar na pagina de Detalhes do Cliente (`/admin/clients`) ou nova secao no inventario:**
- Botao "Gerar Chave de API" para cada cliente
- Lista de chaves ativas com opcao de desativar
- Exibir a chave apenas uma vez ao criar (depois mostra apenas os ultimos 8 caracteres)

**Adicionar secao na pagina `EquipmentInventory.tsx`:**
- Botao "Integracao API" que abre um dialog com:
  - Lista de chaves de API ativas
  - Exemplo de script PowerShell/Python para copiar

---

### 4. Exemplos de Scripts (exibidos na UI)

**PowerShell (Windows):**
```powershell
$body = @{
  client_id = "SEU_CLIENT_ID"
  api_key = "SUA_API_KEY"
  equipment = @(@{
    name = $env:COMPUTERNAME
    serial_number = (Get-WmiObject Win32_BIOS).SerialNumber
    brand = (Get-WmiObject Win32_ComputerSystem).Manufacturer
    model = (Get-WmiObject Win32_ComputerSystem).Model
    equipment_type = "PC/Notebook"
    notes = "OS: $([System.Environment]::OSVersion.VersionString), RAM: $([math]::Round((Get-WmiObject Win32_ComputerSystem).TotalPhysicalMemory/1GB))GB"
  })
} | ConvertTo-Json -Depth 3

Invoke-RestMethod -Uri "URL_DA_FUNCAO/inventory-sync" -Method POST -Body $body -ContentType "application/json"
```

**Python:**
```python
import requests, subprocess
requests.post("URL_DA_FUNCAO/inventory-sync", json={
    "client_id": "SEU_CLIENT_ID",
    "api_key": "SUA_API_KEY",
    "equipment": [{"name": "PC-01", "serial_number": "SN123", ...}]
})
```

---

### 5. Configuracao

No `supabase/config.toml`:
```toml
[functions.inventory-sync]
verify_jwt = false
```

JWT desabilitado pois a autenticacao sera via `api_key` propria (para scripts externos que nao tem sessao de usuario).

---

### 6. Arquivos a Criar/Modificar

**Criar:**
1. `supabase/functions/inventory-sync/index.ts` - Endpoint principal
2. Migracao SQL para tabela `inventory_api_keys`

**Modificar:**
1. `src/pages/admin/EquipmentInventory.tsx` - Adicionar botao/dialog de integracao API com exemplos de script
2. `src/pages/admin/ClientsManagement.tsx` - Adicionar secao de chaves de API por cliente

---

### 7. Ordem de Implementacao

1. Migracao de banco (tabela `inventory_api_keys`)
2. Backend function `inventory-sync`
3. UI para gerenciar chaves e exibir exemplos de scripts

