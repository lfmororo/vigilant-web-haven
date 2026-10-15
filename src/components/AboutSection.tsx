import { Check, Award, Users, Clock } from "lucide-react";

const features = [
  "Atendimento personalizado para cada cliente",
  "Equipamentos de última geração",
  "Instalação profissional certificada",
  "Suporte técnico 24 horas",
  "Garantia estendida em todos os produtos",
  "Manutenção preventiva incluída",
];

const AboutSection = () => {
  return (
    <section id="sobre" className="py-24 bg-secondary/30 relative">
      <div className="container mx-auto px-4">
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          {/* Left Content */}
          <div>
            <span className="text-primary font-medium text-sm uppercase tracking-wider">
              Sobre Nós
            </span>
            <h2 className="font-display text-3xl md:text-4xl lg:text-5xl font-bold mt-4 mb-6">
              Por que escolher a{" "}
              <span className="text-gradient">Mororo.tech?</span>
            </h2>
            <p className="text-muted-foreground text-lg mb-8 leading-relaxed">
              Com mais de 10 anos de experiência no mercado de segurança eletrônica, 
              a Mororo.tech se consolidou como referência em proteção patrimonial e 
              residencial. Nossa missão é proporcionar tranquilidade através de 
              soluções tecnológicas inovadoras.
            </p>

            {/* Features List */}
            <div className="grid sm:grid-cols-2 gap-4 mb-8">
              {features.map((feature, index) => (
                <div key={index} className="flex items-center gap-3">
                  <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0">
                    <Check className="w-4 h-4 text-primary" />
                  </div>
                  <span className="text-foreground text-sm">{feature}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Right - Stats Cards */}
          <div className="grid grid-cols-2 gap-4">
            {[
              {
                icon: Award,
                value: "10+",
                label: "Anos no Mercado",
                description: "Experiência comprovada",
              },
              {
                icon: Users,
                value: "500+",
                label: "Clientes Ativos",
                description: "Satisfação garantida",
              },
              {
                icon: Clock,
                value: "24/7",
                label: "Monitoramento",
                description: "Proteção contínua",
              },
              {
                icon: Check,
                value: "99.9%",
                label: "Disponibilidade",
                description: "Sistema confiável",
              },
            ].map((stat, index) => (
              <div
                key={index}
                className="p-6 rounded-2xl bg-card border border-border hover:border-primary/30 transition-all duration-300 group"
              >
                <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mb-4 group-hover:bg-primary/20 transition-colors">
                  <stat.icon className="w-6 h-6 text-primary" />
                </div>
                <div className="font-display text-3xl font-bold text-foreground mb-1">
                  {stat.value}
                </div>
                <div className="text-foreground font-medium">{stat.label}</div>
                <div className="text-sm text-muted-foreground mt-1">
                  {stat.description}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};

export default AboutSection;
