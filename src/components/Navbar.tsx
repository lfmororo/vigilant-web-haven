import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Menu, X, Headphones } from "lucide-react";
import fmLogo from "@/assets/fm-techflow-logo.png";

const Navbar = () => {
  const [isOpen, setIsOpen] = useState(false);

  const navLinks = [
  { label: "Início", href: "#inicio" },
  { label: "Serviços", href: "#servicos" },
  { label: "Sobre", href: "#sobre" },
  { label: "Contato", href: "#contato" }];


  const handleClientAreaClick = () => {
    window.location.href = "/auth";
  };

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-background/80 backdrop-blur-xl border-b border-border">
      <div className="container mx-auto px-4">
        <div className="flex items-center justify-between h-20">
          {/* Logo */}
          <a href="#inicio" className="flex items-center gap-3 group">
            <img alt="Mororo.tech" className="h-14" src="/lovable-uploads/6a5524af-fc9f-4a85-85ec-2236896048a6.png" />
          </a>

          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center gap-8">
            {navLinks.map((link) =>
            <a
              key={link.label}
              href={link.href}
              className="text-muted-foreground hover:text-foreground transition-colors font-medium">

                {link.label}
              </a>
            )}
          </div>

          {/* CTA Buttons */}
          <div className="hidden md:flex items-center gap-3">
            <Button variant="outline" onClick={() => window.location.href = "/helpdesk"}>
              <Headphones className="w-4 h-4" />
              Suporte
            </Button>
            <Button variant="outline" onClick={handleClientAreaClick}>
              Área do Cliente
            </Button>
            <Button variant="default" size="lg">
              Solicitar Orçamento
            </Button>
          </div>

          {/* Mobile Menu Button */}
          <button
            className="md:hidden p-2 text-foreground"
            onClick={() => setIsOpen(!isOpen)}>

            {isOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>

        {/* Mobile Navigation */}
        {isOpen &&
        <div className="md:hidden py-4 border-t border-border animate-fade-in">
            <div className="flex flex-col gap-4">
              {navLinks.map((link) =>
            <a
              key={link.label}
              href={link.href}
              className="text-muted-foreground hover:text-foreground transition-colors font-medium py-2"
              onClick={() => setIsOpen(false)}>

                  {link.label}
                </a>
            )}
              <Button variant="outline" className="mt-2" onClick={() => {setIsOpen(false);window.location.href = "/helpdesk";}}>
                <Headphones className="w-4 h-4" />
                Suporte
              </Button>
              <Button variant="outline" className="mt-2" onClick={handleClientAreaClick}>
                Área do Cliente
              </Button>
              <Button variant="default" className="mt-2">
                Solicitar Orçamento
              </Button>
            </div>
          </div>
        }
      </div>
    </nav>);

};

export default Navbar;