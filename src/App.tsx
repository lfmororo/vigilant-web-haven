import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { HelmetProvider } from "react-helmet-async";
import { AuthProvider } from "@/hooks/useAuth";
import AuthGuard from "@/components/auth/AuthGuard";
import { Suspense } from "react";
import { lazyPage, PageLoader } from "@/components/PageLoader";
const Index = lazyPage(() => import("./pages/Index"));
import Auth from "./pages/Auth";

const AdminDashboard = lazyPage(() => import("./pages/admin/AdminDashboard"));
const UsersManagement = lazyPage(() => import("./pages/admin/UsersManagement"));
const ClientsManagement = lazyPage(() => import("./pages/admin/ClientsManagement"));
const EquipmentInventory = lazyPage(() => import("./pages/admin/EquipmentInventory"));
const EquipmentDetail = lazyPage(() => import("./pages/admin/EquipmentDetail"));
const AdminHelpdeskDashboard = lazyPage(() => import("./pages/admin/AdminHelpdeskDashboard"));
const AdminTicketsManagement = lazyPage(() => import("./pages/admin/AdminTicketsManagement"));
const AdminTicketDetail = lazyPage(() => import("./pages/admin/AdminTicketDetail"));
const AdminServiceOrders = lazyPage(() => import("./pages/admin/AdminServiceOrders"));
const AdminServiceOrderDetail = lazyPage(() => import("./pages/admin/AdminServiceOrderDetail"));
const SystemSettings = lazyPage(() => import("./pages/admin/SystemSettings"));
const TicketReports = lazyPage(() => import("./pages/admin/TicketReports"));
const ChecklistManagement = lazyPage(() => import("./pages/admin/ChecklistManagement"));
const KnowledgeBase = lazyPage(() => import("./pages/admin/KnowledgeBase"));
const WhatsAppNotificationsLog = lazyPage(() => import("./pages/admin/WhatsAppNotificationsLog"));
const QuoteSenderProfiles = lazyPage(() => import("./pages/admin/QuoteSenderProfiles"));
const CreateQuote = lazyPage(() => import("./pages/admin/CreateQuote"));
const QuoteDetail = lazyPage(() => import("./pages/admin/QuoteDetail"));
const MikrotikMonitor = lazyPage(() => import("./pages/admin/MikrotikMonitor"));
const GdmsTutorial = lazyPage(() => import("./pages/admin/GdmsTutorial"));
const ServerMonitor = lazyPage(() => import("./pages/admin/ServerMonitor"));
const AdminBackup = lazyPage(() => import("./pages/admin/AdminBackup"));
const UserProvisioning = lazyPage(() => import("./pages/admin/UserProvisioning"));
const HelpdeskDashboard = lazyPage(() => import("./pages/helpdesk/HelpdeskDashboard"));
const ClientTicketsList = lazyPage(() => import("./pages/helpdesk/ClientTicketsList"));
const NewTicket = lazyPage(() => import("./pages/helpdesk/NewTicket"));
const ClientTicketDetail = lazyPage(() => import("./pages/helpdesk/ClientTicketDetail"));
const ClientServiceOrders = lazyPage(() => import("./pages/helpdesk/ClientServiceOrders"));
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient({
  defaultOptions: {
    // Evita rebuscar tudo a cada troca de aba do navegador; telas que precisam de dado fresco usam refetchInterval.
    queries: { staleTime: 30_000, refetchOnWindowFocus: false },
  },
});

const App = () => (
  <HelmetProvider>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AuthProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
            <Suspense fallback={<PageLoader />}>
            <Routes>
              <Route path="/" element={<Index />} />
              <Route path="/auth" element={<Auth />} />
              
              <Route path="/helpdesk" element={<AuthGuard><HelpdeskDashboard /></AuthGuard>} />
              <Route path="/helpdesk/tickets" element={<AuthGuard><ClientTicketsList /></AuthGuard>} />
              <Route path="/helpdesk/tickets/new" element={<AuthGuard><NewTicket /></AuthGuard>} />
              <Route path="/helpdesk/tickets/:id" element={<AuthGuard><ClientTicketDetail /></AuthGuard>} />
              <Route path="/helpdesk/orders" element={<AuthGuard><ClientServiceOrders /></AuthGuard>} />
              <Route path="/admin" element={<AuthGuard requireAdmin><AdminDashboard /></AuthGuard>} />
              <Route path="/admin/users" element={<AuthGuard requireAdmin><UsersManagement /></AuthGuard>} />
              <Route path="/admin/provisioning" element={<AuthGuard requireAdmin><UserProvisioning /></AuthGuard>} />
              <Route path="/admin/clients" element={<AuthGuard requireAdmin><ClientsManagement /></AuthGuard>} />
              <Route path="/admin/inventory" element={<AuthGuard requireAdmin><EquipmentInventory /></AuthGuard>} />
              <Route path="/admin/inventory/:id" element={<AuthGuard requireAdmin><EquipmentDetail /></AuthGuard>} />
              <Route path="/admin/mikrotik" element={<AuthGuard requireAdmin><MikrotikMonitor /></AuthGuard>} />
              <Route path="/admin/gdms-tutorial" element={<AuthGuard requireAdmin><GdmsTutorial /></AuthGuard>} />
              <Route path="/admin/servers" element={<AuthGuard requireAdmin><ServerMonitor /></AuthGuard>} />
              <Route path="/admin/helpdesk" element={<AuthGuard requireAdminOrTechnician><AdminHelpdeskDashboard /></AuthGuard>} />
              <Route path="/admin/tickets" element={<AuthGuard requireAdminOrTechnician><AdminTicketsManagement /></AuthGuard>} />
              <Route path="/admin/tickets/:id" element={<AuthGuard requireAdminOrTechnician><AdminTicketDetail /></AuthGuard>} />
              <Route path="/admin/service-orders" element={<AuthGuard requireAdminOrTechnician><AdminServiceOrders /></AuthGuard>} />
              <Route path="/admin/service-orders/:id" element={<AuthGuard requireAdminOrTechnician><AdminServiceOrderDetail /></AuthGuard>} />
              <Route path="/admin/reports" element={<AuthGuard requireAdminOrTechnician><TicketReports /></AuthGuard>} />
              <Route path="/admin/checklists" element={<AuthGuard requireAdmin><ChecklistManagement /></AuthGuard>} />
              <Route path="/admin/knowledge-base" element={<AuthGuard requireAdminOrTechnician><KnowledgeBase /></AuthGuard>} />
              <Route path="/admin/whatsapp-logs" element={<AuthGuard requireAdmin><WhatsAppNotificationsLog /></AuthGuard>} />
              <Route path="/admin/quotes" element={<AuthGuard requireAdmin><QuoteSenderProfiles /></AuthGuard>} />
              <Route path="/admin/quotes/new" element={<AuthGuard requireAdmin><CreateQuote /></AuthGuard>} />
              <Route path="/admin/quotes/:id" element={<AuthGuard requireAdmin><QuoteDetail /></AuthGuard>} />
              <Route path="/admin/quotes/:id/edit" element={<AuthGuard requireAdmin><CreateQuote /></AuthGuard>} />
              <Route path="/admin/backup" element={<AuthGuard requireAdmin><AdminBackup /></AuthGuard>} />
              <Route path="/admin/settings" element={<AuthGuard requireAdmin><SystemSettings /></AuthGuard>} />
              <Route path="*" element={<NotFound />} />
            </Routes>
            </Suspense>
          </BrowserRouter>
        </AuthProvider>
      </TooltipProvider>
    </QueryClientProvider>
  </HelmetProvider>
);

export default App;
