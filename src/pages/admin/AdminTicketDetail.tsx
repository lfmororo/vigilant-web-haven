import { useEffect, useState, useCallback } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import AdminLayout from "@/components/admin/AdminLayout";
import TicketStatusBadge from "@/components/helpdesk/TicketStatusBadge";

import PriorityBadge from "@/components/helpdesk/PriorityBadge";
import TicketChat from "@/components/helpdesk/TicketChat";
import SignaturePad from "@/components/helpdesk/SignaturePad";
import TicketPrint from "@/components/admin/TicketPrint";
import { generateAndUploadTicketPdf } from "@/lib/generateTicketPdf";
import AiSuggestionsPanel from "@/components/admin/AiSuggestionsPanel";
import RecurrencePanel from "@/components/admin/RecurrencePanel";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Loader2, FileText, Trash2, Save, Printer, Monitor, AlertTriangle, Link2 } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import SectorSelect from "@/components/admin/SectorSelect";
import TicketChecklistComponent from "@/components/admin/TicketChecklist";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

const AdminTicketDetail = () => {
  const { id } = useParams<{ id: string }>();
  const { toast } = useToast();
  const navigate = useNavigate();
  const { isAdmin, isTechnician, user, loading: authLoading } = useAuth();
  const [ticket, setTicket] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [technicians, setTechnicians] = useState<any[]>([]);
  const [clients, setClients] = useState<any[]>([]);
  const [updating, setUpdating] = useState(false);
  const [pendingStatus, setPendingStatus] = useState<string>("");
  const [pendingPriority, setPendingPriority] = useState<string>("");
  const [pendingAssignedTo, setPendingAssignedTo] = useState<string>("");
  const [pendingClientId, setPendingClientId] = useState<string>("");
  const [pendingEquipmentId, setPendingEquipmentId] = useState<string>("");
  const [clientEquipments, setClientEquipments] = useState<any[]>([]);
  const [pendingSectorId, setPendingSectorId] = useState<string>("");
  const [showPrint, setShowPrint] = useState(false);
  const [requestingAccess, setRequestingAccess] = useState(false);
  const [chatMessages, setChatMessages] = useState<Array<{ sender_name: string; message: string }>>([]);
  const [linkedTicketsCount, setLinkedTicketsCount] = useState(0);
  const [showIncidentDialog, setShowIncidentDialog] = useState(false);
  const [incidentMessage, setIncidentMessage] = useState("Já estamos cientes deste problema e trabalhando na solução.");
  const [promotingIncident, setPromotingIncident] = useState(false);

  const fetchChatMessages = useCallback(async () => {
    if (!id) return;
    const { data } = await supabase
      .from("ticket_messages")
      .select("message, sender:profiles!ticket_messages_sender_id_fkey(full_name)")
      .eq("ticket_id", id)
      .eq("is_internal", false)
      .order("created_at", { ascending: true })
      .limit(20);
    if (data) {
      setChatMessages(data.map((m: any) => ({
        sender_name: m.sender?.full_name || "Sistema",
        message: m.message,
      })));
    }
  }, [id]);

  const isStaff = isAdmin || isTechnician;

  const statusLabels: Record<string, string> = {
    open: "Aberto", in_progress: "Em Andamento", waiting_client: "Aguardando Cliente",
    resolved: "Resolvido", closed: "Fechado",
  };
  const priorityLabels: Record<string, string> = { low: "Baixa", medium: "Média", high: "Alta", urgent: "Urgente" };

  const fetchTicket = async () => {
    if (!id) return;
    try {
      const { data, error } = await supabase.from("tickets")
        .select("*, client:clients!tickets_client_id_fkey(full_name, email), assigned:profiles!tickets_assigned_to_fkey(full_name), equipment_type:equipment_types(name)")
        .eq("id", id).maybeSingle();
      
      if (error) {
        console.error("fetchTicket error:", error);
        setLoading(false);
        return;
      }

      if (data) {
        // Fetch creator separately to avoid join issues
        let creatorData = null;
        if (data.created_by) {
          const { data: creator } = await supabase.from("profiles")
            .select("full_name, email")
            .eq("id", data.created_by)
            .maybeSingle();
          creatorData = creator;
        }
        setTicket({ ...data, creator: creatorData });
        setPendingStatus(data.status);
        setPendingPriority(data.priority);
        setPendingAssignedTo(data.assigned_to || "");
        setPendingClientId(data.client_id || "");
        setPendingEquipmentId((data as any).equipment_id || "");
        setPendingSectorId((data as any).sector_id || "");
      } else {
        setTicket(null);
      }
    } catch (err) {
      console.error("fetchTicket exception:", err);
    }
    setLoading(false);
  };

  useEffect(() => {
    if (authLoading || !user) return;
    fetchTicket();
    fetchChatMessages();
    if (isAdmin) {
      // Fetch technicians
      supabase.from("user_roles").select("user_id").in("role", ["technician", "admin"] as any)
        .then(async ({ data: roleData }) => {
          if (roleData && roleData.length > 0) {
            const ids = [...new Set(roleData.map(r => r.user_id))];
            const { data: profiles } = await supabase.from("profiles").select("id, full_name").in("id", ids);
            setTechnicians(profiles || []);
          }
        });
      // Fetch clients
      supabase.from("clients").select("id, full_name, email").order("full_name")
        .then(({ data }) => {
          setClients(data || []);
        });
    }
    // Fetch linked tickets count
    supabase.rpc("has_role" as any, { _user_id: user!.id, _role: "admin" }).then(() => {
      // Fetch linked tickets count using raw filter
      supabase.from("tickets")
        .select("id", { count: "exact", head: true })
        .filter("parent_incident_id", "eq", id!)
        .then(({ count }) => setLinkedTicketsCount(count || 0));
    });
  }, [id, isAdmin, authLoading, user]);

  // Fetch equipment inventory for the selected client
  useEffect(() => {
    const clientId = pendingClientId || ticket?.client_id;
    if (!clientId) { setClientEquipments([]); return; }
    supabase.from("equipment_inventory")
      .select("id, name, brand, model, serial_number, equipment_type:equipment_types(name)")
      .eq("client_id", clientId)
      .eq("status", "active" as any)
      .order("name")
      .then(({ data }) => setClientEquipments(data || []));
  }, [pendingClientId, ticket?.client_id]);
  const resolvedSectorId = pendingSectorId === "none" ? null : (pendingSectorId || null);
  const hasChanges = ticket && (
    pendingStatus !== ticket.status ||
    pendingPriority !== ticket.priority ||
    (pendingAssignedTo || null) !== (ticket.assigned_to || null) ||
    (pendingClientId || null) !== (ticket.client_id || null) ||
    ((pendingEquipmentId === "none" ? null : pendingEquipmentId) || null) !== ((ticket as any).equipment_id || null) ||
    resolvedSectorId !== ((ticket as any).sector_id || null)
  );

  const saveChanges = async () => {
    if (!ticket || !hasChanges || !user) return;
    setUpdating(true);

    const updates: Record<string, any> = {};
    const changes: string[] = [];
    let notificationType = "ticket_updated";
    let technicianJustAssigned = false;

    if (pendingStatus !== ticket.status) {
      updates.status = pendingStatus;
      changes.push(`- Status alterado de "${statusLabels[ticket.status] || ticket.status}" para "${statusLabels[pendingStatus] || pendingStatus}"`);
      if (pendingStatus === "resolved") notificationType = "ticket_resolved";
      else if (pendingStatus === "closed") notificationType = "ticket_closed";
    }
    if (pendingPriority !== ticket.priority) {
      updates.priority = pendingPriority;
      changes.push(`- Prioridade alterada de "${priorityLabels[ticket.priority] || ticket.priority}" para "${priorityLabels[pendingPriority] || pendingPriority}"`);
    }
    if ((pendingAssignedTo || null) !== (ticket.assigned_to || null)) {
      updates.assigned_to = pendingAssignedTo || null;
      const newTech = technicians.find(t => t.id === pendingAssignedTo);
      const oldTechName = ticket.assigned?.full_name || "Nenhum";
      const newTechName = newTech?.full_name || "Nenhum";
      changes.push(`- Técnico responsável alterado de "${oldTechName}" para "${newTechName}"`);
      if (pendingAssignedTo && !ticket.assigned_to) {
        technicianJustAssigned = true;
      }
    }
    if ((pendingClientId || null) !== (ticket.client_id || null)) {
      updates.client_id = pendingClientId;
      const newClient = clients.find(c => c.id === pendingClientId);
      const oldClientName = ticket.client?.full_name || "Nenhum";
      const newClientName = newClient?.full_name || "Nenhum";
      changes.push(`- Cliente alterado de "${oldClientName}" para "${newClientName}"`);
    }
    const resolvedEquipmentId = pendingEquipmentId === "none" ? null : (pendingEquipmentId || null);
    if (resolvedEquipmentId !== ((ticket as any).equipment_id || null)) {
      (updates as any).equipment_id = resolvedEquipmentId;
      const eq = clientEquipments.find(e => e.id === pendingEquipmentId);
      changes.push(`- Equipamento vinculado: ${eq?.name || "Nenhum"}`);
    }
    if (resolvedSectorId !== ((ticket as any).sector_id || null)) {
      (updates as any).sector_id = resolvedSectorId;
      let sectorName = "Nenhum";
      if (resolvedSectorId) {
        const { data: sectorData } = await supabase.from("client_sectors" as any).select("name").eq("id", resolvedSectorId).single();
        if (sectorData) sectorName = (sectorData as any).name;
      }
      changes.push(`- Setor alterado para "${sectorName}"`);
    }

    const { error } = await supabase.from("tickets").update(updates as any).eq("id", id!);
    if (error) {
      toast({ variant: "destructive", title: "Erro", description: error.message });
      setUpdating(false);
      return;
    }

    // Get current user's name
    const { data: userProfile } = await supabase.from("profiles").select("full_name").eq("id", user.id).single();
    const userName = userProfile?.full_name || "Usuário";
    const now = new Date().toLocaleString("pt-BR");
    const chatMessage = `Alterações realizadas por ${userName} em ${now}:\n${changes.join("\n")}`;

    // Insert audit message in ticket chat
    await supabase.from("ticket_messages").insert({
      ticket_id: id!,
      sender_id: user.id,
      message: chatMessage,
      is_internal: false,
    });

    // Generate PDF for resolved/closed tickets and include in notification
    let pdfUrl: string | undefined;
    if (notificationType === "ticket_resolved" || notificationType === "ticket_closed") {
      try {
        const url = await generateAndUploadTicketPdf(id!);
        if (url) pdfUrl = url;
      } catch (err) {
        console.error("PDF generation error:", err);
      }

      // Generate AI summary
      try {
        const { data: summaryData, error: summaryError } = await supabase.functions.invoke("ai-ticket-summary", {
          body: { ticket_id: id },
        });
        if (!summaryError && summaryData?.summary) {
          await supabase.from("ticket_messages").insert({
            ticket_id: id!,
            sender_id: user.id,
            message: `📋 **Resumo automático do atendimento (IA)**\n\n${summaryData.summary}`,
            is_internal: true,
          });
        }
      } catch (err) {
        console.error("AI summary error:", err);
      }
    }

    // Single email notification
    const emailMessage = changes.join("\n");
    const finalNotificationType = technicianJustAssigned && notificationType === "ticket_updated" ? "technician_assigned" : notificationType;
    supabase.functions.invoke("notify-ticket-update", {
      body: { ticket_id: id, sender_id: user.id, message: emailMessage, is_internal: false, notification_type: finalNotificationType, pdf_url: pdfUrl },
    }).catch(() => {});

    toast({ title: "Alterações salvas!" });
    fetchTicket();
    fetchChatMessages();
    setUpdating(false);
  };

  const createServiceOrder = async () => {
    if (!ticket) return;
    const { data, error } = await supabase.from("service_orders").insert({
      ticket_id: ticket.id,
      client_id: ticket.client_id,
      technician_id: ticket.assigned_to,
    }).select().single();
    if (error) toast({ variant: "destructive", title: "Erro", description: error.message });
    else { toast({ title: "OS criada!" }); navigate(`/admin/service-orders/${data.id}`); }
  };

  const promoteToIncident = async () => {
    if (!ticket || !user) return;
    setPromotingIncident(true);
    const { error } = await supabase.from("tickets").update({
      is_incident: true,
      incident_message: incidentMessage,
    } as any).eq("id", id!);
    if (error) {
      toast({ variant: "destructive", title: "Erro", description: error.message });
    } else {
      toast({ title: "🚨 Ticket promovido a Incidente!" });
      setShowIncidentDialog(false);
      fetchTicket();
    }
    setPromotingIncident(false);
  };

  if (loading || authLoading) return <AdminLayout><div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div></AdminLayout>;
  if (!ticket) return <AdminLayout><p className="text-center text-muted-foreground py-12">Ticket não encontrado</p></AdminLayout>;

  if (showPrint) {
    return <TicketPrint ticketId={ticket.id} onClose={() => setShowPrint(false)} />;
  }

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Link to="/admin/tickets"><Button variant="ghost" size="icon"><ArrowLeft className="w-5 h-5" /></Button></Link>
          <div className="flex-1">
            <div className="flex items-center gap-3">
              <span className="text-sm text-muted-foreground font-mono">#{ticket.ticket_number}</span>
              {ticket.is_incident && <Badge variant="destructive" className="text-xs">🚨 INCIDENTE</Badge>}
              {ticket.parent_incident_id && <Badge variant="outline" className="text-xs"><Link2 className="w-3 h-3 mr-1" />Vinculado a incidente</Badge>}
              <h1 className="text-xl font-display font-bold">{ticket.title}</h1>
            </div>
            <p className="text-sm text-muted-foreground">
              Cliente: {ticket.client?.full_name} ({ticket.client?.email})
              {ticket.is_incident && linkedTicketsCount > 0 && (
                <span className="ml-2 text-primary font-medium">• {linkedTicketsCount} ticket(s) vinculado(s)</span>
              )}
            </p>
          </div>
          <Button variant="outline" size="icon" onClick={() => setShowPrint(true)} title="Exportar PDF"><Printer className="w-4 h-4" /></Button>
          <Button
            variant="outline"
            disabled={requestingAccess}
            onClick={async () => {
              setRequestingAccess(true);
              try {
                const { error } = await supabase.functions.invoke("request-remote-access", {
                  body: { ticket_id: id, sender_id: user?.id },
                });
                if (error) throw error;
                toast({ title: "Solicitação enviada!", description: "Notificação de acesso remoto enviada por e-mail e WhatsApp." });
              } catch (err: any) {
                toast({ variant: "destructive", title: "Erro", description: err.message || "Erro ao enviar solicitação" });
              }
              setRequestingAccess(false);
            }}
          >
            {requestingAccess ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Monitor className="w-4 h-4 mr-2" />}
            Acesso Remoto
          </Button>
          <Button variant="outline" onClick={createServiceOrder}><FileText className="w-4 h-4 mr-2" />Criar OS</Button>
          {isAdmin && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" size="icon"><Trash2 className="w-4 h-4" /></Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Excluir Chamado</AlertDialogTitle>
                  <AlertDialogDescription>
                    Tem certeza que deseja excluir o chamado #{ticket.ticket_number}? Esta ação não pode ser desfeita.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction onClick={async () => {
                    const { error } = await supabase.from("tickets").delete().eq("id", id!);
                    if (error) toast({ variant: "destructive", title: "Erro", description: error.message });
                    else { toast({ title: "Chamado excluído!" }); navigate("/admin/tickets"); }
                  }}>Excluir</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-4">
            <Card>
              <CardHeader><CardTitle>Mensagens</CardTitle></CardHeader>
              <CardContent className="p-0">
                <TicketChat ticketId={ticket.id} isStaff={isStaff} />
              </CardContent>
            </Card>

            {isStaff && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <AiSuggestionsPanel
                  ticketId={ticket.id}
                  ticketTitle={ticket.title}
                  ticketDescription={ticket.description}
                  ticketCategory={ticket.equipment_type?.name}
                  ticketPriority={ticket.priority}
                  messages={chatMessages}
                />
                <RecurrencePanel ticketId={ticket.id} />
              </div>
            )}

            {isStaff && <TicketChecklistComponent ticketId={ticket.id} />}
          </div>

          <div className="space-y-4">
            <Card>
              <CardHeader><CardTitle className="text-sm">Gerenciar</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Status</Label>
                  <Select value={pendingStatus} onValueChange={setPendingStatus} disabled={updating}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="open">Aberto</SelectItem>
                      <SelectItem value="in_progress">Em Andamento</SelectItem>
                      <SelectItem value="waiting_client">Aguardando Cliente</SelectItem>
                      <SelectItem value="resolved">Resolvido</SelectItem>
                      <SelectItem value="closed">Fechado</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Prioridade</Label>
                  <Select value={pendingPriority} onValueChange={setPendingPriority} disabled={updating}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="low">Baixa</SelectItem>
                      <SelectItem value="medium">Média</SelectItem>
                      <SelectItem value="high">Alta</SelectItem>
                      <SelectItem value="urgent">Urgente</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {isAdmin && (
                  <div className="space-y-2">
                    <Label>Cliente</Label>
                    <Select value={pendingClientId} onValueChange={setPendingClientId} disabled={updating}>
                      <SelectTrigger><SelectValue placeholder="Selecionar cliente" /></SelectTrigger>
                      <SelectContent>
                        {clients.map((c) => (
                          <SelectItem key={c.id} value={c.id}>{c.full_name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                {isAdmin && (
                  <div className="space-y-2">
                    <Label>Técnico Responsável</Label>
                    <Select value={pendingAssignedTo} onValueChange={setPendingAssignedTo} disabled={updating}>
                      <SelectTrigger><SelectValue placeholder="Selecionar técnico" /></SelectTrigger>
                      <SelectContent>
                        {technicians.map((t) => (
                          <SelectItem key={t.id} value={t.id}>{t.full_name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                {isTechnician && ticket.assigned?.full_name && (
                  <div className="space-y-2">
                    <Label>Técnico Responsável</Label>
                    <p className="text-sm text-muted-foreground">{ticket.assigned.full_name}</p>
                  </div>
                )}
                <div className="space-y-2">
                  <Label>Equipamento do Inventário</Label>
                  <Select value={pendingEquipmentId} onValueChange={setPendingEquipmentId} disabled={updating}>
                    <SelectTrigger><SelectValue placeholder="Selecionar equipamento" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Nenhum</SelectItem>
                      {clientEquipments.map((eq) => (
                        <SelectItem key={eq.id} value={eq.id}>
                          {eq.name}{eq.brand ? ` - ${eq.brand}` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {clientEquipments.length === 0 && <p className="text-xs text-muted-foreground">Nenhum equipamento ativo cadastrado para este cliente</p>}
                </div>
                <div className="space-y-2">
                  <Label>Setor</Label>
                  <SectorSelect
                    clientId={pendingClientId || ticket?.client_id}
                    value={pendingSectorId || "none"}
                    onValueChange={setPendingSectorId}
                    disabled={updating}
                  />
                </div>
                {hasChanges && (
                  <Button onClick={saveChanges} disabled={updating} className="w-full">
                    {updating ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
                    Salvar Alterações
                  </Button>
                )}
              </CardContent>
            </Card>

            {/* Incident Management */}
            {isAdmin && !ticket.is_incident && !ticket.parent_incident_id && (
              <Card>
                <CardContent className="pt-4 space-y-3">
                  {!showIncidentDialog ? (
                    <Button variant="outline" className="w-full" onClick={() => setShowIncidentDialog(true)}>
                      <AlertTriangle className="w-4 h-4 mr-2" />
                      Promover a Incidente
                    </Button>
                  ) : (
                    <div className="space-y-3">
                      <p className="text-sm font-medium">🚨 Criar Incidente</p>
                      <div className="space-y-1">
                        <Label className="text-xs">Mensagem para os clientes</Label>
                        <Textarea
                          value={incidentMessage}
                          onChange={(e) => setIncidentMessage(e.target.value)}
                          placeholder="Ex: Já estamos cientes do problema..."
                          className="min-h-[80px] text-sm"
                        />
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Novos tickets similares serão automaticamente vinculados a este incidente.
                      </p>
                      <div className="flex gap-2">
                        <Button variant="ghost" size="sm" onClick={() => setShowIncidentDialog(false)}>Cancelar</Button>
                        <Button size="sm" onClick={promoteToIncident} disabled={promotingIncident} className="flex-1">
                          {promotingIncident && <Loader2 className="w-3 h-3 animate-spin mr-1" />}
                          Confirmar Incidente
                        </Button>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {ticket.is_incident && (
              <Card className="border-destructive/30">
                <CardContent className="pt-4 space-y-2">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-destructive" />
                    <span className="text-sm font-medium">Modo Incidente Ativo</span>
                  </div>
                  <p className="text-xs text-muted-foreground">{ticket.incident_message}</p>
                  <p className="text-xs text-primary font-medium">{linkedTicketsCount} ticket(s) vinculado(s)</p>
                </CardContent>
              </Card>
            )}

            <Card>
              <CardHeader><CardTitle className="text-sm">Detalhes</CardTitle></CardHeader>
              <CardContent className="space-y-3 text-sm">
                {ticket.creator && (
                  <div><span className="text-muted-foreground">Aberto por:</span><p className="mt-1">{ticket.creator.full_name} ({ticket.creator.email})</p></div>
                )}
                <div><span className="text-muted-foreground">Cliente:</span><p className="mt-1">{ticket.client?.full_name} ({ticket.client?.email})</p></div>
                <div><span className="text-muted-foreground">Descrição:</span><p className="mt-1">{ticket.description}</p></div>
                {ticket.equipment_type?.name && <div><span className="text-muted-foreground">Equipamento:</span><p className="mt-1">{ticket.equipment_type.name}</p></div>}
                {ticket.equipment_info && <div><span className="text-muted-foreground">Info:</span><p className="mt-1">{ticket.equipment_info}</p></div>}
                <div><span className="text-muted-foreground">Criado em:</span><p className="mt-1">{new Date(ticket.created_at).toLocaleString("pt-BR")}</p></div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="text-sm">Assinaturas</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <SignaturePad
                  label="Assinatura do Técnico"
                  value={ticket.technician_signature}
                  onChange={async (dataUrl) => {
                    await supabase.from("tickets").update({ technician_signature: dataUrl } as any).eq("id", id!);
                    // Notify client to sign
                    if (dataUrl) {
                      supabase.functions.invoke("notify-ticket-update", {
                        body: {
                          ticket_id: id,
                          sender_id: user?.id,
                          message: "O técnico assinou este chamado. Por favor, acesse o chamado para realizar sua assinatura.",
                          is_internal: false,
                          notification_type: "signature_requested",
                        },
                      }).catch((err) => console.error("Signature notification error:", err));
                    }
                    fetchTicket();
                  }}
                />
                <SignaturePad
                  label="Assinatura do Cliente"
                  value={ticket.client_signature}
                  onChange={async (dataUrl) => {
                    await supabase.from("tickets").update({ client_signature: dataUrl } as any).eq("id", id!);
                    fetchTicket();
                  }}
                />
              </CardContent>
            </Card>

          </div>
        </div>
      </div>
    </AdminLayout>
  );
};

export default AdminTicketDetail;
