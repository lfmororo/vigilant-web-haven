

## Redirecionar Tecnico e Cliente para /helpdesk apos Login

Alterar a logica de redirecionamento pos-login para que tecnicos e clientes sejam enviados para `/helpdesk` em vez de `/dashboard`.

---

### Alteracoes

**Arquivo: `src/pages/Auth.tsx`**

Modificar o `useEffect` de redirecionamento para incluir os roles `technician` e `client`:

```
Logica atual:
- admin -> /admin
- qualquer outro -> /dashboard

Nova logica:
- admin -> /admin
- technician -> /admin/helpdesk
- client -> /helpdesk
- outros -> /dashboard
```

**Arquivo: `src/components/auth/AuthGuard.tsx`**

Nenhuma alteracao necessaria - o guard ja permite acesso a `/helpdesk` para usuarios autenticados.

---

### Detalhes Tecnicos

No `useEffect` do `Auth.tsx`, trocar o bloco de redirecionamento:

```typescript
if (role === "admin") {
  navigate("/admin");
} else if (role === "technician") {
  navigate("/admin/helpdesk");
} else if (role === "client") {
  navigate("/helpdesk");
} else {
  navigate("/dashboard");
}
```

Isso garante que cada perfil caia na tela mais relevante para seu uso.

