import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import HelpdeskLayout from "@/components/helpdesk/HelpdeskLayout";
import TicketStatusBadge from "@/components/helpdesk/TicketStatusBadge";
import PriorityBadge from "@/components/helpdesk/PriorityBadge";
import TicketChat from "@/components/helpdesk/TicketChat";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Loader2 } from "lucide-react";

const ClientTicketDetail = () => {
  const { id } = useParams<{ id: string }>();
  const [ticket, setTicket] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    supabase.from("tickets").select("*, equipment_type:equipment_types(name)")
      .eq("id", id).single()
      .then(({ data }) => { setTicket(data); setLoading(false); });
  }, [id]);

  if (loading) return <HelpdeskLayout><div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div></HelpdeskLayout>;
  if (!ticket) return <HelpdeskLayout><p className="text-center text-muted-foreground py-12">Chamado não encontrado</p></HelpdeskLayout>;

  return (
    <HelpdeskLayout>
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Link to="/helpdesk/tickets"><Button variant="ghost" size="icon"><ArrowLeft className="w-5 h-5" /></Button></Link>
          <div className="flex-1">
            <div className="flex items-center gap-3">
              <span className="text-sm text-muted-foreground font-mono">#{ticket.ticket_number}</span>
              <h1 className="text-xl font-display font-bold">{ticket.title}</h1>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <PriorityBadge priority={ticket.priority} />
            <TicketStatusBadge status={ticket.status} />
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <Card>
              <CardHeader><CardTitle>Mensagens</CardTitle></CardHeader>
              <CardContent className="p-0">
                <TicketChat ticketId={ticket.id} />
              </CardContent>
            </Card>
          </div>

          <div className="space-y-4">
            <Card>
              <CardHeader><CardTitle className="text-sm">Detalhes</CardTitle></CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div><span className="text-muted-foreground">Descrição:</span><p className="mt-1">{ticket.description}</p></div>
                {ticket.equipment_type?.name && <div><span className="text-muted-foreground">Equipamento:</span><p className="mt-1">{ticket.equipment_type.name}</p></div>}
                {ticket.equipment_info && <div><span className="text-muted-foreground">Info:</span><p className="mt-1">{ticket.equipment_info}</p></div>}
                <div><span className="text-muted-foreground">Criado em:</span><p className="mt-1">{new Date(ticket.created_at).toLocaleString("pt-BR")}</p></div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </HelpdeskLayout>
  );
};

export default ClientTicketDetail;
