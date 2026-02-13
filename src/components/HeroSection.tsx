import { Button } from "@/components/ui/button";
import { Shield, Lock, Eye, ArrowRight, Headphones } from "lucide-react";

const HeroSection = () => {
  return (
    <section
      id="inicio"
      className="relative min-h-screen flex items-center justify-center pt-20 overflow-hidden bg-gradient-hero"
    >
      {/* Background Grid Pattern */}
      <div className="absolute inset-0 bg-[linear-gradient(rgba(14,165,233,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(14,165,233,0.03)_1px,transparent_1px)] bg-[size:50px_50px]" />
      
      {/* Glow Effects */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary/20 rounded-full blur-[120px] animate-pulse-glow" />
      <div className="absolute bottom-1/4 right-1/4 w-72 h-72 bg-primary/10 rounded-full blur-[100px]" />

      <div className="container mx-auto px-4 relative z-10">
        <div className="max-w-4xl mx-auto text-center">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-secondary border border-border mb-8 animate-fade-in">
            <Shield className="w-4 h-4 text-primary" />
            <span className="text-sm text-muted-foreground">
              Proteção 24 horas por dia, 7 dias por semana
            </span>
          </div>

          {/* Heading */}
          <h1 className="font-display text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-bold mb-6 leading-tight animate-slide-up">
            Segurança Eletrônica{" "}
            <span className="text-gradient">Inteligente</span>{" "}
            para sua Empresa
          </h1>

          {/* Subheading */}
          <p className="text-lg md:text-xl text-muted-foreground mb-10 max-w-2xl mx-auto animate-slide-up" style={{ animationDelay: "0.1s" }}>
            Soluções completas em monitoramento, alarmes e controle de acesso 
            com tecnologia de ponta para proteger o que é mais importante.
          </p>

          {/* CTA Buttons */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-16 animate-slide-up" style={{ animationDelay: "0.2s" }}>
            <Button variant="hero">
              Solicitar Orçamento Grátis
              <ArrowRight className="w-5 h-5" />
            </Button>
            <Button variant="heroOutline">
              Conhecer Soluções
            </Button>
            <Button variant="heroOutline" onClick={() => window.location.href = "/helpdesk"}>
              <Headphones className="w-5 h-5" />
              Suporte Técnico
            </Button>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 md:gap-8 animate-slide-up" style={{ animationDelay: "0.3s" }}>
            {[
              { icon: Shield, value: "10+", label: "Anos de Experiência" },
              { icon: Lock, value: "500+", label: "Clientes Protegidos" },
              { icon: Eye, value: "24/7", label: "Monitoramento" },
              { icon: Shield, value: "99.9%", label: "Uptime Garantido" },
            ].map((stat, index) => (
              <div
                key={index}
                className="p-4 rounded-xl bg-card/50 border border-border/50 backdrop-blur-sm hover:border-primary/30 transition-colors"
              >
                <stat.icon className="w-6 h-6 text-primary mx-auto mb-2" />
                <div className="font-display text-2xl md:text-3xl font-bold text-foreground">
                  {stat.value}
                </div>
                <div className="text-sm text-muted-foreground">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Bottom Gradient */}
      <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-background to-transparent" />
    </section>
  );
};

export default HeroSection;
