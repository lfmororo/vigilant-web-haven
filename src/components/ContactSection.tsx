import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Phone, Mail, MapPin, Send } from "lucide-react";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";

const ContactSection = () => {
  const { toast } = useToast();
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    phone: "",
    message: "",
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    toast({
      title: "Mensagem enviada!",
      description: "Entraremos em contato em breve.",
    });
    setFormData({ name: "", email: "", phone: "", message: "" });
  };

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  return (
    <section id="contato" className="py-24 bg-background relative">
      {/* Background Effect */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom,rgba(14,165,233,0.08),transparent_60%)]" />

      <div className="container mx-auto px-4 relative z-10">
        <div className="grid lg:grid-cols-2 gap-12">
          {/* Left - Contact Info */}
          <div>
            <span className="text-primary font-medium text-sm uppercase tracking-wider">
              Contato
            </span>
            <h2 className="font-display text-3xl md:text-4xl lg:text-5xl font-bold mt-4 mb-6">
              Fale com nossa{" "}
              <span className="text-gradient">Equipe</span>
            </h2>
            <p className="text-muted-foreground text-lg mb-10 leading-relaxed">
              Entre em contato conosco para solicitar um orçamento personalizado 
              ou esclarecer suas dúvidas. Nossa equipe está pronta para atendê-lo.
            </p>

            {/* Contact Cards */}
            <div className="space-y-4">
              {[
                {
                  icon: Phone,
                  title: "Telefone",
                  value: "(11) 99999-9999",
                  subtitle: "Seg-Sex, 8h às 18h",
                },
                {
                  icon: Mail,
                  title: "E-mail",
                  value: "contato@fmtechflow.com.br",
                  subtitle: "Resposta em até 24h",
                },
                {
                  icon: MapPin,
                  title: "Endereço",
                  value: "São Paulo, SP",
                  subtitle: "Atendemos toda a região",
                },
              ].map((contact, index) => (
                <div
                  key={index}
                  className="flex items-start gap-4 p-5 rounded-xl bg-card border border-border hover:border-primary/30 transition-colors"
                >
                  <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <contact.icon className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <div className="text-sm text-muted-foreground">
                      {contact.title}
                    </div>
                    <div className="font-semibold text-foreground">
                      {contact.value}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {contact.subtitle}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Right - Contact Form */}
          <div className="p-8 rounded-2xl bg-card border border-border">
            <h3 className="font-display text-2xl font-bold mb-6">
              Solicite um Orçamento
            </h3>
            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <Input
                  name="name"
                  placeholder="Seu nome completo"
                  value={formData.name}
                  onChange={handleChange}
                  required
                  className="bg-secondary border-border focus:border-primary"
                />
              </div>
              <div className="grid sm:grid-cols-2 gap-4">
                <Input
                  name="email"
                  type="email"
                  placeholder="Seu e-mail"
                  value={formData.email}
                  onChange={handleChange}
                  required
                  className="bg-secondary border-border focus:border-primary"
                />
                <Input
                  name="phone"
                  type="tel"
                  placeholder="Seu telefone"
                  value={formData.phone}
                  onChange={handleChange}
                  required
                  className="bg-secondary border-border focus:border-primary"
                />
              </div>
              <div>
                <Textarea
                  name="message"
                  placeholder="Como podemos ajudá-lo?"
                  value={formData.message}
                  onChange={handleChange}
                  required
                  rows={5}
                  className="bg-secondary border-border focus:border-primary resize-none"
                />
              </div>
              <Button type="submit" variant="hero" className="w-full">
                Enviar Mensagem
                <Send className="w-4 h-4" />
              </Button>
            </form>
          </div>
        </div>
      </div>
    </section>
  );
};

export default ContactSection;
