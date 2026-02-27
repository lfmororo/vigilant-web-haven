import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import AdminLayout from "@/components/admin/AdminLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { Plus, Loader2, Eye, EyeOff, Pencil, Trash2, Power } from "lucide-react";
import { Switch } from "@/components/ui/switch";
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
import { z } from "zod";
import SectorSelect from "@/components/admin/SectorSelect";


interface UserProfile {
  id: string;
  full_name: string;
  email: string;
  phone: string | null;
  created_at: string;
  role?: string;
  parent_client_id?: string | null;
  is_active?: boolean;
}

interface ClientRecord {
  id: string;
  full_name: string;
}

const roleLabels: Record<string, string> = {
  admin: "Admin",
  technician: "Técnico",
  user: "Usuário",
};

const roleBadgeColors: Record<string, string> = {
  admin: "bg-destructive/20 text-destructive border-destructive/30",
  technician: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  user: "bg-muted text-muted-foreground border-border",
};

const createUserSchema = z.object({
  full_name: z.string().min(2, "Nome deve ter pelo menos 2 caracteres"),
  email: z.string().email("Email inválido"),
  password: z.string().min(6, "Senha deve ter pelo menos 6 caracteres"),
  phone: z.string().optional(),
});

const editUserSchema = z.object({
  full_name: z.string().min(2, "Nome deve ter pelo menos 2 caracteres"),
  phone: z.string().optional(),
});

const UsersManagement = () => {
  const { toast } = useToast();
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [clients, setClients] = useState<ClientRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [filterRole, setFilterRole] = useState<string>("all");
  const [formData, setFormData] = useState({
    full_name: "",
    email: "",
    password: "",
    phone: "",
    role: "user",
    parent_client_id: "",
    sector_id: "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Edit state
  const [editingUser, setEditingUser] = useState<UserProfile | null>(null);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isEditSubmitting, setIsEditSubmitting] = useState(false);
  const [editFormData, setEditFormData] = useState({ full_name: "", phone: "", role: "user", parent_client_id: "", sector_id: "" });
  const [editErrors, setEditErrors] = useState<Record<string, string>>({});

  // Delete state
  const [deletingUser, setDeletingUser] = useState<UserProfile | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [profilesRes, rolesRes, clientsRes] = await Promise.all([
        supabase.from("profiles").select("*").order("created_at", { ascending: false }),
        supabase.from("user_roles").select("user_id, role"),
        supabase.from("clients").select("id, full_name").order("full_name"),
      ]);

      if (profilesRes.error) throw profilesRes.error;

      const roleMap = new Map<string, string>();
      rolesRes.data?.forEach((r) => roleMap.set(r.user_id, r.role));

      const usersWithRoles = (profilesRes.data || []).map((p) => ({
        ...p,
        role: roleMap.get(p.id) || "user",
      }));

      setUsers(usersWithRoles);
      setClients(clientsRes.data || []);
    } catch (error: any) {
      toast({ variant: "destructive", title: "Erro ao carregar usuários", description: error.message });
    } finally {
      setLoading(false);
    }
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});

    const result = createUserSchema.safeParse(formData);
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
        body: {
          full_name: formData.full_name,
          email: formData.email,
          password: formData.password,
          phone: formData.phone,
          role: formData.role,
        },
      });

      if (response.error) throw new Error(response.error.message);
      if (response.data.error) throw new Error(response.data.error);

      // Link to client and sector if selected
      if (response.data?.user?.id && (formData.parent_client_id || formData.sector_id)) {
        const profileUpdate: any = {};
        if (formData.parent_client_id) profileUpdate.parent_client_id = formData.parent_client_id;
        if (formData.sector_id && formData.sector_id !== "none") profileUpdate.sector_id = formData.sector_id;
        await supabase.from("profiles").update(profileUpdate).eq("id", response.data.user.id);
      }

      toast({ title: "Usuário criado", description: `${formData.full_name} foi criado com sucesso.` });
      setFormData({ full_name: "", email: "", password: "", phone: "", role: "user", parent_client_id: "", sector_id: "" });
      setIsDialogOpen(false);
      fetchData();
    } catch (error: any) {
      toast({ variant: "destructive", title: "Erro ao criar usuário", description: error.message });
    } finally {
      setIsSubmitting(false);
    }
  };

  const openEditDialog = (user: UserProfile) => {
    setEditingUser(user);
    setEditFormData({ full_name: user.full_name, phone: user.phone || "", role: user.role || "user", parent_client_id: user.parent_client_id || "", sector_id: (user as any).sector_id || "" });
    setEditErrors({});
    setIsEditDialogOpen(true);
  };

  const handleEditUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;
    setEditErrors({});

    const result = editUserSchema.safeParse(editFormData);
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
      const { error: profileError } = await supabase
        .from("profiles")
        .update({
          full_name: editFormData.full_name,
          phone: editFormData.phone || null,
          parent_client_id: editFormData.parent_client_id || null,
          sector_id: editFormData.sector_id && editFormData.sector_id !== "none" ? editFormData.sector_id : null,
        } as any)
        .eq("id", editingUser.id);

      if (profileError) throw profileError;

      if (editFormData.role !== editingUser.role) {
        const { data: existingRole } = await supabase
          .from("user_roles")
          .select("id")
          .eq("user_id", editingUser.id)
          .maybeSingle();

        if (existingRole) {
          const { error: roleError } = await supabase
            .from("user_roles")
            .update({ role: editFormData.role as any })
            .eq("user_id", editingUser.id);
          if (roleError) throw roleError;
        } else {
          const { error: roleError } = await supabase
            .from("user_roles")
            .insert({ user_id: editingUser.id, role: editFormData.role as any });
          if (roleError) throw roleError;
        }
      }

      // If phone was added or changed, send ticket summary via WhatsApp
      const oldPhone = editingUser.phone || "";
      const newPhone = editFormData.phone || "";
      if (newPhone && newPhone !== oldPhone) {
        supabase.functions.invoke("send-user-ticket-summary", {
          body: { user_id: editingUser.id, phone: newPhone },
        }).then((res) => {
          if (res.data && !res.data.skipped && !res.data.error) {
            toast({ title: "Resumo enviado", description: `Resumo de chamados enviado via WhatsApp para ${newPhone}.` });
          }
        }).catch(() => {});
      }

      toast({ title: "Usuário atualizado", description: `${editFormData.full_name} foi atualizado com sucesso.` });
      setIsEditDialogOpen(false);
      setEditingUser(null);
      fetchData();
    } catch (error: any) {
      toast({ variant: "destructive", title: "Erro ao atualizar usuário", description: error.message });
    } finally {
      setIsEditSubmitting(false);
    }
  };

  const handleDeleteUser = async () => {
    if (!deletingUser) return;
    setIsDeleting(true);
    try {
      const response = await supabase.functions.invoke("delete-user", {
        body: { user_id: deletingUser.id },
      });
      if (response.error) throw new Error(response.error.message);
      if (response.data?.error) throw new Error(response.data.error);
      toast({ title: "Usuário excluído", description: `${deletingUser.full_name} foi excluído com sucesso.` });
      setDeletingUser(null);
      fetchData();
    } catch (error: any) {
      toast({ variant: "destructive", title: "Erro ao excluir usuário", description: error.message });
    } finally {
      setIsDeleting(false);
    }
  };

  const handleToggleActive = async (user: UserProfile) => {
    const newStatus = !user.is_active;
    try {
      const { error } = await supabase
        .from("profiles")
        .update({ is_active: newStatus } as any)
        .eq("id", user.id);
      if (error) throw error;
      toast({ title: newStatus ? "Usuário ativado" : "Usuário desativado", description: `${user.full_name} foi ${newStatus ? "ativado" : "desativado"} com sucesso.` });
      fetchData();
    } catch (error: any) {
      toast({ variant: "destructive", title: "Erro ao alterar status", description: error.message });
    }
  };

  const filteredUsers = filterRole === "all" ? users : users.filter((u) => u.role === filterRole);

  const getClientName = (clientId: string | null | undefined) => {
    if (!clientId) return null;
    return clients.find((c) => c.id === clientId)?.full_name || null;
  };

  return (
    <AdminLayout>
      <div className="space-y-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-display font-bold">Gestão de Usuários</h1>
            <p className="text-muted-foreground">Gerencie todos os usuários do sistema</p>
          </div>
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button><Plus className="w-4 h-4 mr-2" />Novo Usuário</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Criar Novo Usuário</DialogTitle></DialogHeader>
              <form onSubmit={handleCreateUser} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="full_name">Nome Completo</Label>
                  <Input id="full_name" value={formData.full_name} onChange={(e) => setFormData({ ...formData, full_name: e.target.value })} className={errors.full_name ? "border-destructive" : ""} />
                  {errors.full_name && <p className="text-sm text-destructive">{errors.full_name}</p>}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input id="email" type="email" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} className={errors.email ? "border-destructive" : ""} />
                  {errors.email && <p className="text-sm text-destructive">{errors.email}</p>}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">Senha</Label>
                  <div className="relative">
                    <Input id="password" type={showPassword ? "text" : "password"} value={formData.password} onChange={(e) => setFormData({ ...formData, password: e.target.value })} className={errors.password ? "border-destructive pr-10" : "pr-10"} />
                    <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  {errors.password && <p className="text-sm text-destructive">{errors.password}</p>}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="phone">Telefone (opcional)</Label>
                  <Input id="phone" value={formData.phone} onChange={(e) => setFormData({ ...formData, phone: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Perfil</Label>
                  <Select value={formData.role} onValueChange={(v) => setFormData({ ...formData, role: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="user">Usuário</SelectItem>
                      <SelectItem value="technician">Técnico</SelectItem>
                      <SelectItem value="admin">Admin</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Vincular ao Cliente</Label>
                  <Select value={formData.parent_client_id || "none"} onValueChange={(v) => setFormData({ ...formData, parent_client_id: v === "none" ? "" : v })}>
                    <SelectTrigger><SelectValue placeholder="Nenhum" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Nenhum</SelectItem>
                      {clients.map((c) => (
                        <SelectItem key={c.id} value={c.id}>{c.full_name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">Vincule este usuário a um cliente para acesso ao helpdesk.</p>
                </div>
                <div className="space-y-2">
                  <Label>Setor</Label>
                  <SectorSelect
                    clientId={formData.parent_client_id || null}
                    value={formData.sector_id || "none"}
                    onValueChange={(v) => setFormData({ ...formData, sector_id: v === "none" ? "" : v })}
                  />
                </div>
                <Button type="submit" className="w-full" disabled={isSubmitting}>
                  {isSubmitting ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Criando...</> : "Criar Usuário"}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        {/* Filter */}
        <div className="flex gap-4">
          <Select value={filterRole} onValueChange={setFilterRole}>
            <SelectTrigger className="w-48"><SelectValue placeholder="Filtrar por perfil" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="admin">Admin</SelectItem>
              <SelectItem value="technician">Técnico</SelectItem>
              <SelectItem value="user">Usuário</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <Card>
          <CardHeader><CardTitle>Lista de Usuários</CardTitle></CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex items-center justify-center py-8"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
            ) : filteredUsers.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">Nenhum usuário encontrado</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Perfil</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Cliente Vinculado</TableHead>
                    <TableHead>Telefone</TableHead>
                    <TableHead>Criado em</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredUsers.map((user) => {
                    const clientName = getClientName(user.parent_client_id);
                    return (
                      <TableRow key={user.id}>
                        <TableCell className="font-medium">{user.full_name}</TableCell>
                        <TableCell>{user.email}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className={roleBadgeColors[user.role || "user"] || ""}>
                            {roleLabels[user.role || "user"] || user.role}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Switch
                              checked={user.is_active !== false}
                              onCheckedChange={() => handleToggleActive(user)}
                            />
                            <span className={`text-xs ${user.is_active !== false ? "text-green-500" : "text-muted-foreground"}`}>
                              {user.is_active !== false ? "Ativo" : "Inativo"}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>
                          {clientName ? (
                            <Badge variant="outline" className="bg-primary/10 text-primary border-primary/30 text-xs">
                              {clientName}
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground text-sm">-</span>
                          )}
                        </TableCell>
                        <TableCell>{user.phone || "-"}</TableCell>
                        <TableCell>{new Date(user.created_at).toLocaleDateString("pt-BR")}</TableCell>
                        <TableCell className="text-right space-x-1">
                          <Button variant="ghost" size="sm" onClick={() => openEditDialog(user)}>
                            <Pencil className="w-4 h-4 mr-1" />Editar
                          </Button>
                          <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={() => setDeletingUser(user)}>
                            <Trash2 className="w-4 h-4 mr-1" />Excluir
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Edit User Dialog */}
        <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
          <DialogContent>
            <DialogHeader><DialogTitle>Editar Usuário</DialogTitle></DialogHeader>
            <form onSubmit={handleEditUser} className="space-y-4">
              <div className="space-y-2">
                <Label>Email</Label>
                <Input value={editingUser?.email || ""} disabled className="opacity-60" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit_full_name">Nome Completo</Label>
                <Input id="edit_full_name" value={editFormData.full_name} onChange={(e) => setEditFormData({ ...editFormData, full_name: e.target.value })} className={editErrors.full_name ? "border-destructive" : ""} />
                {editErrors.full_name && <p className="text-sm text-destructive">{editErrors.full_name}</p>}
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit_phone">Telefone</Label>
                <Input id="edit_phone" value={editFormData.phone} onChange={(e) => setEditFormData({ ...editFormData, phone: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Perfil</Label>
                <Select value={editFormData.role} onValueChange={(v) => setEditFormData({ ...editFormData, role: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="user">Usuário</SelectItem>
                    <SelectItem value="technician">Técnico</SelectItem>
                    <SelectItem value="admin">Admin</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Vinculado ao Cliente</Label>
                <Select value={editFormData.parent_client_id || "none"} onValueChange={(v) => setEditFormData({ ...editFormData, parent_client_id: v === "none" ? "" : v })}>
                  <SelectTrigger><SelectValue placeholder="Nenhum" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Nenhum</SelectItem>
                    {clients.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.full_name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">Vincule este usuário a um cliente para agrupar chamados.</p>
              </div>
              <div className="space-y-2">
                <Label>Setor</Label>
                <SectorSelect
                  clientId={editFormData.parent_client_id || null}
                  value={editFormData.sector_id || "none"}
                  onValueChange={(v) => setEditFormData({ ...editFormData, sector_id: v === "none" ? "" : v })}
                />
              </div>
              <Button type="submit" className="w-full" disabled={isEditSubmitting}>
                {isEditSubmitting ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Salvando...</> : "Salvar Alterações"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>

        {/* Delete Confirmation */}
        <AlertDialog open={!!deletingUser} onOpenChange={(open) => !open && setDeletingUser(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Excluir Usuário</AlertDialogTitle>
              <AlertDialogDescription>
                Tem certeza que deseja excluir <strong>{deletingUser?.full_name}</strong> ({deletingUser?.email})? Esta ação não pode ser desfeita.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={isDeleting}>Cancelar</AlertDialogCancel>
              <AlertDialogAction onClick={handleDeleteUser} disabled={isDeleting} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                {isDeleting ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Excluindo...</> : "Excluir"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </AdminLayout>
  );
};

export default UsersManagement;
