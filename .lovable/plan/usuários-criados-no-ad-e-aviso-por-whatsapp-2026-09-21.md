# Usuários criados no AD e aviso por WhatsApp

## Objetivo
- Mostrar no painel os usuários concluídos no Active Directory, com filtro por empresa.
- Ao concluir a criação, avisar os administradores e o grupo de WhatsApp da empresa com usuário e senha provisória.

## Implementação
1. **Registro e segurança**
   - Usar o pedido de provisionamento já existente como histórico do usuário criado, sem voltar a gravar a senha provisória no banco.
   - Adicionar controle de notificação para impedir mensagens duplicadas quando o agente repetir um relatório.
2. **Agente do Active Directory**
   - Manter a senha somente na memória durante a execução.
   - Enviá-la de volta exclusivamente no relatório final concluído, pela conexão autenticada do agente.
   - Atualizar a versão mínima para impedir que pacotes antigos consumam novos pedidos.
3. **Notificação WhatsApp**
   - Na conclusão, buscar os telefones dos administradores e o grupo configurado da empresa.
   - Enviar uma mensagem em português com empresa, nome, login, e-mail e senha provisória, informando a troca obrigatória no primeiro acesso.
   - Registrar sucesso ou falha da notificação sem alterar o resultado da criação do usuário.
4. **Painel**
   - Criar uma seção “Usuários criados no AD” com filtro por empresa, busca e dados principais de cada usuário concluído.
   - Manter o acompanhamento de pedidos separado da lista de usuários concluídos.
5. **Validação**
   - Validar o contrato do agente, proteção contra duplicidade, build e implantação da função atualizada.

## Detalhes técnicos
- A senha continuará sendo apagada do banco no momento em que o agente recebe o pedido.
- O retorno da senha será aceito apenas no `report` autenticado, somente para status `done`, com tamanho limitado e sem inclusão em logs.
- As mensagens serão enviadas pela integração Evolution API já configurada no sistema.
