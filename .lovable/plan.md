
## Adicionar botao de excluir OS para administradores

Adicionar um botao de exclusao na pagina de detalhes da Ordem de Servico (`AdminServiceOrderDetail.tsx`), com dialogo de confirmacao para evitar exclusoes acidentais. Ao confirmar, a OS sera removida e o usuario redirecionado para a lista de ordens de servico.

---

### Alteracoes

**Arquivo: `src/pages/admin/AdminServiceOrderDetail.tsx`**

1. Importar `useNavigate` do react-router-dom (ja tem `useParams` e `Link`)
2. Importar `AlertDialog` e seus subcomponentes de `@/components/ui/alert-dialog`
3. Adicionar `const navigate = useNavigate()`
4. Adicionar botao vermelho com icone de lixeira ao lado do botao "Salvar" no cabecalho
5. Envolver o botao em um `AlertDialog` com mensagem de confirmacao: "Tem certeza que deseja excluir a OS #X? Esta acao nao pode ser desfeita."
6. Ao confirmar, executar `supabase.from("service_orders").delete().eq("id", id)` e redirecionar para `/admin/service-orders`

A politica RLS "Admins can delete service orders" ja existe no banco de dados, entao nenhuma alteracao no backend e necessaria.

---

### Detalhes Tecnicos

O botao sera adicionado na barra de acoes do cabecalho, entre os botoes "Imprimir" e "Salvar":

```
[Voltar] [OS #123 / Cliente] ... [Excluir] [Imprimir] [Salvar]
```

Codigo do botao com dialogo de confirmacao seguira o mesmo padrao ja usado em `AdminTicketDetail.tsx` para exclusao de tickets.
