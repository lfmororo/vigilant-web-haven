import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import AdminLayout from "@/components/admin/AdminLayout";
import TicketStatusBadge from "@/components/helpdesk/TicketStatusBadge";
import PriorityBadge from "@/components/helpdesk/PriorityBadge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Search, Loader2 } from "lucide-react";
import { formatTimeAgo } from "@/lib/formatTimeAgo";

const AdminTicketsManagement = () => {
  const { user, isAdmin } = useAuth();
  const [searchParams] = useSearchParams();
  const [tickets, setTickets] = useState<any[]>([]);
  const [creatorNames, setCreatorNames] = useState<Record<string, string>>({});
  const [lastMessages, setLastMessages] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState(searchParams.get("status") || "open");
  const [priorityFilter, setPriorityFilter] = useState("all");

  useEffect(() => {
    let query = supabase.from("tickets")
      .select("*, client:clients!tickets_client_id_fkey(full_name), assigned:profiles!tickets_assigned_to_fkey(full_name), equipment_type:equipment_types(name), sector:client_sectors!tickets_sector_id_fkey(name)")
      .order("created_at", { ascending: false });

    if (!isAdmin && user) {
      query = query.or(`assigned_to.eq.${user.id},created_by.eq.${user.id}`);
    }

    query.then(async ({ data }) => {
      const tks = data || [];
      setTickets(tks);
      if (tks.length > 0) {
        const ids = tks.map((t: any) => t.id);
        // Fetch last messages
        const { data: msgs } = await supabase
          .from("ticket_messages")
          .select("ticket_id, created_at")
          .in("ticket_id", ids)
          .order("created_at", { ascending: false });
        const map: Record<string, string> = {};
        (msgs || []).forEach((m: any) => {
          if (!map[m.ticket_id]) map[m.ticket_id] = m.created_at;
        });
        setLastMessages(map);

        // Fetch creator names from profiles
        const creatorIds = [...new Set(tks.map((t: any) => t.created_by).filter(Boolean))];
        if (creatorIds.length > 0) {
          const { data: creators } = await supabase
            .from("profiles")
            .select("id, full_name")
            .in("id", creatorIds);
          const cMap: Record<string, string> = {};
          (creators || []).forEach((c: any) => { cMap[c.id] = c.full_name; });
          setCreatorNames(cMap);
        }
      }
      setLoading(false);
    });
  }, [isAdmin, user]);

  const filtered = tickets.filter((t) => {
    const matchSearch = !search || t.title.toLowerCase().includes(search.toLowerCase()) || String(t.ticket_number).includes(search) || t.client?.full_name?.toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === "all" || t.status === statusFilter;
    const matchPriority = priorityFilter === "all" || t.priority === priorityFilter;
    return matchSearch && matchStatus && matchPriority;
  });

  return (
    <AdminLayout>
      <div className="space-y-6">
        <h1 className="text-2xl font-display font-bold">
          {isAdmin ? "Gestão de Chamados" : "Meus Chamados"}
        </h1>

        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input placeholder="Buscar por título, número ou cliente..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[160px]"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos Status</SelectItem>
              <SelectItem value="open">Aberto</SelectItem>
              <SelectItem value="in_progress">Em Andamento</SelectItem>
              <SelectItem value="waiting_client">Aguardando</SelectItem>
              <SelectItem value="resolved">Resolvido</SelectItem>
              <SelectItem value="closed">Fechado</SelectItem>
            </SelectContent>
          </Select>
          <Select value={priorityFilter} onValueChange={setPriorityFilter}>
            <SelectTrigger className="w-[160px]"><SelectValue placeholder="Prioridade" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas</SelectItem>
              <SelectItem value="low">Baixa</SelectItem>
              <SelectItem value="medium">Média</SelectItem>
              <SelectItem value="high">Alta</SelectItem>
              <SelectItem value="urgent">Urgente</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <Card>
          <CardContent className="p-0">
            {loading ? (
              <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
            ) : (
              <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                     <TableHead>#</TableHead>
                     <TableHead>Título</TableHead>
                     <TableHead>Cliente</TableHead>
                     <TableHead>Setor</TableHead>
                     <TableHead>Criador</TableHead>
                     <TableHead>Equipamento</TableHead>
                     <TableHead>Técnico</TableHead>
                     <TableHead>Prioridade</TableHead>
                     <TableHead>Status</TableHead>
                     <TableHead>Tempo Aberto</TableHead>
                     <TableHead>Sem Interação</TableHead>
                     <TableHead>Data</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.length === 0 ? (
                     <TableRow><TableCell colSpan={12} className="text-center text-muted-foreground py-8">Nenhum chamado encontrado</TableCell></TableRow>
                   ) : filtered.map((t) => (
                     <TableRow key={t.id} className="cursor-pointer hover:bg-muted/50">
                       <TableCell><Link to={`/admin/tickets/${t.id}`} className="font-mono text-xs">{t.ticket_number}</Link></TableCell>
                       <TableCell><Link to={`/admin/tickets/${t.id}`} className="font-medium hover:underline">{t.title}</Link></TableCell>
                       <TableCell className="text-muted-foreground">{t.client?.full_name || "-"}</TableCell>
                       <TableCell className="text-muted-foreground">{t.sector?.name || "-"}</TableCell>
                       <TableCell className="text-muted-foreground">{creatorNames[t.created_by] || "-"}</TableCell>
                       <TableCell className="text-muted-foreground">{t.equipment_type?.name || "-"}</TableCell>
                       <TableCell className="text-muted-foreground">{t.assigned?.full_name || "Não atribuído"}</TableCell>
                       <TableCell><PriorityBadge priority={t.priority} /></TableCell>
                       <TableCell><TicketStatusBadge status={t.status} /></TableCell>
                       <TableCell className="text-muted-foreground text-xs">{formatTimeAgo(t.created_at)}</TableCell>
                       <TableCell className="text-muted-foreground text-xs">{formatTimeAgo(lastMessages[t.id] || t.created_at)}</TableCell>
                       <TableCell className="text-muted-foreground">{new Date(t.created_at).toLocaleDateString("pt-BR")}</TableCell>
                     </TableRow>
                  ))}
                </TableBody>
              </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
};

export default AdminTicketsManagement;
