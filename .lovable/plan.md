

## Adicionar Botao de Suporte/Help Desk na Tela Inicial

### Mudancas

**1. Navbar (`src/components/Navbar.tsx`)**
- Adicionar link "Suporte" na navegacao desktop (ao lado dos links existentes)
- Adicionar botao "Suporte" no menu mobile
- O link direciona para `/helpdesk`

**2. HeroSection (`src/components/HeroSection.tsx`)**
- Adicionar um terceiro botao na area de CTA do hero, com icone de Headphones e texto "Abrir Chamado" ou "Suporte Tecnico"
- O botao direciona para `/helpdesk`

### Detalhes Tecnicos

- Usar `window.location.href = "/helpdesk"` ou importar `Link` do react-router-dom para navegacao
- Icone: `Headphones` do lucide-react (ja usado no Dashboard)
- Estilo do botao no Navbar: `variant="outline"` para manter consistencia
- Estilo do botao no Hero: `variant="heroOutline"` com icone de Headphones

