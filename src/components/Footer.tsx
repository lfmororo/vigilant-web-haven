import { Instagram, Facebook, Linkedin } from "lucide-react";
import fmLogo from "@/assets/mororo-tech-logo.png.asset.json";
import mororoLogo from "@/assets/mororo-tech-logo.png.asset.json";

const Footer = () => {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="bg-card border-t border-border py-12">
      <div className="container mx-auto px-4">
        <div className="grid md:grid-cols-4 gap-8 mb-10">
          {/* Logo & Description */}
          <div className="md:col-span-2">
            <a href="#inicio" className="flex items-center gap-3 mb-4">
              <img src={fmLogo.url} alt="Mororo.tech" className="h-10" />
            </a>
            <p className="text-muted-foreground leading-relaxed max-w-sm">
              Soluções completas em segurança eletrônica para empresas e 
              residências. Proteção inteligente com tecnologia de ponta.
            </p>
          </div>

          {/* Links */}
          <div>
            <h4 className="font-display font-semibold text-foreground mb-4">
              Links Rápidos
            </h4>
            <ul className="space-y-2">
              {["Início", "Serviços", "Sobre", "Contato"].map((link) => (
                <li key={link}>
                  <a
                    href={`#${link.toLowerCase()}`}
                    className="text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {link}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          {/* Social */}
          <div>
            <h4 className="font-display font-semibold text-foreground mb-4">
              Redes Sociais
            </h4>
            <div className="flex gap-3">
              {[Instagram, Facebook, Linkedin].map((Icon, index) => (
                <a
                  key={index}
                  href="#"
                  className="w-10 h-10 rounded-lg bg-secondary flex items-center justify-center text-muted-foreground hover:text-primary hover:bg-primary/10 transition-all"
                >
                  <Icon className="w-5 h-5" />
                </a>
              ))}
            </div>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="pt-8 border-t border-border flex flex-col md:flex-row justify-between items-center gap-4">
          <p className="text-sm text-muted-foreground flex items-center gap-2">
            <img src={mororoLogo.url} alt="Mororo.Tech" className="h-5 w-auto" />
            <span>© {currentYear} Mororo.Tech. Todos os direitos reservados.</span>
          </p>
          <div className="flex gap-6 text-sm">
            <a href="#" className="text-muted-foreground hover:text-foreground transition-colors">
              Política de Privacidade
            </a>
            <a href="#" className="text-muted-foreground hover:text-foreground transition-colors">
              Termos de Uso
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
