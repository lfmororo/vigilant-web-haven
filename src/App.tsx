import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { HelmetProvider } from "react-helmet-async";
import { AuthProvider } from "@/hooks/useAuth";
import AuthGuard from "@/components/auth/AuthGuard";
import Index from "./pages/Index";
import Auth from "./pages/Auth";

import AdminDashboard from "./pages/admin/AdminDashboard";
import UsersManagement from "./pages/admin/UsersManagement";
import ClientsManagement from "./pages/admin/ClientsManagement";
import EquipmentInventory from "./pages/admin/EquipmentInventory";
import EquipmentDetail from "./pages/admin/EquipmentDetail";
import AdminHelpdeskDashboard from "./pages/admin/AdminHelpdeskDashboard";
import AdminTicketsManagement from "./pages/admin/AdminTicketsManagement";
import AdminTicketDetail from "./pages/admin/AdminTicketDetail";
import AdminServiceOrders from "./pages/admin/AdminServiceOrders";
import AdminServiceOrderDetail from "./pages/admin/AdminServiceOrderDetail";
import SystemSettings from "./pages/admin/SystemSettings";
import TicketReports from "./pages/admin/TicketReports";
import ChecklistManagement from "./pages/admin/ChecklistManagement";
import KnowledgeBase from "./pages/admin/KnowledgeBase";
import WhatsAppNotificationsLog from "./pages/admin/WhatsAppNotificationsLog";
import QuoteSenderProfiles from "./pages/admin/QuoteSenderProfiles";
import CreateQuote from "./pages/admin/CreateQuote";
import QuoteDetail from "./pages/admin/QuoteDetail";
import MikrotikMonitor from "./pages/admin/MikrotikMonitor";
import GdmsTutorial from "./pages/admin/GdmsTutorial";
import DvrMonitor from "./pages/admin/DvrMonitor";
import ServerMonitor from "./pages/admin/ServerMonitor";
import HelpdeskDashboard from "./pages/helpdesk/HelpdeskDashboard";
import ClientTicketsList from "./pages/helpdesk/ClientTicketsList";
import NewTicket from "./pages/helpdesk/NewTicket";
import ClientTicketDetail from "./pages/helpdesk/ClientTicketDetail";
import ClientServiceOrders from "./pages/helpdesk/ClientServiceOrders";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <HelmetProvider>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AuthProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
            <Routes>
              <Route path="/" element={<Index />} />
              <Route path="/auth" element={<Auth />} />
              
              <Route path="/helpdesk" element={<AuthGuard><HelpdeskDashboard /></AuthGuard>} />
              <Route path="/helpdesk/tickets" element={<AuthGuard><ClientTicketsList /></AuthGuard>} />
              <Route path="/helpdesk/tickets/new" element={<AuthGuard><NewTicket /></AuthGuard>} />
              <Route path="/helpdesk/tickets/:id" element={<AuthGuard><ClientTicketDetail /></AuthGuard>} />
              <Route path="/helpdesk/orders" element={<AuthGuard><ClientServiceOrders /></AuthGuard>} />
              <Route path="/admin" element={<AuthGuard requireAdminOrTechnician><AdminDashboard /></AuthGuard>} />
              <Route path="/admin/users" element={<AuthGuard requireAdmin><UsersManagement /></AuthGuard>} />
              <Route path="/admin/clients" element={<AuthGuard requireAdmin><ClientsManagement /></AuthGuard>} />
              <Route path="/admin/inventory" element={<AuthGuard requireAdmin><EquipmentInventory /></AuthGuard>} />
              <Route path="/admin/inventory/:id" element={<AuthGuard requireAdmin><EquipmentDetail /></AuthGuard>} />
              <Route path="/admin/mikrotik" element={<AuthGuard requireAdmin><MikrotikMonitor /></AuthGuard>} />
              <Route path="/admin/dvr" element={<AuthGuard requireAdmin><DvrMonitor /></AuthGuard>} />
              <Route path="/admin/servers" element={<AuthGuard requireAdmin><ServerMonitor /></AuthGuard>} />
              <Route path="/admin/helpdesk" element={<AuthGuard requireAdminOrTechnician><AdminHelpdeskDashboard /></AuthGuard>} />
              <Route path="/admin/tickets" element={<AuthGuard requireAdminOrTechnician><AdminTicketsManagement /></AuthGuard>} />
              <Route path="/admin/tickets/:id" element={<AuthGuard requireAdminOrTechnician><AdminTicketDetail /></AuthGuard>} />
              <Route path="/admin/service-orders" element={<AuthGuard requireAdminOrTechnician><AdminServiceOrders /></AuthGuard>} />
              <Route path="/admin/service-orders/:id" element={<AuthGuard requireAdminOrTechnician><AdminServiceOrderDetail /></AuthGuard>} />
              <Route path="/admin/reports" element={<AuthGuard requireAdminOrTechnician><TicketReports /></AuthGuard>} />
              <Route path="/admin/checklists" element={<AuthGuard requireAdmin><ChecklistManagement /></AuthGuard>} />
              <Route path="/admin/knowledge-base" element={<AuthGuard requireAdmin><KnowledgeBase /></AuthGuard>} />
              <Route path="/admin/whatsapp-logs" element={<AuthGuard requireAdmin><WhatsAppNotificationsLog /></AuthGuard>} />
              <Route path="/admin/quotes" element={<AuthGuard requireAdmin><QuoteSenderProfiles /></AuthGuard>} />
              <Route path="/admin/quotes/new" element={<AuthGuard requireAdmin><CreateQuote /></AuthGuard>} />
              <Route path="/admin/quotes/:id" element={<AuthGuard requireAdmin><QuoteDetail /></AuthGuard>} />
              <Route path="/admin/quotes/:id/edit" element={<AuthGuard requireAdmin><CreateQuote /></AuthGuard>} />
              <Route path="/admin/settings" element={<AuthGuard requireAdmin><SystemSettings /></AuthGuard>} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </BrowserRouter>
        </AuthProvider>
      </TooltipProvider>
    </QueryClientProvider>
  </HelmetProvider>
);

export default App;
