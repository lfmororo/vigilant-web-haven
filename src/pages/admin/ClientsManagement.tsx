import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import AdminLayout from "@/components/admin/AdminLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { Plus, Loader2, Eye, EyeOff, Package, TicketCheck, Key, Pencil, Trash2, Search } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { z } from "zod";
import { Link } from "react-router-dom";
import ApiIntegrationDialog from "@/components/admin/ApiIntegrationDialog";

interface ClientProfile {
  id: string;
  full_name: string;
  email: string;
  phone: string | null;
  email_domain: string | null;
  whatsapp_group_id: string | null;
  created_at: string;
}

const createClientSchema = z.object({
  full_name: z.string().min(2, "Nome deve ter pelo menos 2 caracteres"),
  email: z.string().email("Email inválido"),
  password: z.string().min(6, "Senha deve ter pelo menos 6 caracteres"),
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
  const [clients, setClients] = useState<ClientProfile[]>([]);
  const [loading, setLoading] = useState(true);

  // Create dialog
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [formData, setFormData] = useState({
    full_name: "",
    email: "",
    password: "",
    phone: "",
    email_domain: "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Edit dialog
  const [editingClient, setEditingClient] = useState<ClientProfile | null>(null);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isEditSubmitting, setIsEditSubmitting] = useState(false);
  const [editFormData, setEditFormData] = useState({
    full_name: "",
    phone: "",
    email_domain: "",
    whatsapp_group_id: "",
  });
  const [editErrors, setEditErrors] = useState<Record<string, string>>({});

  // WhatsApp groups
  const [whatsappGroups, setWhatsappGroups] = useState<Array<{ id: string; name: string }>>([]);
  const [isLoadingGroups, setIsLoadingGroups] = useState(false);

  // Delete dialog
  const [deletingClient, setDeletingClient] = useState<ClientProfile | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    fetchClients();
  }, []);

  const fetchClients = async () => {
    try {
      const { data: roleData, error: roleError } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("role", "client" as any);

      if (roleError) throw roleError;

      if (!roleData || roleData.length === 0) {
        setClients([]);
        setLoading(false);
        return;
      }

      const clientIds = roleData.map((r) => r.user_id);
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .in("id", clientIds)
        .order("created_at", { ascending: false });

      if (error) throw error;
      setClients(data || []);
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Erro ao carregar clientes",
        description: error.message,
      });
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
      const response = await supabase.functions.invoke("create-user", {
        body: { full_name: formData.full_name, email: formData.email, password: formData.password, phone: formData.phone, role: "client" },
      });

      if (response.data?.user?.id && formData.email_domain.trim()) {
        await supabase
          .from("profiles")
          .update({ email_domain: formData.email_domain.trim().toLowerCase() })
          .eq("id", response.data.user.id);
      }

      if (response.error) throw new Error(response.error.message);
      if (response.data.error) throw new Error(response.data.error);

      toast({
        title: "Cliente criado",
        description: `${formData.full_name} foi criado com sucesso.`,
      });

      setFormData({ full_name: "", email: "", password: "", phone: "", email_domain: "" });
      setIsDialogOpen(false);
      fetchClients();
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Erro ao criar cliente",
        description: error.message,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const openEditDialog = (client: ClientProfile) => {
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
        .from("profiles")
        .update({
          full_name: editFormData.full_name,
          phone: editFormData.phone || null,
          email_domain: editFormData.email_domain.trim().toLowerCase() || null,
          whatsapp_group_id: editFormData.whatsapp_group_id.trim() || null,
        } as any)
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

  const handleDeleteClient = async () => {
    if (!deletingClient) return;
    setIsDeleting(true);
    try {
      const response = await supabase.functions.invoke("delete-user", {
        body: { user_id: deletingClient.id },
      });

      if (response.error) throw new Error(response.error.message);
      if (response.data?.error) throw new Error(response.data.error);

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
              <Button>
                <Plus className="w-4 h-4 mr-2" />
                Novo Cliente
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Criar Novo Cliente</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleCreateClient} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="full_name">Nome Completo</Label>
                  <Input
                    id="full_name"
                    value={formData.full_name}
                    onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                    className={errors.full_name ? "border-destructive" : ""}
                  />
                  {errors.full_name && <p className="text-sm text-destructive">{errors.full_name}</p>}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className={errors.email ? "border-destructive" : ""}
                  />
                  {errors.email && <p className="text-sm text-destructive">{errors.email}</p>}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">Senha</Label>
                  <div className="relative">
                    <Input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      value={formData.password}
                      onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                      className={errors.password ? "border-destructive pr-10" : "pr-10"}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  {errors.password && <p className="text-sm text-destructive">{errors.password}</p>}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="phone">Telefone (opcional)</Label>
                  <Input
                    id="phone"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email_domain">Domínio de Email (opcional)</Label>
                  <Input
                    id="email_domain"
                    placeholder="Ex: empresa.com.br"
                    value={formData.email_domain}
                    onChange={(e) => setFormData({ ...formData, email_domain: e.target.value })}
                  />
                  <p className="text-xs text-muted-foreground">Usuários com emails deste domínio serão vinculados automaticamente a este cliente.</p>
                </div>
                <Button type="submit" className="w-full" disabled={isSubmitting}>
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Criando...
                    </>
                  ) : (
                    "Criar Cliente"
                  )}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Lista de Clientes</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
              </div>
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
                      <TableCell>{client.email}</TableCell>
                      <TableCell>{client.phone || "-"}</TableCell>
                      <TableCell>{client.email_domain || "-"}</TableCell>
                      <TableCell>{new Date(client.created_at).toLocaleDateString("pt-BR")}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button variant="ghost" size="sm" asChild>
                            <Link to={`/helpdesk/tickets?client=${client.id}`}>
                              <TicketCheck className="w-4 h-4 mr-1" />
                              Tickets
                            </Link>
                          </Button>
                          <Button variant="ghost" size="sm" asChild>
                            <Link to={`/admin/inventory?client=${client.id}`}>
                              <Package className="w-4 h-4 mr-1" />
                              Equipamentos
                            </Link>
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => { setApiDialogClientId(client.id); setApiDialogClientName(client.full_name); }}>
                            <Key className="w-4 h-4 mr-1" />
                            API
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => openEditDialog(client)}>
                            <Pencil className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-destructive hover:text-destructive hover:bg-destructive/10"
                            onClick={() => setDeletingClient(client)}
                          >
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
            <DialogHeader>
              <DialogTitle>Editar Cliente</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleEditClient} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="edit_full_name">Nome Completo</Label>
                <Input
                  id="edit_full_name"
                  value={editFormData.full_name}
                  onChange={(e) => setEditFormData({ ...editFormData, full_name: e.target.value })}
                  className={editErrors.full_name ? "border-destructive" : ""}
                />
                {editErrors.full_name && <p className="text-sm text-destructive">{editErrors.full_name}</p>}
              </div>
              <div className="space-y-2">
                <Label>Email</Label>
                <Input value={editingClient?.email || ""} disabled className="opacity-60" />
                <p className="text-xs text-muted-foreground">O email não pode ser alterado por aqui.</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit_phone">Telefone (opcional)</Label>
                <Input
                  id="edit_phone"
                  value={editFormData.phone}
                  onChange={(e) => setEditFormData({ ...editFormData, phone: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit_email_domain">Domínio de Email</Label>
                <Input
                  id="edit_email_domain"
                  placeholder="Ex: empresa.com.br"
                  value={editFormData.email_domain}
                  onChange={(e) => setEditFormData({ ...editFormData, email_domain: e.target.value })}
                />
                <p className="text-xs text-muted-foreground">Usuários com emails deste domínio serão vinculados automaticamente a este cliente.</p>
              </div>
              <div className="space-y-2">
                <Label>Grupo WhatsApp (opcional)</Label>
                <div className="flex gap-2">
                  <div className="flex-1">
                    {whatsappGroups.length > 0 ? (
                      <Select
                        value={editFormData.whatsapp_group_id}
                        onValueChange={(value) => setEditFormData({ ...editFormData, whatsapp_group_id: value === "__none__" ? "" : value })}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione um grupo" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">Nenhum</SelectItem>
                          {whatsappGroups.map((g) => (
                            <SelectItem key={g.id} value={g.id}>
                              {g.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <Input
                        placeholder="Ex: 5511999999999-1234567890@g.us"
                        value={editFormData.whatsapp_group_id}
                        onChange={(e) => setEditFormData({ ...editFormData, whatsapp_group_id: e.target.value })}
                      />
                    )}
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={isLoadingGroups}
                    onClick={async () => {
                      setIsLoadingGroups(true);
                      try {
                        const { data, error } = await supabase.functions.invoke("list-whatsapp-groups");
                        if (error) throw new Error(error.message);
                        if (data?.error) throw new Error(data.error);
                        const groups = Array.isArray(data) ? data : data?.groups || [];
                        const mapped = groups.map((g: any) => ({ id: g.id || g.jid, name: g.name || g.subject || g.id || g.jid }));
                        setWhatsappGroups(mapped);
                        if (mapped.length === 0) {
                          toast({ title: "Nenhum grupo encontrado", description: "Nenhum grupo foi retornado pela API WhatsApp." });
                        }
                      } catch (err: any) {
                        toast({ variant: "destructive", title: "Erro ao buscar grupos", description: err.message });
                      } finally {
                        setIsLoadingGroups(false);
                      }
                    }}
                  >
                    {isLoadingGroups ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Search className="w-4 h-4 mr-1" />Buscar</>}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">Clique em "Buscar" para listar os grupos disponíveis na API WhatsApp.</p>
              </div>
              <Button type="submit" className="w-full" disabled={isEditSubmitting}>
                {isEditSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Salvando...
                  </>
                ) : (
                  "Salvar Alterações"
                )}
              </Button>
            </form>
          </DialogContent>
        </Dialog>

        {/* Delete Confirmation */}
        <AlertDialog open={!!deletingClient} onOpenChange={(open) => { if (!open) setDeletingClient(null); }}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Excluir Cliente</AlertDialogTitle>
              <AlertDialogDescription>
                Tem certeza que deseja excluir <strong>{deletingClient?.full_name}</strong>? Esta ação não pode ser desfeita e todos os dados do cliente serão removidos.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={isDeleting}>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDeleteClient}
                disabled={isDeleting}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {isDeleting ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Excluindo...</> : "Excluir"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

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
