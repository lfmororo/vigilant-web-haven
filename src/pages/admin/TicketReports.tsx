import { useState, useMemo, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import AdminLayout from "@/components/admin/AdminLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import TicketStatusBadge from "@/components/helpdesk/TicketStatusBadge";
import PriorityBadge from "@/components/helpdesk/PriorityBadge";
import { format, differenceInHours } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CalendarIcon, Printer, RotateCcw, BarChart3, TicketCheck, CheckCircle, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import TicketReportPrint from "@/components/admin/TicketReportPrint";

const statusOptions = [
  { value: "all", label: "Todos" },
  { value: "open", label: "Aberto" },
  { value: "in_progress", label: "Em Andamento" },
  { value: "waiting_client", label: "Aguardando Cliente" },
  { value: "resolved", label: "Resolvido" },
  { value: "closed", label: "Fechado" },
];

const TicketReports = () => {
  const [clientId, setClientId] = useState<string>("all");
  const [status, setStatus] = useState<string>("all");
  const [startDate, setStartDate] = useState<Date | undefined>(undefined);
  const [endDate, setEndDate] = useState<Date | undefined>(undefined);
  const [showPrint, setShowPrint] = useState(false);

  // Fetch clients (profiles with client role)
  const { data: clients } = useQuery({
    queryKey: ["report-clients"],
    queryFn: async () => {
      const { data: roles } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("role", "client");
      if (!roles?.length) return [];
      const clientIds = roles.map((r) => r.user_id);
      const { data } = await supabase
        .from("profiles")
        .select("id, full_name")
        .in("id", clientIds)
        .order("full_name");
      return data || [];
    },
  });

  // Fetch tickets with filters
  const { data: tickets, isLoading } = useQuery({
    queryKey: ["report-tickets", clientId, status, startDate?.toISOString(), endDate?.toISOString()],
    queryFn: async () => {
      let query = supabase
        .from("tickets")
        .select(`
          id, ticket_number, title, status, priority, created_at, updated_at,
          client:profiles!tickets_client_id_fkey(full_name),
          technician:profiles!tickets_assigned_to_fkey(full_name),
          equipment_types(name)
        `)
        .order("created_at", { ascending: false });

      if (clientId !== "all") query = query.eq("client_id", clientId);
      if (status !== "all") query = query.eq("status", status as any);
      if (startDate) query = query.gte("created_at", startDate.toISOString());
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        query = query.lte("created_at", end.toISOString());
      }

      const { data } = await query;
      return data || [];
    },
  });

  const clearFilters = () => {
    setClientId("all");
    setStatus("all");
    setStartDate(undefined);
    setEndDate(undefined);
  };

  const metrics = useMemo(() => {
    if (!tickets) return { total: 0, open: 0, resolved: 0, avgHours: 0 };
    const open = tickets.filter((t) => t.status === "open" || t.status === "in_progress" || t.status === "waiting_client").length;
    const resolved = tickets.filter((t) => t.status === "resolved" || t.status === "closed");
    let avgHours = 0;
    if (resolved.length > 0) {
      const totalHours = resolved.reduce((sum, t) => {
        return sum + differenceInHours(new Date(t.updated_at), new Date(t.created_at));
      }, 0);
      avgHours = Math.round(totalHours / resolved.length);
    }
    return { total: tickets.length, open, resolved: resolved.length, avgHours };
  }, [tickets]);

  const formatAvgTime = (hours: number) => {
    if (hours < 24) return `${hours}h`;
    const days = Math.floor(hours / 24);
    const rem = hours % 24;
    return rem > 0 ? `${days}d ${rem}h` : `${days}d`;
  };

  const printFilters = useMemo(() => {
    const clientName = clientId !== "all" && clients
      ? clients.find((c) => c.id === clientId)?.full_name || "Todos"
      : "Todos";
    return { clientName, status, startDate, endDate };
  }, [clientId, status, startDate, endDate, clients]);

  if (showPrint && tickets) {
    return (
      <TicketReportPrint
        tickets={tickets as any}
        filters={printFilters}
        metrics={metrics}
        onClose={() => setShowPrint(false)}
      />
    );
  }

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Relatório de Chamados</h1>
            <p className="text-muted-foreground">Filtre por cliente, situação e período</p>
          </div>
          <Button onClick={() => setShowPrint(true)} variant="outline" className="gap-2" disabled={!tickets?.length}>
            <Printer className="w-4 h-4" /> Imprimir
          </Button>
        </div>



        {/* Filters */}
        <Card>
          <CardContent className="pt-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 items-end">
              {/* Client */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Cliente</label>
                <Select value={clientId} onValueChange={setClientId}>
                  <SelectTrigger><SelectValue placeholder="Todos" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    {clients?.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.full_name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Status */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Situação</label>
                <Select value={status} onValueChange={setStatus}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {statusOptions.map((s) => (
                      <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Start date */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Data Inicial</label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !startDate && "text-muted-foreground")}>
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {startDate ? format(startDate, "dd/MM/yyyy") : "Selecione"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar mode="single" selected={startDate} onSelect={setStartDate} locale={ptBR} initialFocus className="p-3 pointer-events-auto" />
                  </PopoverContent>
                </Popover>
              </div>

              {/* End date */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Data Final</label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !endDate && "text-muted-foreground")}>
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {endDate ? format(endDate, "dd/MM/yyyy") : "Selecione"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar mode="single" selected={endDate} onSelect={setEndDate} locale={ptBR} initialFocus className="p-3 pointer-events-auto" />
                  </PopoverContent>
                </Popover>
              </div>

              {/* Clear */}
              <Button variant="ghost" onClick={clearFilters} className="gap-2">
                <RotateCcw className="w-4 h-4" /> Limpar
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Metrics */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Total de Chamados</CardTitle>
              <BarChart3 className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent><div className="text-2xl font-bold">{metrics.total}</div></CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Em Aberto</CardTitle>
              <TicketCheck className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent><div className="text-2xl font-bold">{metrics.open}</div></CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Resolvidos/Fechados</CardTitle>
              <CheckCircle className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent><div className="text-2xl font-bold">{metrics.resolved}</div></CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Tempo Médio Resolução</CardTitle>
              <Clock className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent><div className="text-2xl font-bold">{formatAvgTime(metrics.avgHours)}</div></CardContent>
          </Card>
        </div>

        {/* Table */}
        <Card>
          <CardContent className="pt-6">
            {isLoading ? (
              <p className="text-center text-muted-foreground py-8">Carregando...</p>
            ) : !tickets?.length ? (
              <p className="text-center text-muted-foreground py-8">Nenhum chamado encontrado com os filtros selecionados.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>#</TableHead>
                    <TableHead>Título</TableHead>
                    <TableHead>Cliente</TableHead>
                    <TableHead>Equipamento</TableHead>
                    <TableHead>Técnico</TableHead>
                    <TableHead>Prioridade</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Abertura</TableHead>
                    <TableHead>Atualização</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {tickets.map((t) => (
                    <TableRow key={t.id}>
                      <TableCell className="font-mono">{t.ticket_number}</TableCell>
                      <TableCell className="max-w-[200px] truncate">{t.title}</TableCell>
                      <TableCell>{(t.client as any)?.full_name || "-"}</TableCell>
                      <TableCell>{(t.equipment_types as any)?.name || "-"}</TableCell>
                      <TableCell>{(t.technician as any)?.full_name || "-"}</TableCell>
                      <TableCell><PriorityBadge priority={t.priority} /></TableCell>
                      <TableCell><TicketStatusBadge status={t.status} /></TableCell>
                      <TableCell className="whitespace-nowrap">{format(new Date(t.created_at), "dd/MM/yy HH:mm")}</TableCell>
                      <TableCell className="whitespace-nowrap">{format(new Date(t.updated_at), "dd/MM/yy HH:mm")}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
};

export default TicketReports;
