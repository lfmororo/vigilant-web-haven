import { useEffect, useState, useMemo, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import AdminLayout from "@/components/admin/AdminLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, TicketCheck, Clock, Pause, CheckCircle, FolderOpen, CalendarDays, TrendingUp, TrendingDown, Gauge } from "lucide-react";
import { format, isToday, isYesterday, differenceInHours, subDays, startOfDay } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line,
} from "recharts";

const STATUS_COLORS: Record<string, string> = {
  open: "hsl(199, 89%, 48%)",
  in_progress: "hsl(45, 93%, 47%)",
  waiting_client: "hsl(30, 90%, 50%)",
  resolved: "hsl(142, 71%, 45%)",
  closed: "hsl(215, 20%, 45%)",
};

const PRIORITY_COLORS: Record<string, string> = {
  low: "hsl(215, 20%, 55%)",
  medium: "hsl(199, 89%, 48%)",
  high: "hsl(30, 90%, 50%)",
  urgent: "hsl(0, 84%, 60%)",
};

const PRIORITY_LABELS: Record<string, string> = {
  low: "Baixa",
  medium: "Média",
  high: "Alta",
  urgent: "Urgente",
};

const RESOLUTION_COLORS = [
  "hsl(142, 71%, 45%)",
  "hsl(199, 89%, 48%)",
  "hsl(45, 93%, 47%)",
  "hsl(30, 90%, 50%)",
  "hsl(0, 84%, 60%)",
];

const AdminHelpdeskDashboard = () => {
  const [tickets, setTickets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(new Date());
  const ticketCountRef = useRef<number | null>(null);
  const audioRef = useRef<AudioContext | null>(null);

  const playNotificationSound = useCallback(() => {
    try {
      const ctx = audioRef.current || new (window.AudioContext || (window as any).webkitAudioContext)();
      audioRef.current = ctx;

      const now = ctx.currentTime;
      const duration = 2.5;

      // Main deep foghorn tone
      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      osc1.type = "sawtooth";
      osc1.frequency.setValueAtTime(80, now);
      osc1.frequency.linearRampToValueAtTime(75, now + duration);
      gain1.gain.setValueAtTime(0, now);
      gain1.gain.linearRampToValueAtTime(0.35, now + 0.3);
      gain1.gain.setValueAtTime(0.35, now + duration - 0.8);
      gain1.gain.linearRampToValueAtTime(0, now + duration);
      osc1.connect(gain1);
      gain1.connect(ctx.destination);
      osc1.start(now);
      osc1.stop(now + duration);

      // Sub-bass layer for depth
      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.type = "sine";
      osc2.frequency.setValueAtTime(55, now);
      osc2.frequency.linearRampToValueAtTime(50, now + duration);
      gain2.gain.setValueAtTime(0, now);
      gain2.gain.linearRampToValueAtTime(0.25, now + 0.3);
      gain2.gain.setValueAtTime(0.25, now + duration - 0.8);
      gain2.gain.linearRampToValueAtTime(0, now + duration);
      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      osc2.start(now);
      osc2.stop(now + duration);

      // Higher harmonic for realism
      const osc3 = ctx.createOscillator();
      const gain3 = ctx.createGain();
      osc3.type = "triangle";
      osc3.frequency.setValueAtTime(160, now);
      osc3.frequency.linearRampToValueAtTime(150, now + duration);
      gain3.gain.setValueAtTime(0, now);
      gain3.gain.linearRampToValueAtTime(0.1, now + 0.4);
      gain3.gain.setValueAtTime(0.1, now + duration - 0.8);
      gain3.gain.linearRampToValueAtTime(0, now + duration);
      osc3.connect(gain3);
      gain3.connect(ctx.destination);
      osc3.start(now);
      osc3.stop(now + duration);
    } catch (e) {
      console.warn("Could not play notification sound", e);
    }
  }, []);

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const fetchTickets = () => {
    supabase
      .from("tickets")
      .select("*, client:clients!tickets_client_id_fkey(full_name), technician:profiles!tickets_assigned_to_fkey(full_name), equipment_type:equipment_types(name)")
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        const newTickets = data || [];
        // Play sound if ticket count increased (new ticket arrived)
        if (ticketCountRef.current !== null && newTickets.length > ticketCountRef.current) {
          playNotificationSound();
        }
        ticketCountRef.current = newTickets.length;
        setTickets(newTickets);
        setLoading(false);
      });
  };

  useEffect(() => {
    fetchTickets();

    const channel = supabase
      .channel("dashboard-tickets")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "tickets" }, () => {
        fetchTickets();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  const metrics = useMemo(() => {
    const open = tickets.filter((t) => t.status === "open" && !t.assigned_to).length;
    const inProgress = tickets.filter((t) => t.status === "in_progress" || (t.status === "open" && t.assigned_to)).length;
    const waiting = tickets.filter((t) => t.status === "waiting_client").length;
    const resolved = tickets.filter((t) => t.status === "resolved" || t.status === "closed").length;
    const totalOpen = open + inProgress + waiting;

    const today = tickets.filter((t) => isToday(new Date(t.created_at))).length;
    const yesterday = tickets.filter((t) => isYesterday(new Date(t.created_at))).length;
    const todayVariation = yesterday > 0 ? Math.round(((today - yesterday) / yesterday) * 100) : today > 0 ? 100 : 0;

    const resolvedOrClosed = tickets.filter((t) => t.status === "resolved" || t.status === "closed");
    const onTimePercent = tickets.length > 0 ? Math.round((resolvedOrClosed.length / tickets.length) * 100) : 0;

    // Sparkline: last 7 days
    const sparkline: { day: string; count: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = subDays(new Date(), i);
      const dayStart = startOfDay(d);
      const nextDay = subDays(new Date(), i - 1);
      const nextDayStart = i > 0 ? startOfDay(nextDay) : new Date();
      const count = tickets.filter((t) => {
        const c = new Date(t.created_at);
        return c >= dayStart && c < (i === 0 ? new Date(Date.now() + 86400000) : startOfDay(subDays(new Date(), i - 1)));
      }).length;
      sparkline.push({ day: format(d, "dd/MM"), count });
    }

    // Priority chart
    const priorityData = ["low", "medium", "high", "urgent"].map((p) => ({
      name: PRIORITY_LABELS[p],
      value: tickets.filter((t) => t.priority === p).length,
      color: PRIORITY_COLORS[p],
    })).filter((d) => d.value > 0);

    // Equipment type chart
    const eqMap: Record<string, number> = {};
    tickets.forEach((t) => {
      const name = t.equipment_type?.name || "Sem tipo";
      eqMap[name] = (eqMap[name] || 0) + 1;
    });
    const equipmentData = Object.entries(eqMap)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 8);

    // Resolution time chart
    const resolutionBuckets = ["< 1 dia", "1-2 dias", "2-3 dias", "3-7 dias", "> 7 dias"];
    const resolutionCounts = [0, 0, 0, 0, 0];
    resolvedOrClosed.forEach((t) => {
      const hours = differenceInHours(new Date(t.updated_at), new Date(t.created_at));
      if (hours < 24) resolutionCounts[0]++;
      else if (hours < 48) resolutionCounts[1]++;
      else if (hours < 72) resolutionCounts[2]++;
      else if (hours < 168) resolutionCounts[3]++;
      else resolutionCounts[4]++;
    });
    const resolutionData = resolutionBuckets.map((name, i) => ({
      name,
      value: resolutionCounts[i],
      color: RESOLUTION_COLORS[i],
    })).filter((d) => d.value > 0);

    // Top 5 technicians
    const techMap: Record<string, { name: string; count: number }> = {};
    resolvedOrClosed.forEach((t) => {
      if (t.assigned_to && t.technician?.full_name) {
        if (!techMap[t.assigned_to]) techMap[t.assigned_to] = { name: t.technician.full_name, count: 0 };
        techMap[t.assigned_to].count++;
      }
    });
    const techData = Object.values(techMap).sort((a, b) => b.count - a.count).slice(0, 5);

    return { open, inProgress, waiting, resolved, totalOpen, today, yesterday, todayVariation, onTimePercent, sparkline, priorityData, equipmentData, resolutionData, techData };
  }, [tickets]);

  if (loading) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="space-y-6">
        <h1 className="text-2xl font-display font-bold">Dashboard de Suporte</h1>

        {/* Row 1: Status Counters */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          <StatusCard icon={<FolderOpen className="w-5 h-5" />} label="Novo" value={metrics.open} color="text-primary" />
          <StatusCard icon={<Clock className="w-5 h-5" />} label="Atribuído" value={metrics.inProgress} color="text-yellow-400" />
          <StatusCard icon={<Pause className="w-5 h-5" />} label="Pendente" value={metrics.waiting} color="text-orange-400" />
          <StatusCard icon={<CheckCircle className="w-5 h-5" />} label="Solucionado" value={metrics.resolved} color="text-green-400" />
          <StatusCard icon={<TicketCheck className="w-5 h-5" />} label="Total Aberto" value={metrics.totalOpen} color="text-primary" highlight />
        </div>

        {/* Row 2: Metrics */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {/* Clock */}
          <Card>
            <CardContent className="p-4 flex flex-col items-center justify-center gap-1">
              <span className="text-3xl font-bold font-mono tabular-nums text-foreground">
                {format(now, "HH:mm:ss")}
              </span>
              <span className="text-sm text-muted-foreground capitalize">
                {format(now, "EEEE", { locale: ptBR })}
              </span>
              <span className="text-xs text-muted-foreground">
                {format(now, "dd 'de' MMMM 'de' yyyy", { locale: ptBR })}
              </span>
            </CardContent>
          </Card>

          {/* Total with sparkline */}
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground mb-1">Total de Chamados</p>
              <p className="text-3xl font-bold text-foreground">{tickets.length}</p>
              <div className="h-10 mt-1">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={metrics.sparkline}>
                    <Line type="monotone" dataKey="count" stroke="hsl(199, 89%, 48%)" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          {/* Today */}
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground mb-1">Chamados Hoje</p>
              <div className="flex items-end gap-2">
                <p className="text-3xl font-bold text-foreground">{metrics.today}</p>
                {metrics.todayVariation !== 0 && (
                  <span className={`flex items-center text-sm font-medium ${metrics.todayVariation > 0 ? "text-destructive" : "text-green-400"}`}>
                    {metrics.todayVariation > 0 ? <TrendingUp className="w-4 h-4 mr-0.5" /> : <TrendingDown className="w-4 h-4 mr-0.5" />}
                    {metrics.todayVariation > 0 ? "+" : ""}{metrics.todayVariation}%
                  </span>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-1">Ontem: {metrics.yesterday}</p>
            </CardContent>
          </Card>

          {/* On-time gauge */}
          <Card>
            <CardContent className="p-4 flex flex-col items-center justify-center">
              <p className="text-xs text-muted-foreground mb-2">Chamados Resolvidos</p>
              <div className="relative w-20 h-20">
                <svg viewBox="0 0 36 36" className="w-20 h-20 -rotate-90">
                  <circle cx="18" cy="18" r="15.9" fill="none" stroke="hsl(222, 47%, 18%)" strokeWidth="3" />
                  <circle cx="18" cy="18" r="15.9" fill="none" stroke="hsl(142, 71%, 45%)" strokeWidth="3"
                    strokeDasharray={`${metrics.onTimePercent} ${100 - metrics.onTimePercent}`} strokeLinecap="round" />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-lg font-bold text-foreground">{metrics.onTimePercent}%</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Row 3: Charts */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Priority Pie */}
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Chamados por Prioridade</CardTitle></CardHeader>
            <CardContent>
              <div className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={metrics.priorityData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={70} innerRadius={40} paddingAngle={2}>
                      {metrics.priorityData.map((d, i) => <Cell key={i} fill={d.color} />)}
                    </Pie>
                    <Tooltip contentStyle={{ background: "hsl(222, 47%, 10%)", border: "1px solid hsl(222, 47%, 18%)", borderRadius: "8px", color: "hsl(210, 40%, 98%)" }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="flex flex-wrap gap-3 mt-2 justify-center">
                {metrics.priorityData.map((d) => (
                  <span key={d.name} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: d.color }} />
                    {d.name} ({d.value})
                  </span>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Equipment Type Bar */}
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Chamados por Tipo de Equipamento</CardTitle></CardHeader>
            <CardContent>
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={metrics.equipmentData} layout="vertical" margin={{ left: 10, right: 10 }}>
                    <XAxis type="number" tick={{ fill: "hsl(215, 20%, 65%)", fontSize: 11 }} axisLine={false} tickLine={false} />
                    <YAxis type="category" dataKey="name" tick={{ fill: "hsl(215, 20%, 65%)", fontSize: 11 }} width={100} axisLine={false} tickLine={false} />
                    <Tooltip contentStyle={{ background: "hsl(222, 47%, 10%)", border: "1px solid hsl(222, 47%, 18%)", borderRadius: "8px", color: "hsl(210, 40%, 98%)" }} />
                    <Bar dataKey="value" fill="hsl(199, 89%, 48%)" radius={[0, 4, 4, 0]} barSize={16} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          {/* Resolution Time Pie */}
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Tempo de Solução</CardTitle></CardHeader>
            <CardContent>
              <div className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={metrics.resolutionData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={70} innerRadius={40} paddingAngle={2}>
                      {metrics.resolutionData.map((d, i) => <Cell key={i} fill={d.color} />)}
                    </Pie>
                    <Tooltip contentStyle={{ background: "hsl(222, 47%, 10%)", border: "1px solid hsl(222, 47%, 18%)", borderRadius: "8px", color: "hsl(210, 40%, 98%)" }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="flex flex-wrap gap-3 mt-2 justify-center">
                {metrics.resolutionData.map((d) => (
                  <span key={d.name} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: d.color }} />
                    {d.name} ({d.value})
                  </span>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Top 5 Technicians */}
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Top 5 Técnicos</CardTitle></CardHeader>
            <CardContent>
              <div className="h-56">
                {metrics.techData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={metrics.techData} layout="vertical" margin={{ left: 10, right: 10 }}>
                      <XAxis type="number" tick={{ fill: "hsl(215, 20%, 65%)", fontSize: 11 }} axisLine={false} tickLine={false} />
                      <YAxis type="category" dataKey="name" tick={{ fill: "hsl(215, 20%, 65%)", fontSize: 11 }} width={120} axisLine={false} tickLine={false} />
                      <Tooltip contentStyle={{ background: "hsl(222, 47%, 10%)", border: "1px solid hsl(222, 47%, 18%)", borderRadius: "8px", color: "hsl(210, 40%, 98%)" }} />
                      <Bar dataKey="count" fill="hsl(142, 71%, 45%)" radius={[0, 4, 4, 0]} barSize={16} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
                    Nenhum chamado resolvido por técnico
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </AdminLayout>
  );
};

const StatusCard = ({ icon, label, value, color, highlight }: { icon: React.ReactNode; label: string; value: number; color: string; highlight?: boolean }) => (
  <Card className={highlight ? "border-primary/30" : ""}>
    <CardContent className="p-4 flex items-center gap-3">
      <div className={color}>{icon}</div>
      <div>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-2xl font-bold text-foreground">{value}</p>
      </div>
    </CardContent>
  </Card>
);

export default AdminHelpdeskDashboard;
