import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import HelpdeskLayout from "@/components/helpdesk/HelpdeskLayout";
import TicketStatusBadge from "@/components/helpdesk/TicketStatusBadge";
import PriorityBadge from "@/components/helpdesk/PriorityBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Search, Loader2 } from "lucide-react";
import { formatTimeAgo } from "@/lib/formatTimeAgo";

const ClientTicketsList = () => {
  const { user } = useAuth();
  const [tickets, setTickets] = useState<any[]>([]);
  const [lastMessages, setLastMessages] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("open");
  const [parentClientId, setParentClientId] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    supabase.from("profiles").select("parent_client_id").eq("id", user.id).maybeSingle()
      .then(({ data }) => {
        const clientId = data?.parent_client_id;
        setParentClientId(clientId);
        if (!clientId) { setLoading(false); return; }

        supabase.from("tickets").select("*, equipment_type:equipment_types(name)")
          .eq("client_id", clientId).order("created_at", { ascending: false })
          .then(async ({ data: ticketData }) => {
            const tks = ticketData || [];
            setTickets(tks);
            if (tks.length > 0) {
              const ids = tks.map((t: any) => t.id);
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
            }
            setLoading(false);
          });
      });
  }, [user]);

  const filtered = tickets.filter((t) => {
    const matchSearch = !search || t.title.toLowerCase().includes(search.toLowerCase()) || String(t.ticket_number).includes(search);
    const matchStatus = statusFilter === "all" || t.status === statusFilter;
    return matchSearch && matchStatus;
  });

  return (
    <HelpdeskLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-display font-bold">Meus Chamados</h1>
          {parentClientId && (
            <Link to="/helpdesk/tickets/new"><Button><Plus className="w-4 h-4 mr-2" />Novo Chamado</Button></Link>
          )}
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input placeholder="Buscar por título ou número..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="open">Aberto</SelectItem>
              <SelectItem value="in_progress">Em Andamento</SelectItem>
              <SelectItem value="waiting_client">Aguardando</SelectItem>
              <SelectItem value="resolved">Resolvido</SelectItem>
              <SelectItem value="closed">Fechado</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <Card>
          <CardContent className="p-0">
            {loading ? (
              <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
            ) : !parentClientId ? (
              <p className="text-center text-muted-foreground py-8">Seu usuário não está vinculado a nenhum cliente.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>#</TableHead>
                    <TableHead>Título</TableHead>
                    <TableHead>Equipamento</TableHead>
                    <TableHead>Prioridade</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Tempo Aberto</TableHead>
                    <TableHead>Sem Interação</TableHead>
                    <TableHead>Data</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.length === 0 ? (
                    <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">Nenhum chamado encontrado</TableCell></TableRow>
                  ) : filtered.map((t) => (
                    <TableRow key={t.id} className="cursor-pointer hover:bg-muted/50" onClick={() => window.location.href = `/helpdesk/tickets/${t.id}`}>
                      <TableCell className="font-mono text-xs">{t.ticket_number}</TableCell>
                      <TableCell className="font-medium">{t.title}</TableCell>
                      <TableCell className="text-muted-foreground">{t.equipment_type?.name || "-"}</TableCell>
                      <TableCell><PriorityBadge priority={t.priority} /></TableCell>
                      <TableCell><TicketStatusBadge status={t.status} /></TableCell>
                      <TableCell className="text-muted-foreground text-xs">{formatTimeAgo(t.created_at)}</TableCell>
                      <TableCell className="text-muted-foreground text-xs">{formatTimeAgo(lastMessages[t.id] || t.created_at)}</TableCell>
                      <TableCell className="text-muted-foreground">{new Date(t.created_at).toLocaleDateString("pt-BR")}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </HelpdeskLayout>
  );
};

export default ClientTicketsList;
