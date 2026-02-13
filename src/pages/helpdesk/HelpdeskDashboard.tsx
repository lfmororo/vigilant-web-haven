import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import HelpdeskLayout from "@/components/helpdesk/HelpdeskLayout";
import TicketStatusBadge from "@/components/helpdesk/TicketStatusBadge";
import PriorityBadge from "@/components/helpdesk/PriorityBadge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { TicketCheck, Clock, CheckCircle, Plus, Loader2 } from "lucide-react";

const HelpdeskDashboard = () => {
  const { user } = useAuth();
  const [tickets, setTickets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("tickets")
      .select("*, equipment_type:equipment_types(name)")
      .eq("client_id", user.id)
      .order("created_at", { ascending: false })
      .limit(10)
      .then(({ data }) => { setTickets(data || []); setLoading(false); });
  }, [user]);

  const counts = {
    open: tickets.filter((t) => t.status === "open").length,
    in_progress: tickets.filter((t) => ["in_progress", "waiting_client"].includes(t.status)).length,
    resolved: tickets.filter((t) => ["resolved", "closed"].includes(t.status)).length,
  };

  return (
    <HelpdeskLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-display font-bold">Central de Suporte</h1>
            <p className="text-muted-foreground">Acompanhe seus chamados e ordens de serviço</p>
          </div>
          <Link to="/helpdesk/tickets/new">
            <Button><Plus className="w-4 h-4 mr-2" />Novo Chamado</Button>
          </Link>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card><CardHeader className="flex flex-row items-center justify-between pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Abertos</CardTitle><TicketCheck className="w-5 h-5 text-blue-400" /></CardHeader><CardContent><p className="text-3xl font-bold">{counts.open}</p></CardContent></Card>
          <Card><CardHeader className="flex flex-row items-center justify-between pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Em Andamento</CardTitle><Clock className="w-5 h-5 text-yellow-400" /></CardHeader><CardContent><p className="text-3xl font-bold">{counts.in_progress}</p></CardContent></Card>
          <Card><CardHeader className="flex flex-row items-center justify-between pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Resolvidos</CardTitle><CheckCircle className="w-5 h-5 text-green-400" /></CardHeader><CardContent><p className="text-3xl font-bold">{counts.resolved}</p></CardContent></Card>
        </div>

        <Card>
          <CardHeader><CardTitle>Últimos Chamados</CardTitle></CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
            ) : tickets.length === 0 ? (
              <p className="text-muted-foreground text-center py-8">Nenhum chamado ainda. Abra seu primeiro chamado!</p>
            ) : (
              <div className="space-y-3">
                {tickets.map((t) => (
                  <Link key={t.id} to={`/helpdesk/tickets/${t.id}`}
                    className="flex items-center justify-between p-4 rounded-lg bg-muted/50 hover:bg-muted transition-colors">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground font-mono">#{t.ticket_number}</span>
                        <span className="font-medium">{t.title}</span>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        {t.equipment_type?.name && <span>{t.equipment_type.name}</span>}
                        <span>·</span>
                        <span>{new Date(t.created_at).toLocaleDateString("pt-BR")}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <PriorityBadge priority={t.priority} />
                      <TicketStatusBadge status={t.status} />
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </HelpdeskLayout>
  );
};

export default HelpdeskDashboard;
