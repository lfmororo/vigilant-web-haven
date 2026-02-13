import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import AdminLayout from "@/components/admin/AdminLayout";
import TicketStatusBadge from "@/components/helpdesk/TicketStatusBadge";
import PriorityBadge from "@/components/helpdesk/PriorityBadge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Link } from "react-router-dom";
import { TicketCheck, Clock, CheckCircle, AlertTriangle, Loader2 } from "lucide-react";

const AdminHelpdeskDashboard = () => {
  const [tickets, setTickets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.from("tickets").select("*, client:profiles!tickets_client_id_fkey(full_name), equipment_type:equipment_types(name)")
      .order("created_at", { ascending: false }).limit(20)
      .then(({ data }) => { setTickets(data || []); setLoading(false); });
  }, []);

  const counts = {
    total: tickets.length,
    open: tickets.filter((t) => t.status === "open").length,
    in_progress: tickets.filter((t) => t.status === "in_progress").length,
    urgent: tickets.filter((t) => t.priority === "urgent").length,
  };

  return (
    <AdminLayout>
      <div className="space-y-6">
        <h1 className="text-2xl font-display font-bold">Dashboard de Suporte</h1>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card><CardHeader className="flex flex-row items-center justify-between pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Total</CardTitle><TicketCheck className="w-5 h-5 text-primary" /></CardHeader><CardContent><p className="text-3xl font-bold">{counts.total}</p></CardContent></Card>
          <Card><CardHeader className="flex flex-row items-center justify-between pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Abertos</CardTitle><TicketCheck className="w-5 h-5 text-blue-400" /></CardHeader><CardContent><p className="text-3xl font-bold">{counts.open}</p></CardContent></Card>
          <Card><CardHeader className="flex flex-row items-center justify-between pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Em Andamento</CardTitle><Clock className="w-5 h-5 text-yellow-400" /></CardHeader><CardContent><p className="text-3xl font-bold">{counts.in_progress}</p></CardContent></Card>
          <Card><CardHeader className="flex flex-row items-center justify-between pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Urgentes</CardTitle><AlertTriangle className="w-5 h-5 text-destructive" /></CardHeader><CardContent><p className="text-3xl font-bold">{counts.urgent}</p></CardContent></Card>
        </div>

        <Card>
          <CardHeader><CardTitle>Tickets Recentes</CardTitle></CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
            ) : (
              <div className="space-y-3">
                {tickets.slice(0, 10).map((t) => (
                  <Link key={t.id} to={`/admin/tickets/${t.id}`}
                    className="flex items-center justify-between p-4 rounded-lg bg-muted/50 hover:bg-muted transition-colors">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground font-mono">#{t.ticket_number}</span>
                        <span className="font-medium">{t.title}</span>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span>{t.client?.full_name}</span>
                        <span>·</span>
                        <span>{t.equipment_type?.name || "Sem tipo"}</span>
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
    </AdminLayout>
  );
};

export default AdminHelpdeskDashboard;
