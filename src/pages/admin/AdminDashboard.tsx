import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import AdminLayout from "@/components/admin/AdminLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import TicketStatusBadge from "@/components/helpdesk/TicketStatusBadge";
import PriorityBadge from "@/components/helpdesk/PriorityBadge";
import { Users, Camera, Link2, Activity, TicketCheck, Clock, CheckCircle, AlertTriangle } from "lucide-react";

const AdminDashboard = () => {
  const { isAdmin, isTechnician, user } = useAuth();

  if (isTechnician) return <TechnicianDashboard userId={user?.id} />;
  return <AdminDashboardContent />;
};

const TechnicianDashboard = ({ userId }: { userId?: string }) => {
  const [tickets, setTickets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) return;
    supabase.from("tickets")
      .select("*, client:clients!tickets_client_id_fkey(full_name), equipment_type:equipment_types(name)")
      .eq("assigned_to", userId)
      .order("created_at", { ascending: false })
      .limit(10)
      .then(({ data }) => { setTickets(data || []); setLoading(false); });
  }, [userId]);

  const counts = {
    open: tickets.filter(t => t.status === "open").length,
    in_progress: tickets.filter(t => t.status === "in_progress").length,
    waiting: tickets.filter(t => t.status === "waiting_client").length,
    resolved: tickets.filter(t => t.status === "resolved" || t.status === "closed").length,
  };

  const statCards = [
    { title: "Abertos", value: counts.open, icon: AlertTriangle, color: "text-yellow-400", bgColor: "bg-yellow-400/10" },
    { title: "Em Andamento", value: counts.in_progress, icon: Clock, color: "text-blue-400", bgColor: "bg-blue-400/10" },
    { title: "Aguardando", value: counts.waiting, icon: TicketCheck, color: "text-orange-400", bgColor: "bg-orange-400/10" },
    { title: "Resolvidos", value: counts.resolved, icon: CheckCircle, color: "text-green-400", bgColor: "bg-green-400/10" },
  ];

  return (
    <AdminLayout>
      <div className="space-y-8">
        <div>
          <h1 className="text-3xl font-display font-bold">Meus Chamados</h1>
          <p className="text-muted-foreground">Visão geral dos chamados atribuídos a você</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {statCards.map((stat) => (
            <Card key={stat.title}>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">{stat.title}</CardTitle>
                <div className={`p-2 rounded-lg ${stat.bgColor}`}>
                  <stat.icon className={`w-5 h-5 ${stat.color}`} />
                </div>
              </CardHeader>
              <CardContent><div className="text-3xl font-bold">{stat.value}</div></CardContent>
            </Card>
          ))}
        </div>

        <Card>
          <CardHeader><CardTitle>Últimos Chamados</CardTitle></CardHeader>
          <CardContent>
            {loading ? (
              <p className="text-muted-foreground text-center py-4">Carregando...</p>
            ) : tickets.length === 0 ? (
              <p className="text-muted-foreground text-center py-4">Nenhum chamado atribuído</p>
            ) : (
              <div className="space-y-3">
                {tickets.slice(0, 5).map((t) => (
                  <Link key={t.id} to={`/admin/tickets/${t.id}`} className="flex items-center justify-between p-3 rounded-lg hover:bg-muted/50 transition-colors">
                    <div>
                      <span className="font-mono text-xs text-muted-foreground mr-2">#{t.ticket_number}</span>
                      <span className="font-medium">{t.title}</span>
                      <p className="text-xs text-muted-foreground mt-1">{t.client?.full_name}</p>
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

const AdminDashboardContent = () => {
  const [stats, setStats] = useState({
    totalUsers: 0,
    totalCameras: 0,
    activeCameras: 0,
    totalAssignments: 0,
  });

  useEffect(() => {
    fetchStats();
  }, []);

  const fetchStats = async () => {
    try {
      const [usersRes, camerasRes, assignmentsRes] = await Promise.all([
        supabase.from("profiles").select("id", { count: "exact", head: true }),
        supabase.from("cameras").select("id, is_active"),
        supabase.from("user_cameras").select("id", { count: "exact", head: true }),
      ]);

      const activeCameras = camerasRes.data?.filter((c) => c.is_active).length || 0;

      setStats({
        totalUsers: usersRes.count || 0,
        totalCameras: camerasRes.data?.length || 0,
        activeCameras,
        totalAssignments: assignmentsRes.count || 0,
      });
    } catch (error) {
      console.error("Error fetching stats:", error);
    }
  };

  const statCards = [
    { title: "Total de Usuários", value: stats.totalUsers, icon: Users, color: "text-blue-400", bgColor: "bg-blue-400/10" },
    { title: "Total de Câmeras", value: stats.totalCameras, icon: Camera, color: "text-green-400", bgColor: "bg-green-400/10" },
    { title: "Câmeras Ativas", value: stats.activeCameras, icon: Activity, color: "text-primary", bgColor: "bg-primary/10" },
    { title: "Atribuições", value: stats.totalAssignments, icon: Link2, color: "text-purple-400", bgColor: "bg-purple-400/10" },
  ];

  return (
    <AdminLayout>
      <div className="space-y-8">
        <div>
          <h1 className="text-3xl font-display font-bold">Dashboard</h1>
          <p className="text-muted-foreground">Visão geral do sistema de câmeras</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {statCards.map((stat) => (
            <Card key={stat.title}>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">{stat.title}</CardTitle>
                <div className={`p-2 rounded-lg ${stat.bgColor}`}>
                  <stat.icon className={`w-5 h-5 ${stat.color}`} />
                </div>
              </CardHeader>
              <CardContent><div className="text-3xl font-bold">{stat.value}</div></CardContent>
            </Card>
          ))}
        </div>
      </div>
    </AdminLayout>
  );
};

export default AdminDashboard;
