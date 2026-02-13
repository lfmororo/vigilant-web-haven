import { ReactNode, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Shield, TicketCheck, FileText, LayoutDashboard, LogOut, Menu, ArrowLeft } from "lucide-react";

interface HelpdeskLayoutProps {
  children: ReactNode;
}

const navItems = [
  { label: "Visão Geral", href: "/helpdesk", icon: LayoutDashboard },
  { label: "Meus Chamados", href: "/helpdesk/tickets", icon: TicketCheck },
  { label: "Ordens de Serviço", href: "/helpdesk/orders", icon: FileText },
];

const HelpdeskLayout = ({ children }: HelpdeskLayoutProps) => {
  const { signOut } = useAuth();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="min-h-screen bg-background flex">
      {sidebarOpen && (
        <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-40 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      <aside className={cn(
        "fixed lg:static inset-y-0 left-0 z-50 w-64 bg-card border-r border-border transform transition-transform duration-200 lg:translate-x-0",
        sidebarOpen ? "translate-x-0" : "-translate-x-full"
      )}>
        <div className="flex flex-col h-full">
          <div className="p-6 border-b border-border">
            <Link to="/helpdesk" className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <Shield className="w-6 h-6 text-primary" />
              </div>
              <div>
                <span className="font-display font-bold text-lg">SecureTech</span>
                <p className="text-xs text-muted-foreground">Central de Suporte</p>
              </div>
            </Link>
          </div>

          <nav className="flex-1 p-4 space-y-2">
            {navItems.map((item) => {
              const isActive = location.pathname === item.href;
              return (
                <Link key={item.href} to={item.href} onClick={() => setSidebarOpen(false)}
                  className={cn(
                    "flex items-center gap-3 px-4 py-3 rounded-lg transition-colors",
                    isActive ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground hover:bg-muted"
                  )}>
                  <item.icon className="w-5 h-5" />
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <div className="p-4 border-t border-border space-y-2">
            <Link to="/dashboard">
              <Button variant="ghost" className="w-full justify-start">
                <ArrowLeft className="w-5 h-5 mr-3" />
                Voltar às Câmeras
              </Button>
            </Link>
            <Button variant="ghost" className="w-full justify-start" onClick={() => signOut()}>
              <LogOut className="w-5 h-5 mr-3" />
              Sair
            </Button>
          </div>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        <header className="lg:hidden border-b border-border bg-card/50 backdrop-blur-xl sticky top-0 z-30">
          <div className="flex items-center justify-between p-4">
            <button onClick={() => setSidebarOpen(true)} className="p-2 hover:bg-muted rounded-lg">
              <Menu className="w-6 h-6" />
            </button>
            <div className="flex items-center gap-2">
              <Shield className="w-5 h-5 text-primary" />
              <span className="font-display font-bold">Suporte</span>
            </div>
            <div className="w-10" />
          </div>
        </header>
        <main className="flex-1 p-6 lg:p-8 overflow-auto">{children}</main>
      </div>
    </div>
  );
};

export default HelpdeskLayout;
