import { useState } from "react";
import { Helmet } from "react-helmet-async";
import AdminLayout from "@/components/admin/AdminLayout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import NewProvisioningRequest from "@/components/admin/provisioning/NewProvisioningRequest";
import ProvisioningRequestsList from "@/components/admin/provisioning/ProvisioningRequestsList";
import ProvisioningTemplates from "@/components/admin/provisioning/ProvisioningTemplates";
import ProvisioningAgentCard from "@/components/admin/provisioning/ProvisioningAgentCard";

const UserProvisioning = () => {
  const [refreshToken, setRefreshToken] = useState(0);

  return (
    <AdminLayout>
      <Helmet>
        <title>Criação de Usuários | FM TechFlow</title>
        <meta name="description" content="Crie usuários corporativos no Active Directory e organize as pastas de cada setor." />
      </Helmet>
      <div className="space-y-6">
        <header>
          <h1 className="text-2xl font-bold text-foreground">Criação de usuários</h1>
          <p className="text-muted-foreground">
            Provisione contas, grupos e pastas das empresas atendidas.
          </p>
        </header>

        <Tabs defaultValue="requests" className="space-y-6">
          <TabsList className="w-full justify-start overflow-x-auto">
            <TabsTrigger value="requests">Novo e acompanhamento</TabsTrigger>
            <TabsTrigger value="templates">Modelos por setor</TabsTrigger>
            <TabsTrigger value="agent">Agente do servidor</TabsTrigger>
          </TabsList>
          <TabsContent value="requests" className="space-y-6">
            <NewProvisioningRequest onCreated={() => setRefreshToken((v) => v + 1)} />
            <ProvisioningRequestsList refreshToken={refreshToken} />
          </TabsContent>
          <TabsContent value="templates">
            <ProvisioningTemplates />
          </TabsContent>
          <TabsContent value="agent">
            <ProvisioningAgentCard />
          </TabsContent>
        </Tabs>
      </div>
    </AdminLayout>
  );
};

export default UserProvisioning;
