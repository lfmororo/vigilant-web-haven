## Plano: Corrigir login do Google Drive no backup

### Problema
O agente envia `http://localhost:53682/callback`, mas o cadastro atual do Google não reconhece esse endereço exatamente, gerando `redirect_uri_mismatch`.

### Correção
- Validar a porta OAuth configurada e usar o endereço de retorno de aplicativo instalado aceito pelo Google.
- Exibir no menu de backup o endereço exato que deve ser cadastrado nas credenciais Google.
- Atualizar o pacote e a documentação com diagnóstico claro para credencial do tipo incorreto ou endereço divergente.
- Validar a sintaxe do agente e a compilação do painel.

### Arquivos afetados
- `public/cloud-backup.js`
- `public/cloud-backup-README.md`
- `src/components/admin/backup/CloudBackupConfig.tsx`
