import { useState, useEffect, useMemo } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import AdminLayout from "@/components/admin/AdminLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import TicketStatusBadge from "@/components/helpdesk/TicketStatusBadge";
import PriorityBadge from "@/components/helpdesk/PriorityBadge";
import {
  Users, LayoutDashboard, TicketCheck, Clock, CheckCircle,
  AlertTriangle, BarChart3, Timer, TrendingUp, Inbox, Activity,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from "recharts";
import { format, subDays, differenceInHours, startOfDay } from "date-fns";
import { ptBR } from "date-fns/locale";

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

const STATUS_COLORS: Record<string, string> = {
  open: "#eab308",
  in_progress: "#3b82f6",
  waiting_client: "#f97316",
  resolved: "#22c55e",
  closed: "#6b7280",
};

const STATUS_LABELS: Record<string, string> = {
  open: "Aberto",
  in_progress: "Em Andamento",
  waiting_client: "Aguardando",
  resolved: "Resolvido",
  closed: "Encerrado",
};

const AdminDashboardContent = () => {
  const [tickets, setTickets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [generalStats, setGeneralStats] = useState({ totalUsers: 0 });

  useEffect(() => {
    const fetchAll = async () => {
      const [ticketsRes, usersRes] = await Promise.all([
        supabase.from("tickets")
          .select("id, ticket_number, title, status, priority, created_at, updated_at, client_id, assigned_to, client:clients!tickets_client_id_fkey(full_name)")
          .order("created_at", { ascending: false })
          .limit(1000),
        supabase.from("profiles").select("id", { count: "exact", head: true }),
      ]);

      setTickets(ticketsRes.data || []);
      setGeneralStats({
        totalUsers: usersRes.count || 0,
      });
      setLoading(false);
    };
    fetchAll();
  }, []);

  const metrics = useMemo(() => {
    const activeStatuses = ["open", "in_progress", "waiting_client"];
    const activeTickets = tickets.filter(t => activeStatuses.includes(t.status));
    const resolvedTickets = tickets.filter(t => t.status === "resolved" || t.status === "closed");

    // Average resolution time (hours)
    let avgResolutionHours = 0;
    if (resolvedTickets.length > 0) {
      const totalHours = resolvedTickets.reduce((sum, t) => {
        return sum + differenceInHours(new Date(t.updated_at), new Date(t.created_at));
      }, 0);
      avgResolutionHours = totalHours / resolvedTickets.length;
    }

    // Format avg time
    let avgTimeText = "—";
    if (resolvedTickets.length > 0) {
      if (avgResolutionHours < 1) {
        avgTimeText = "< 1h";
      } else if (avgResolutionHours < 24) {
        avgTimeText = `${Math.round(avgResolutionHours)}h`;
      } else {
        const days = Math.floor(avgResolutionHours / 24);
        const hours = Math.round(avgResolutionHours % 24);
        avgTimeText = hours > 0 ? `${days}d ${hours}h` : `${days}d`;
      }
    }

    return {
      total: tickets.length,
      active: activeTickets.length,
      open: tickets.filter(t => t.status === "open").length,
      inProgress: tickets.filter(t => t.status === "in_progress").length,
      waiting: tickets.filter(t => t.status === "waiting_client").length,
      resolved: resolvedTickets.length,
      avgTimeText,
    };
  }, [tickets]);

  const statusData = useMemo(() => {
    const counts: Record<string, number> = {};
    tickets.forEach(t => { counts[t.status] = (counts[t.status] || 0) + 1; });
    return Object.entries(counts).map(([status, value]) => ({
      name: STATUS_LABELS[status] || status,
      value,
      color: STATUS_COLORS[status] || "#94a3b8",
    }));
  }, [tickets]);

  const dailyData = useMemo(() => {
    const days = 30;
    const now = new Date();
    const data: { date: string; label: string; abertos: number; resolvidos: number }[] = [];

    for (let i = days - 1; i >= 0; i--) {
      const day = startOfDay(subDays(now, i));
      const dayStr = format(day, "yyyy-MM-dd");
      const label = format(day, "dd/MM", { locale: ptBR });

      const abertos = tickets.filter(t => format(new Date(t.created_at), "yyyy-MM-dd") === dayStr).length;
      const resolvidos = tickets.filter(t =>
        (t.status === "resolved" || t.status === "closed") &&
        format(new Date(t.updated_at), "yyyy-MM-dd") === dayStr
      ).length;

      data.push({ date: dayStr, label, abertos, resolvidos });
    }
    return data;
  }, [tickets]);

  const recentTickets = tickets.slice(0, 8);

  const ticketKpis = [
    { title: "Chamados Ativos", value: metrics.active, icon: Inbox, color: "text-blue-400", bgColor: "bg-blue-400/10" },
    { title: "Abertos", value: metrics.open, icon: AlertTriangle, color: "text-yellow-400", bgColor: "bg-yellow-400/10" },
    { title: "Em Andamento", value: metrics.inProgress, icon: Clock, color: "text-cyan-400", bgColor: "bg-cyan-400/10" },
    { title: "Tempo Médio Resolução", value: metrics.avgTimeText, icon: Timer, color: "text-emerald-400", bgColor: "bg-emerald-400/10" },
  ];

  const systemKpis = [
    { title: "Usuários", value: generalStats.totalUsers, icon: Users, color: "text-blue-400", bgColor: "bg-blue-400/10" },
  ];

  if (loading) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center py-20">
          <p className="text-muted-foreground">Carregando dashboard...</p>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="space-y-8">
        <div>
          <h1 className="text-3xl font-display font-bold">Dashboard</h1>
          <p className="text-muted-foreground">Visão geral do sistema</p>
        </div>

        <div>
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <TicketCheck className="w-5 h-5 text-primary" /> Chamados
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {ticketKpis.map((stat) => (
              <Card key={stat.title}>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">{stat.title}</CardTitle>
                  <div className={`p-2 rounded-lg ${stat.bgColor}`}>
                    <stat.icon className={`w-5 h-5 ${stat.color}`} />
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold">{stat.value}</div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <BarChart3 className="w-5 h-5 text-primary" /> Chamados por Dia (últimos 30 dias)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[280px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={dailyData} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis
                      dataKey="label"
                      tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                      interval={4}
                    />
                    <YAxis
                      allowDecimals={false}
                      tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                    />
                    <Tooltip
                      contentStyle={{
                        background: "hsl(var(--card))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: 8,
                        color: "hsl(var(--foreground))",
                      }}
                    />
                    <Bar dataKey="abertos" name="Abertos" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="resolvidos" name="Resolvidos" fill="#22c55e" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <TrendingUp className="w-5 h-5 text-primary" /> Por Status
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[280px]">
                {statusData.length === 0 ? (
                  <p className="text-muted-foreground text-center pt-20">Sem dados</p>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={statusData}
                        cx="50%"
                        cy="45%"
                        innerRadius={50}
                        outerRadius={80}
                        paddingAngle={3}
                        dataKey="value"
                        label={({ name, value }) => `${name}: ${value}`}
                        labelLine={false}
                        style={{ fontSize: 11 }}
                      >
                        {statusData.map((entry, index) => (
                          <Cell key={index} fill={entry.color} />
                        ))}
                      </Pie>
                      <Legend
                        verticalAlign="bottom"
                        iconType="circle"
                        wrapperStyle={{ fontSize: 12 }}
                      />
                      <Tooltip
                        contentStyle={{
                          background: "hsl(var(--card))",
                          border: "1px solid hsl(var(--border))",
                          borderRadius: 8,
                          color: "hsl(var(--foreground))",
                        }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>Últimos Chamados</span>
              <Link to="/admin/tickets" className="text-sm text-primary hover:underline font-normal">
                Ver todos →
              </Link>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {recentTickets.length === 0 ? (
              <p className="text-muted-foreground text-center py-4">Nenhum chamado registrado</p>
            ) : (
              <div className="space-y-2">
                {recentTickets.map((t) => (
                  <Link
                    key={t.id}
                    to={`/admin/tickets/${t.id}`}
                    className="flex items-center justify-between p-3 rounded-lg hover:bg-muted/50 transition-colors"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs text-muted-foreground">#{t.ticket_number}</span>
                        <span className="font-medium truncate">{t.title}</span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">{t.client?.full_name}</p>
                    </div>
                    <div className="flex items-center gap-2 ml-4 shrink-0">
                      <PriorityBadge priority={t.priority} />
                      <TicketStatusBadge status={t.status} />
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <div>
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Activity className="w-5 h-5 text-primary" /> Sistema
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {systemKpis.map((stat) => (
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
      </div>
    </AdminLayout>
  );
};

export default AdminDashboard;
