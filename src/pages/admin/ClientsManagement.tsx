import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import AdminLayout from "@/components/admin/AdminLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { Plus, Loader2, Package, TicketCheck, Key, Pencil, Trash2, AlertTriangle } from "lucide-react";
import { z } from "zod";
import { Link } from "react-router-dom";
import ApiIntegrationDialog from "@/components/admin/ApiIntegrationDialog";
import SectorManagement from "@/components/admin/SectorManagement";

interface Client {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  email_domain: string | null;
  whatsapp_group_id: string | null;
  address: string | null;
  address_number: string | null;
  address_complement: string | null;
  neighborhood: string | null;
  city: string | null;
  created_at: string;
}

const createClientSchema = z.object({
  full_name: z.string().min(2, "Nome deve ter pelo menos 2 caracteres"),
  email: z.string().email("Email inválido").optional().or(z.literal("")),
  phone: z.string().optional(),
});

const editClientSchema = z.object({
  full_name: z.string().min(2, "Nome deve ter pelo menos 2 caracteres"),
  phone: z.string().optional(),
  email_domain: z.string().optional(),
});

const ClientsManagement = () => {
  const [apiDialogClientId, setApiDialogClientId] = useState<string | null>(null);
  const [apiDialogClientName, setApiDialogClientName] = useState("");
  const { toast } = useToast();
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);

  // Create dialog
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    full_name: "",
    email: "",
    phone: "",
    email_domain: "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Edit dialog
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isEditSubmitting, setIsEditSubmitting] = useState(false);
  const [editFormData, setEditFormData] = useState({
    full_name: "",
    phone: "",
    email_domain: "",
    whatsapp_group_id: "",
  });
  const [editErrors, setEditErrors] = useState<Record<string, string>>({});

  // Delete dialog
  const [deletingClient, setDeletingClient] = useState<Client | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [linkedTickets, setLinkedTickets] = useState<any[]>([]);
  const [linkedOrders, setLinkedOrders] = useState<any[]>([]);
  const [loadingLinked, setLoadingLinked] = useState(false);
  const [reassignClientId, setReassignClientId] = useState<string>("");
  const [isReassigning, setIsReassigning] = useState(false);
  const [deleteStep, setDeleteStep] = useState<"check" | "confirm">("check");

  useEffect(() => {
    fetchClients();
  }, []);

  const fetchClients = async () => {
    try {
      const { data, error } = await supabase
        .from("clients")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;
      setClients(data || []);
    } catch (error: any) {
      toast({ variant: "destructive", title: "Erro ao carregar clientes", description: error.message });
    } finally {
      setLoading(false);
    }
  };

  const handleCreateClient = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});

    const result = createClientSchema.safeParse(formData);
    if (!result.success) {
      const fieldErrors: Record<string, string> = {};
      result.error.errors.forEach((err) => {
        fieldErrors[err.path[0] as string] = err.message;
      });
      setErrors(fieldErrors);
      return;
    }

    setIsSubmitting(true);
    try {
      const { error } = await supabase.from("clients").insert({
        full_name: formData.full_name,
        email: formData.email || null,
        phone: formData.phone || null,
        email_domain: formData.email_domain.trim().toLowerCase() || null,
      });

      if (error) throw error;

      toast({ title: "Cliente criado", description: `${formData.full_name} foi criado com sucesso.` });
      setFormData({ full_name: "", email: "", phone: "", email_domain: "" });
      setIsDialogOpen(false);
      fetchClients();
    } catch (error: any) {
      toast({ variant: "destructive", title: "Erro ao criar cliente", description: error.message });
    } finally {
      setIsSubmitting(false);
    }
  };

  const openEditDialog = (client: Client) => {
    setEditingClient(client);
    setEditFormData({
      full_name: client.full_name,
      phone: client.phone || "",
      email_domain: client.email_domain || "",
      whatsapp_group_id: client.whatsapp_group_id || "",
    });
    setEditErrors({});
    setIsEditDialogOpen(true);
  };

  const handleEditClient = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingClient) return;
    setEditErrors({});

    const result = editClientSchema.safeParse(editFormData);
    if (!result.success) {
      const fieldErrors: Record<string, string> = {};
      result.error.errors.forEach((err) => {
        fieldErrors[err.path[0] as string] = err.message;
      });
      setEditErrors(fieldErrors);
      return;
    }

    setIsEditSubmitting(true);
    try {
      const { error } = await supabase
        .from("clients")
        .update({
          full_name: editFormData.full_name,
          phone: editFormData.phone || null,
          email_domain: editFormData.email_domain.trim().toLowerCase() || null,
          whatsapp_group_id: editFormData.whatsapp_group_id.trim() || null,
        })
        .eq("id", editingClient.id);

      if (error) throw error;

      toast({ title: "Cliente atualizado", description: `${editFormData.full_name} foi atualizado com sucesso.` });
      setIsEditDialogOpen(false);
      setEditingClient(null);
      fetchClients();
    } catch (error: any) {
      toast({ variant: "destructive", title: "Erro ao atualizar cliente", description: error.message });
    } finally {
      setIsEditSubmitting(false);
    }
  };

  const openDeleteDialog = async (client: Client) => {
    setDeletingClient(client);
    setDeleteStep("check");
    setLinkedTickets([]);
    setLinkedOrders([]);
    setReassignClientId("");
    setLoadingLinked(true);

    try {
      const [ticketsRes, ordersRes] = await Promise.all([
        supabase.from("tickets").select("id, ticket_number, title, status, priority").eq("client_id", client.id),
        supabase.from("service_orders").select("id, order_number, status").eq("client_id", client.id),
      ]);
      setLinkedTickets(ticketsRes.data || []);
      setLinkedOrders(ordersRes.data || []);
      if ((ticketsRes.data?.length || 0) === 0 && (ordersRes.data?.length || 0) === 0) {
        setDeleteStep("confirm");
      }
    } catch {
      // ignore
    } finally {
      setLoadingLinked(false);
    }
  };

  const handleReassignAndDelete = async () => {
    if (!deletingClient || !reassignClientId) return;
    setIsReassigning(true);
    try {
      if (linkedTickets.length > 0) {
        const { error: tErr } = await supabase
          .from("tickets")
          .update({ client_id: reassignClientId } as any)
          .eq("client_id", deletingClient.id);
        if (tErr) throw tErr;
      }
      if (linkedOrders.length > 0) {
        const { error: oErr } = await supabase
          .from("service_orders")
          .update({ client_id: reassignClientId } as any)
          .eq("client_id", deletingClient.id);
        if (oErr) throw oErr;
      }
      toast({ title: "Dados reatribuídos", description: "Chamados e OS foram transferidos." });
      setLinkedTickets([]);
      setLinkedOrders([]);
      setDeleteStep("confirm");
      await handleDeleteClient();
    } catch (error: any) {
      toast({ variant: "destructive", title: "Erro ao reatribuir", description: error.message });
    } finally {
      setIsReassigning(false);
    }
  };

  const handleDeleteClient = async () => {
    if (!deletingClient) return;
    setIsDeleting(true);
    try {
      // Delete related data
      await supabase.from("equipment_inventory").delete().eq("client_id", deletingClient.id);
      await supabase.from("inventory_api_keys").delete().eq("client_id", deletingClient.id);
      await supabase.from("imap_accounts").delete().eq("client_id", deletingClient.id);
      
      // Unlink profiles referencing this client
      await supabase.from("profiles").update({ parent_client_id: null } as any).eq("parent_client_id", deletingClient.id);

      // Delete the client record
      const { error } = await supabase.from("clients").delete().eq("id", deletingClient.id);
      if (error) throw error;

      toast({ title: "Cliente excluído", description: `${deletingClient.full_name} foi excluído com sucesso.` });
      setDeletingClient(null);
      fetchClients();
    } catch (error: any) {
      toast({ variant: "destructive", title: "Erro ao excluir cliente", description: error.message });
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <AdminLayout>
      <div className="space-y-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-display font-bold">Clientes</h1>
            <p className="text-muted-foreground">Gerencie os clientes do sistema</p>
          </div>
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button><Plus className="w-4 h-4 mr-2" />Novo Cliente</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Criar Novo Cliente</DialogTitle></DialogHeader>
              <form onSubmit={handleCreateClient} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="full_name">Nome Completo *</Label>
                  <Input id="full_name" value={formData.full_name} onChange={(e) => setFormData({ ...formData, full_name: e.target.value })} className={errors.full_name ? "border-destructive" : ""} />
                  {errors.full_name && <p className="text-sm text-destructive">{errors.full_name}</p>}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">Email (opcional)</Label>
                  <Input id="email" type="email" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="phone">Telefone (opcional)</Label>
                  <Input id="phone" value={formData.phone} onChange={(e) => setFormData({ ...formData, phone: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email_domain">Domínio de Email (opcional)</Label>
                  <Input id="email_domain" placeholder="Ex: empresa.com.br" value={formData.email_domain} onChange={(e) => setFormData({ ...formData, email_domain: e.target.value })} />
                  <p className="text-xs text-muted-foreground">Usuários com emails deste domínio serão vinculados automaticamente a este cliente.</p>
                </div>
                <Button type="submit" className="w-full" disabled={isSubmitting}>
                  {isSubmitting ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Criando...</> : "Criar Cliente"}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        <Card>
          <CardHeader><CardTitle>Lista de Clientes</CardTitle></CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex items-center justify-center py-8"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
            ) : clients.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">Nenhum cliente cadastrado</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Telefone</TableHead>
                    <TableHead>Domínio</TableHead>
                    <TableHead>Criado em</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {clients.map((client) => (
                    <TableRow key={client.id}>
                      <TableCell className="font-medium">{client.full_name}</TableCell>
                      <TableCell>{client.email || "-"}</TableCell>
                      <TableCell>{client.phone || "-"}</TableCell>
                      <TableCell>{client.email_domain || "-"}</TableCell>
                      <TableCell>{new Date(client.created_at).toLocaleDateString("pt-BR")}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button variant="ghost" size="sm" asChild>
                            <Link to={`/admin/tickets?client=${client.id}`}><TicketCheck className="w-4 h-4 mr-1" />Tickets</Link>
                          </Button>
                          <Button variant="ghost" size="sm" asChild>
                            <Link to={`/admin/inventory?client=${client.id}`}><Package className="w-4 h-4 mr-1" />Equipamentos</Link>
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => { setApiDialogClientId(client.id); setApiDialogClientName(client.full_name); }}>
                            <Key className="w-4 h-4 mr-1" />API
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => openEditDialog(client)}><Pencil className="w-4 h-4" /></Button>
                          <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive hover:bg-destructive/10" onClick={() => openDeleteDialog(client)}>
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Edit Dialog */}
        <Dialog open={isEditDialogOpen} onOpenChange={(open) => { if (!open) { setIsEditDialogOpen(false); setEditingClient(null); } }}>
          <DialogContent>
            <DialogHeader><DialogTitle>Editar Cliente</DialogTitle></DialogHeader>
            <form onSubmit={handleEditClient} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="edit_full_name">Nome Completo</Label>
                <Input id="edit_full_name" value={editFormData.full_name} onChange={(e) => setEditFormData({ ...editFormData, full_name: e.target.value })} className={editErrors.full_name ? "border-destructive" : ""} />
                {editErrors.full_name && <p className="text-sm text-destructive">{editErrors.full_name}</p>}
              </div>
              <div className="space-y-2">
                <Label>Email</Label>
                <Input value={editingClient?.email || ""} disabled className="opacity-60" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit_phone">Telefone (opcional)</Label>
                <Input id="edit_phone" value={editFormData.phone} onChange={(e) => setEditFormData({ ...editFormData, phone: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit_email_domain">Domínio de Email</Label>
                <Input id="edit_email_domain" placeholder="Ex: empresa.com.br" value={editFormData.email_domain} onChange={(e) => setEditFormData({ ...editFormData, email_domain: e.target.value })} />
                <p className="text-xs text-muted-foreground">Usuários com emails deste domínio serão vinculados automaticamente a este cliente.</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit_whatsapp_group_id">Grupo WhatsApp (opcional)</Label>
                <Input id="edit_whatsapp_group_id" placeholder="Ex: 5511999999999-1234567890@g.us" value={editFormData.whatsapp_group_id} onChange={(e) => setEditFormData({ ...editFormData, whatsapp_group_id: e.target.value })} />
              </div>
              {editingClient && (
                <div className="space-y-2">
                  <Label>Setores</Label>
                  <SectorManagement clientId={editingClient.id} />
                </div>
              )}
              <Button type="submit" className="w-full" disabled={isEditSubmitting}>
                {isEditSubmitting ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Salvando...</> : "Salvar Alterações"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>

        {/* Delete Confirmation */}
        <Dialog open={!!deletingClient} onOpenChange={(open) => { if (!open) { setDeletingClient(null); setDeleteStep("check"); } }}>
          <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                {(linkedTickets.length > 0 || linkedOrders.length > 0) && <AlertTriangle className="w-5 h-5 text-amber-500" />}
                Excluir Cliente
              </DialogTitle>
            </DialogHeader>
            {loadingLinked ? (
              <div className="flex items-center justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
            ) : (linkedTickets.length > 0 || linkedOrders.length > 0) && deleteStep === "check" ? (
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  <strong>{deletingClient?.full_name}</strong> possui dados vinculados que precisam ser reatribuídos antes da exclusão:
                </p>
                {linkedTickets.length > 0 && (
                  <div className="space-y-2">
                    <h4 className="text-sm font-semibold">Chamados ({linkedTickets.length})</h4>
                    <div className="border rounded-md max-h-40 overflow-y-auto">
                      <Table>
                        <TableHeader><TableRow><TableHead className="text-xs">#</TableHead><TableHead className="text-xs">Título</TableHead><TableHead className="text-xs">Status</TableHead></TableRow></TableHeader>
                        <TableBody>
                          {linkedTickets.map((t) => (
                            <TableRow key={t.id}>
                              <TableCell className="text-xs py-1">{t.ticket_number}</TableCell>
                              <TableCell className="text-xs py-1 max-w-[180px] truncate">{t.title}</TableCell>
                              <TableCell className="text-xs py-1"><Badge variant="outline" className="text-[10px]">{t.status}</Badge></TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                )}
                {linkedOrders.length > 0 && (
                  <div className="space-y-2">
                    <h4 className="text-sm font-semibold">Ordens de Serviço ({linkedOrders.length})</h4>
                    <div className="border rounded-md max-h-32 overflow-y-auto">
                      <Table>
                        <TableHeader><TableRow><TableHead className="text-xs">#</TableHead><TableHead className="text-xs">Status</TableHead></TableRow></TableHeader>
                        <TableBody>
                          {linkedOrders.map((o) => (
                            <TableRow key={o.id}>
                              <TableCell className="text-xs py-1">{o.order_number}</TableCell>
                              <TableCell className="text-xs py-1"><Badge variant="outline" className="text-[10px]">{o.status}</Badge></TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                )}
                <div className="space-y-2 pt-2 border-t">
                  <Label>Reatribuir para outro cliente:</Label>
                  <Select value={reassignClientId} onValueChange={setReassignClientId}>
                    <SelectTrigger><SelectValue placeholder="Selecione um cliente..." /></SelectTrigger>
                    <SelectContent>
                      {clients.filter((c) => c.id !== deletingClient?.id).map((c) => (
                        <SelectItem key={c.id} value={c.id}>{c.full_name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex gap-2 justify-end pt-2">
                  <Button variant="outline" onClick={() => { setDeletingClient(null); setDeleteStep("check"); }}>Cancelar</Button>
                  <Button variant="destructive" disabled={!reassignClientId || isReassigning} onClick={handleReassignAndDelete}>
                    {isReassigning ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Reatribuindo...</> : "Reatribuir e Excluir"}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Tem certeza que deseja excluir <strong>{deletingClient?.full_name}</strong>? Esta ação não pode ser desfeita.
                </p>
                <div className="flex gap-2 justify-end">
                  <Button variant="outline" onClick={() => setDeletingClient(null)}>Cancelar</Button>
                  <Button variant="destructive" disabled={isDeleting} onClick={handleDeleteClient}>
                    {isDeleting ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Excluindo...</> : "Excluir"}
                  </Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>

        <ApiIntegrationDialog
          open={!!apiDialogClientId}
          onOpenChange={(open) => { if (!open) setApiDialogClientId(null); }}
          clientId={apiDialogClientId || undefined}
          clientName={apiDialogClientName}
        />
      </div>
    </AdminLayout>
  );
};

export default ClientsManagement;
