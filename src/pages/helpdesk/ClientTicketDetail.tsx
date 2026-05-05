import { useEffect, useState } from "react";
import { useParams, Link, useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import HelpdeskLayout from "@/components/helpdesk/HelpdeskLayout";
import TicketStatusBadge from "@/components/helpdesk/TicketStatusBadge";
import PriorityBadge from "@/components/helpdesk/PriorityBadge";
import TicketChat from "@/components/helpdesk/TicketChat";
import SignaturePad from "@/components/helpdesk/SignaturePad";
import TicketAttachments from "@/components/helpdesk/TicketAttachments";
import TicketPrint from "@/components/admin/TicketPrint";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, ChevronLeft, ChevronRight, Loader2, Printer, Monitor } from "lucide-react";

const ClientTicketDetail = () => {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [ticket, setTicket] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [showPrint, setShowPrint] = useState(false);
  const [requestingAccess, setRequestingAccess] = useState(false);
  const [adjacentTickets, setAdjacentTickets] = useState<{ prev: string | null; next: string | null }>({ prev: null, next: null });

  useEffect(() => {
    if (!id) return;
    supabase.from("tickets").select("*, equipment_type:equipment_types(name)")
      .eq("id", id).single()
      .then(({ data }) => { setTicket(data); setLoading(false); });
  }, [id]);

  // Fetch adjacent tickets for navigation
  useEffect(() => {
    if (!id || !user) return;
    supabase.from("profiles").select("parent_client_id").eq("id", user.id).maybeSingle()
      .then(({ data: profile }) => {
        if (!profile?.parent_client_id) return;
        supabase.from("tickets").select("id").eq("client_id", profile.parent_client_id)
          .order("created_at", { ascending: false })
          .then(({ data }) => {
            if (!data) return;
            const idx = data.findIndex((t: any) => t.id === id);
            setAdjacentTickets({
              prev: idx > 0 ? data[idx - 1].id : null,
              next: idx < data.length - 1 ? data[idx + 1].id : null,
            });
          });
      });
  }, [id, user]);

  if (loading) return <HelpdeskLayout><div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div></HelpdeskLayout>;
  if (!ticket) return <HelpdeskLayout><p className="text-center text-muted-foreground py-12">Chamado não encontrado</p></HelpdeskLayout>;

  if (showPrint) {
    return <TicketPrint ticketId={ticket.id} onClose={() => setShowPrint(false)} />;
  }

  return (
    <HelpdeskLayout>
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Link to="/helpdesk/tickets"><Button variant="ghost" size="icon"><ArrowLeft className="w-5 h-5" /></Button></Link>
          <Button variant="outline" size="icon" disabled={!adjacentTickets.prev} onClick={() => adjacentTickets.prev && navigate(`/helpdesk/tickets/${adjacentTickets.prev}`)} title="Chamado anterior"><ChevronLeft className="w-5 h-5" /></Button>
          <Button variant="outline" size="icon" disabled={!adjacentTickets.next} onClick={() => adjacentTickets.next && navigate(`/helpdesk/tickets/${adjacentTickets.next}`)} title="Próximo chamado"><ChevronRight className="w-5 h-5" /></Button>
          <div className="flex-1">
            <div className="flex items-center gap-3">
              <span className="text-sm text-muted-foreground font-mono">#{ticket.ticket_number}</span>
              <h1 className="text-xl font-display font-bold">{ticket.title}</h1>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" onClick={() => setShowPrint(true)} title="Exportar PDF"><Printer className="w-4 h-4" /></Button>
            <Button
              variant="outline"
              size="sm"
              disabled={requestingAccess}
              onClick={async () => {
                setRequestingAccess(true);
                try {
                  const { error } = await supabase.functions.invoke("request-remote-access", {
                    body: { ticket_id: id, sender_id: user?.id },
                  });
                  if (error) throw error;
                  toast({ title: "Solicitação enviada!", description: "Notificação de acesso remoto enviada." });
                } catch (err: any) {
                  toast({ variant: "destructive", title: "Erro", description: err.message || "Erro ao enviar solicitação" });
                }
                setRequestingAccess(false);
              }}
            >
              {requestingAccess ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Monitor className="w-4 h-4 mr-2" />}
              Acesso Remoto
            </Button>
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

            <TicketAttachments ticketId={ticket.id} />

            <Card>
              <CardHeader><CardTitle className="text-sm">Assinaturas</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <SignaturePad
                  label="Assinatura do Técnico"
                  value={ticket.technician_signature}
                  disabled
                />
                <SignaturePad
                  label="Assinatura do Cliente"
                  value={ticket.client_signature}
                  onChange={async (dataUrl) => {
                    await supabase.from("tickets").update({ client_signature: dataUrl } as any).eq("id", id!);
                    setTicket((prev: any) => ({ ...prev, client_signature: dataUrl }));
                  }}
                />
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </HelpdeskLayout>
  );
};

export default ClientTicketDetail;
