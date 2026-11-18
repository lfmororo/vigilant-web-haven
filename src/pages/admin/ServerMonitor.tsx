import { Suspense, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import AdminLayout from "@/components/admin/AdminLayout";
import { AgentVersionAlert } from "@/components/admin/AgentVersionAlert";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { lazyPage, PageLoader } from "@/components/PageLoader";
import {
  Server, Monitor, RefreshCw, Activity, Download, ServerCog, Boxes, LayoutDashboard, Terminal, Database, KeyRound, Laptop, Wifi
} from "lucide-react";

// Cada aba é baixada só quando aberta.
const MonitoringOverview = lazyPage(() => import("@/components/admin/servers/MonitoringOverview"));
const EndpointsTab = lazyPage(() => import("@/components/admin/servers/EndpointsTab"));
const NetworkProbesTab = lazyPage(() => import("@/components/admin/servers/NetworkProbesTab"));
const WindowsServersTab = lazyPage(() => import("@/components/admin/servers/WindowsServersTab"));
const LinuxServersTab = lazyPage(() => import("@/components/admin/servers/LinuxServersTab"));
const SqlServerTab = lazyPage(() => import("@/components/admin/servers/SqlServerTab"));
const VmwareTab = lazyPage(() => import("@/components/admin/servers/VmwareTab"));
const IloServersTab = lazyPage(() => import("@/components/admin/servers/IloServersTab"));
const ProxmoxTab = lazyPage(() => import("@/components/admin/servers/ProxmoxTab"));
const ADHealthTab = lazyPage(() => import("@/components/admin/servers/ADHealthTab"));
const DiagnosticsTab = lazyPage(() => import("@/components/admin/servers/DiagnosticsTab"));
const DiagnosticsHistoryTab = lazyPage(() => import("@/components/admin/servers/DiagnosticsHistoryTab"));
const MonitorAgentsTab = lazyPage(() => import("@/components/admin/servers/MonitorAgentsTab"));
const CollectorGuideTab = lazyPage(() => import("@/components/admin/servers/CollectorGuideTab"));

const ServerMonitor = () => {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("overview");

  const { data: clients } = useQuery({
    queryKey: ["clients"],
    queryFn: async () => {
      const { data } = await supabase.from("clients").select("id, full_name").order("full_name");
      return data || [];
    },
  });

  return (
    <AdminLayout>
      <AgentVersionAlert types={["windows", "linux", "sqlserver", "vmware", "ilo", "idrac", "proxmox"]} className="mb-4" />
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Monitoramento de Servidores</h1>
            <p className="text-muted-foreground mt-1">Máquinas com agente, servidores, virtualização, hardware e rede</p>
          </div>
          {/* Atualiza todas as listas abertas (cada aba também se atualiza sozinha). */}
          <Button variant="outline" size="sm" onClick={() => queryClient.invalidateQueries()}>
            <RefreshCw className="w-4 h-4 mr-1" /> Atualizar
          </Button>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="h-auto flex-wrap justify-start">
            <TabsTrigger value="overview"><LayoutDashboard className="w-4 h-4 mr-1" /> Visão geral</TabsTrigger>
            <TabsTrigger value="endpoints"><Laptop className="w-4 h-4 mr-1" /> Máquinas (agente)</TabsTrigger>
            <TabsTrigger value="network"><Wifi className="w-4 h-4 mr-1" /> Rede e sites</TabsTrigger>
            <TabsTrigger value="windows"><Server className="w-4 h-4 mr-1" /> Windows</TabsTrigger>
            <TabsTrigger value="linux"><Terminal className="w-4 h-4 mr-1" /> Linux</TabsTrigger>
            <TabsTrigger value="sqlserver"><Database className="w-4 h-4 mr-1" /> SQL Server</TabsTrigger>
            <TabsTrigger value="vmware"><Monitor className="w-4 h-4 mr-1" /> VMware</TabsTrigger>
            <TabsTrigger value="ilo"><ServerCog className="w-4 h-4 mr-1" /> iLO4 / iDRAC9</TabsTrigger>
            <TabsTrigger value="proxmox"><Boxes className="w-4 h-4 mr-1" /> Proxmox</TabsTrigger>
            <TabsTrigger value="ad-health"><Activity className="w-4 h-4 mr-1" /> Saúde do AD</TabsTrigger>
            <TabsTrigger value="diagnostics"><Activity className="w-4 h-4 mr-1" /> Diagnósticos</TabsTrigger>
            <TabsTrigger value="diagnostics-history"><Activity className="w-4 h-4 mr-1" /> Histórico Diagnósticos</TabsTrigger>

            <TabsTrigger value="agents"><KeyRound className="w-4 h-4 mr-1" /> Agentes & Alertas</TabsTrigger>
            <TabsTrigger value="guide"><Download className="w-4 h-4 mr-1" /> Guia Coletor</TabsTrigger>

          </TabsList>

          <Suspense fallback={<PageLoader />}>
            <TabsContent value="overview"><MonitoringOverview clients={clients} onOpenTab={setActiveTab} /></TabsContent>
            <TabsContent value="endpoints"><EndpointsTab clients={clients} /></TabsContent>
            <TabsContent value="network"><NetworkProbesTab clients={clients} /></TabsContent>
            <TabsContent value="windows"><WindowsServersTab clients={clients} /></TabsContent>
            <TabsContent value="linux"><LinuxServersTab clients={clients} /></TabsContent>
            <TabsContent value="sqlserver"><SqlServerTab clients={clients} /></TabsContent>
            <TabsContent value="vmware"><VmwareTab clients={clients} /></TabsContent>
            <TabsContent value="ilo"><IloServersTab clients={clients || []} /></TabsContent>
            <TabsContent value="proxmox"><ProxmoxTab clients={clients || []} /></TabsContent>
            <TabsContent value="ad-health"><ADHealthTab clients={clients || []} /></TabsContent>
            <TabsContent value="diagnostics"><DiagnosticsTab clients={clients || []} /></TabsContent>
            <TabsContent value="diagnostics-history"><DiagnosticsHistoryTab clients={clients || []} /></TabsContent>
            <TabsContent value="agents"><MonitorAgentsTab clients={clients} /></TabsContent>
            <TabsContent value="guide"><CollectorGuideTab /></TabsContent>
          </Suspense>
        </Tabs>
      </div>
    </AdminLayout>
  );
};

export default ServerMonitor;
