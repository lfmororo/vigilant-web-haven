import { Camera, Bell, Fingerprint, Wifi, Monitor, Headphones } from "lucide-react";

const services = [
  {
    icon: Camera,
    title: "Câmeras de Vigilância",
    description:
      "Sistemas de CFTV com resolução 4K, visão noturna e acesso remoto pelo celular.",
  },
  {
    icon: Bell,
    title: "Alarmes Monitorados",
    description:
      "Alarmes inteligentes com sensores de movimento, abertura e detecção de intrusão.",
  },
  {
    icon: Fingerprint,
    title: "Controle de Acesso",
    description:
      "Fechaduras biométricas, cartões de proximidade e reconhecimento facial.",
  },
  {
    icon: Wifi,
    title: "Automação Residencial",
    description:
      "Integração completa com sistemas smart home e controle por aplicativo.",
  },
  {
    icon: Monitor,
    title: "Central de Monitoramento",
    description:
      "Monitoramento 24h com equipe especializada e resposta rápida a emergências.",
  },
  {
    icon: Headphones,
    title: "Suporte Técnico",
    description:
      "Assistência técnica especializada com atendimento rápido e eficiente.",
  },
];

const ServicesSection = () => {
  return (
    <section id="servicos" className="py-24 bg-background relative">
      {/* Background subtle pattern */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(14,165,233,0.05),transparent_70%)]" />

      <div className="container mx-auto px-4 relative z-10">
        {/* Section Header */}
        <div className="text-center max-w-2xl mx-auto mb-16">
          <span className="text-primary font-medium text-sm uppercase tracking-wider">
            Nossos Serviços
          </span>
          <h2 className="font-display text-3xl md:text-4xl lg:text-5xl font-bold mt-4 mb-6">
            Soluções Completas em{" "}
            <span className="text-gradient">Segurança</span>
          </h2>
          <p className="text-muted-foreground text-lg">
            Oferecemos uma gama completa de serviços para garantir a proteção 
            total do seu patrimônio com a mais alta tecnologia do mercado.
          </p>
        </div>

        {/* Services Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {services.map((service, index) => (
            <div
              key={index}
              className="group p-8 rounded-2xl bg-gradient-card border border-border hover:border-primary/30 transition-all duration-300 hover:-translate-y-1"
            >
              <div className="w-14 h-14 rounded-xl bg-primary/10 flex items-center justify-center mb-6 group-hover:bg-primary/20 transition-colors">
                <service.icon className="w-7 h-7 text-primary" />
              </div>
              <h3 className="font-display text-xl font-semibold mb-3 text-foreground">
                {service.title}
              </h3>
              <p className="text-muted-foreground leading-relaxed">
                {service.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default ServicesSection;
