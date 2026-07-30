import { ReactNode, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  Users,
  LayoutDashboard,
  LogOut,
  Menu,
  X,
  TicketCheck,
  FileText,
  Headphones,
  UserCheck,
  Package,
  Settings,
  BarChart3,
  ClipboardList,
  BookOpen,
  MessageSquare,
  Receipt,
  Router,
  Video,
  Server,
  HardDriveDownload } from
"lucide-react";
import fmLogo from "@/assets/fm-techflow-logo.png";

interface AdminLayoutProps {
  children: ReactNode;
}

const allNavItems = [
{ label: "Dashboard", href: "/admin", icon: LayoutDashboard, roles: ["admin"] },
{ label: "Usuários", href: "/admin/users", icon: Users, roles: ["admin"] },
{ label: "Clientes", href: "/admin/clients", icon: UserCheck, roles: ["admin"] },

{ label: "Inventário", href: "/admin/inventory", icon: Package, roles: ["admin"] },
{ label: "Mikrotik", href: "/admin/mikrotik", icon: Router, roles: ["admin"] },
{ label: "DVR / CFTV", href: "/admin/dvr", icon: Video, roles: ["admin"] },
{ label: "Servidores", href: "/admin/servers", icon: Server, roles: ["admin"] },
{ label: "Dashboard Suporte", href: "/admin/helpdesk", icon: Headphones, roles: ["admin", "technician"] },
{ label: "Chamados", href: "/admin/tickets", icon: TicketCheck, roles: ["admin", "technician"] },
{ label: "Ordens de Serviço", href: "/admin/service-orders", icon: FileText, roles: ["admin", "technician"] },
{ label: "Relatórios", href: "/admin/reports", icon: BarChart3, roles: ["admin", "technician"] },
{ label: "Checklists", href: "/admin/checklists", icon: ClipboardList, roles: ["admin"] },
{ label: "Base de Conhecimento", href: "/admin/knowledge-base", icon: BookOpen, roles: ["admin", "technician"] },
{ label: "WhatsApp Log", href: "/admin/whatsapp-logs", icon: MessageSquare, roles: ["admin"] },
{ label: "Backup em Nuvem", href: "/admin/backup", icon: HardDriveDownload, roles: ["admin"] },
{ label: "Orçamentos", href: "/admin/quotes", icon: Receipt, roles: ["admin"] },
{ label: "Configurações", href: "/admin/settings", icon: Settings, roles: ["admin"] }];


const AdminLayout = ({ children }: AdminLayoutProps) => {
  const { signOut, role } = useAuth();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const navItems = allNavItems.filter((item) => item.roles.includes(role || ""));

  const handleSignOut = async () => {
    await signOut();
  };

  const panelLabel = role === "technician" ? "Painel Técnico" : "Painel Admin";

  return (
    <div className="min-h-screen bg-background flex">
      {/* Mobile Overlay */}
      {sidebarOpen &&
      <div
        className="fixed inset-0 bg-background/80 backdrop-blur-sm z-40 lg:hidden"
        onClick={() => setSidebarOpen(false)} />

      }

      {/* Sidebar */}
      <aside
        className={cn(
          "fixed lg:static inset-y-0 left-0 z-50 w-64 bg-card border-r border-border transform transition-transform duration-200 lg:translate-x-0",
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        )}>

        <div className="flex flex-col h-full">
          {/* Logo */}
          <div className="px-4 py-6 border-b border-border bg-card">
            <Link to="/admin" className="flex items-center justify-center w-full">
              <img
                alt="FM TechFlow"
                className="h-16 max-w-[200px] object-contain drop-shadow-sm"
                src="/lovable-uploads/f066724a-93ef-4c74-a639-4f8766fa1f97.png" />

            </Link>
          </div>

          {/* Navigation */}
          <nav className="flex-1 p-4 space-y-2">
            {navItems.map((item) => {
              const isActive = location.pathname === item.href;
              return (
                <Link
                  key={item.href}
                  to={item.href}
                  onClick={() => setSidebarOpen(false)}
                  className={cn(
                    "flex items-center gap-3 px-4 py-3 rounded-lg transition-colors",
                    isActive ?
                    "bg-primary text-primary-foreground" :
                    "text-muted-foreground hover:text-foreground hover:bg-muted"
                  )}>

                  <item.icon className="w-5 h-5" />
                  {item.label}
                </Link>);

            })}
          </nav>

          {/* Footer */}
          <div className="p-4 border-t border-border">
            <Button
              variant="ghost"
              className="w-full justify-start"
              onClick={handleSignOut}>

              <LogOut className="w-5 h-5 mr-3" />
              Sair
            </Button>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Mobile Header */}
        <header className="lg:hidden border-b border-border bg-card/50 backdrop-blur-xl sticky top-0 z-30">
          <div className="flex items-center justify-between p-4">
            <button
              onClick={() => setSidebarOpen(true)}
              className="p-2 hover:bg-muted rounded-lg">

              <Menu className="w-6 h-6" />
            </button>
            <img alt="FM TechFlow" className="h-8" src="/lovable-uploads/fe4b10ae-78e4-49c1-94e6-245df7a4f09a.png" />
            <div className="w-10" />
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 p-6 lg:p-8 overflow-auto">{children}</main>
      </div>
    </div>);

};

export default AdminLayout;