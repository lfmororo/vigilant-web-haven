

## Trocar Logo e Nome para FM TechFlow

### Resumo
Substituir todas as referencias a "SecureTech" por "FM TechFlow" e usar a logo fornecida em todo o sistema.

### Alteracoes

**1. Copiar a logo para o projeto**
- Copiar `user-uploads://tempImageGmYSZa_-_Editado.png` para `src/assets/fm-techflow-logo.png`

**2. Arquivos a serem editados (10 arquivos)**

| Arquivo | O que muda |
|---|---|
| `index.html` | Titulo, meta description, og:title, twitter:site - tudo de "SecureTech" para "FM TechFlow" |
| `src/pages/Index.tsx` | Titulo e meta tags do Helmet |
| `src/components/Navbar.tsx` | Substituir icone Shield + texto "SecureTech" pela imagem da logo |
| `src/components/Footer.tsx` | Substituir icone Shield + texto "SecureTech" pela logo; atualizar copyright |
| `src/components/HeroSection.tsx` | Nenhuma referencia direta a "SecureTech", mas o badge pode ser atualizado se necessario |
| `src/components/AboutSection.tsx` | Trocar "SecureTech" por "FM TechFlow" no titulo e texto |
| `src/components/ContactSection.tsx` | Trocar email de "contato@securetech.com.br" para "contato@fmtechflow.com.br" |
| `src/components/admin/AdminLayout.tsx` | Substituir Shield + "SecureTech" pela logo (sidebar e header mobile) |
| `src/components/helpdesk/HelpdeskLayout.tsx` | Substituir Shield + "SecureTech" pela logo |
| `src/pages/Dashboard.tsx` | Substituir Shield + "SecureTech" pela logo |
| `src/pages/admin/SystemSettings.tsx` | Trocar placeholder "SecureTech Suporte" |

**3. Como a logo sera usada**
- Importada como modulo ES6: `import fmLogo from "@/assets/fm-techflow-logo.png"`
- Renderizada como `<img>` com altura fixa (~32-40px) no lugar do icone Shield + texto
- A logo ja contem o nome "FM | TECHFLOW", entao em alguns locais o texto separado sera removido

### Detalhes Tecnicos

Exemplo de como ficara a Navbar:
```tsx
import fmLogo from "@/assets/fm-techflow-logo.png";

// Onde antes era:
<Shield className="w-7 h-7 text-primary" />
<span>SecureTech</span>

// Ficara:
<img src={fmLogo} alt="FM TechFlow" className="h-10" />
```

Todas as descricoes textuais (meta tags, textos de paragrafo, copyright) serao atualizadas de "SecureTech" para "FM TechFlow".
