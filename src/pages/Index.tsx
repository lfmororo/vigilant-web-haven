import { Helmet } from "react-helmet-async";
import Navbar from "@/components/Navbar";
import HeroSection from "@/components/HeroSection";
import ServicesSection from "@/components/ServicesSection";
import AboutSection from "@/components/AboutSection";
import ContactSection from "@/components/ContactSection";
import Footer from "@/components/Footer";

const Index = () => {
  return (
    <>
      <Helmet>
        <title>Mororo.tech - Segurança Eletrônica Inteligente | Câmeras, Alarmes e Monitoramento</title>
        <meta
          name="description"
          content="Mororo.tech oferece soluções completas em segurança eletrônica: câmeras de vigilância, alarmes monitorados, controle de acesso e monitoramento 24h. Solicite seu orçamento grátis!"
        />
        <meta
          name="keywords"
          content="segurança eletrônica, câmeras de vigilância, CFTV, alarmes, controle de acesso, monitoramento 24h, segurança residencial, segurança empresarial"
        />
      </Helmet>

      <main className="min-h-screen bg-background">
        <Navbar />
        <HeroSection />
        <ServicesSection />
        <AboutSection />
        <ContactSection />
        <Footer />
      </main>
    </>
  );
};

export default Index;
