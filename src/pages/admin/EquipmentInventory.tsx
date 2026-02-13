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
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Plus, Loader2, Eye, Key } from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";
import ApiIntegrationDialog from "@/components/admin/ApiIntegrationDialog";

interface Equipment {
  id: string;
  name: string;
  brand: string | null;
  model: string | null;
  serial_number: string | null;
  location: string | null;
  status: string;
  client_id: string | null;
  equipment_type_id: string | null;
  purchase_date: string | null;
  warranty_until: string | null;
  notes: string | null;
  created_at: string;
  client?: { full_name: string } | null;
  equipment_type?: { name: string } | null;
}

const statusLabels: Record<string, string> = {
  active: "Ativo",
  inactive: "Inativo",
  maintenance: "Em Manutenção",
  retired: "Aposentado",
};

const statusColors: Record<string, string> = {
  active: "bg-green-500/20 text-green-400 border-green-500/30",
  inactive: "bg-muted text-muted-foreground border-border",
  maintenance: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  retired: "bg-destructive/20 text-destructive border-destructive/30",
};

const EquipmentInventory = () => {
  const [isApiDialogOpen, setIsApiDialogOpen] = useState(false);
  const { toast } = useToast();
  const [searchParams] = useSearchParams();
  const clientFilter = searchParams.get("client");
  const [equipment, setEquipment] = useState<Equipment[]>([]);
  const [clients, setClients] = useState<{ id: string; full_name: string }[]>([]);
  const [equipmentTypes, setEquipmentTypes] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterType, setFilterType] = useState<string>("all");
  const [formData, setFormData] = useState({
    name: "",
    equipment_type_id: "",
    brand: "",
    model: "",
    serial_number: "",
    client_id: "",
    location: "",
    status: "active",
    purchase_date: "",
    warranty_until: "",
    notes: "",
  });

  useEffect(() => {
    fetchEquipment();
    fetchClients();
    fetchEquipmentTypes();
  }, [clientFilter, filterStatus, filterType]);

  const fetchEquipment = async () => {
    try {
      let query = supabase
        .from("equipment_inventory")
        .select("*, client:profiles!equipment_inventory_client_id_fkey(full_name), equipment_type:equipment_types!equipment_inventory_equipment_type_id_fkey(name)")
        .order("created_at", { ascending: false });

      if (clientFilter) query = query.eq("client_id", clientFilter);
      if (filterStatus !== "all") query = query.eq("status", filterStatus as any);
      if (filterType !== "all") query = query.eq("equipment_type_id", filterType);

      const { data, error } = await query;
      if (error) throw error;
      setEquipment((data as any) || []);
    } catch (error: any) {
      toast({ variant: "destructive", title: "Erro ao carregar equipamentos", description: error.message });
    } finally {
      setLoading(false);
    }
  };

  const fetchClients = async () => {
    const { data: roleData } = await supabase.from("user_roles").select("user_id").eq("role", "client" as any);
    if (roleData && roleData.length > 0) {
      const ids = roleData.map((r) => r.user_id);
      const { data } = await supabase.from("profiles").select("id, full_name").in("id", ids);
      setClients(data || []);
    }
  };

  const fetchEquipmentTypes = async () => {
    const { data } = await supabase.from("equipment_types").select("id, name");
    setEquipmentTypes(data || []);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name) return;
    setIsSubmitting(true);

    try {
      const insertData: any = {
        name: formData.name,
        brand: formData.brand || null,
        model: formData.model || null,
        serial_number: formData.serial_number || null,
        location: formData.location || null,
        status: formData.status as any,
        equipment_type_id: formData.equipment_type_id || null,
        client_id: formData.client_id || null,
        purchase_date: formData.purchase_date || null,
        warranty_until: formData.warranty_until || null,
        notes: formData.notes || null,
      };

      const { error } = await supabase.from("equipment_inventory").insert(insertData);
      if (error) throw error;

      toast({ title: "Equipamento cadastrado com sucesso!" });
      setFormData({ name: "", equipment_type_id: "", brand: "", model: "", serial_number: "", client_id: "", location: "", status: "active", purchase_date: "", warranty_until: "", notes: "" });
      setIsDialogOpen(false);
      fetchEquipment();
    } catch (error: any) {
      toast({ variant: "destructive", title: "Erro ao cadastrar", description: error.message });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AdminLayout>
      <div className="space-y-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-display font-bold">Inventário de Equipamentos</h1>
            <p className="text-muted-foreground">Gerencie os equipamentos cadastrados</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setIsApiDialogOpen(true)}>
              <Key className="w-4 h-4 mr-2" />Integração API
            </Button>
            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
              <DialogTrigger asChild>
                <Button><Plus className="w-4 h-4 mr-2" />Novo Equipamento</Button>
              </DialogTrigger>
            <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
              <DialogHeader><DialogTitle>Cadastrar Equipamento</DialogTitle></DialogHeader>
              <form onSubmit={handleCreate} className="space-y-4">
                <div className="space-y-2">
                  <Label>Nome *</Label>
                  <Input value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} required />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Tipo</Label>
                    <Select value={formData.equipment_type_id} onValueChange={(v) => setFormData({ ...formData, equipment_type_id: v })}>
                      <SelectTrigger><SelectValue placeholder="Selecionar" /></SelectTrigger>
                      <SelectContent>
                        {equipmentTypes.map((t) => (<SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Status</Label>
                    <Select value={formData.status} onValueChange={(v) => setFormData({ ...formData, status: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="active">Ativo</SelectItem>
                        <SelectItem value="inactive">Inativo</SelectItem>
                        <SelectItem value="maintenance">Em Manutenção</SelectItem>
                        <SelectItem value="retired">Aposentado</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2"><Label>Marca</Label><Input value={formData.brand} onChange={(e) => setFormData({ ...formData, brand: e.target.value })} /></div>
                  <div className="space-y-2"><Label>Modelo</Label><Input value={formData.model} onChange={(e) => setFormData({ ...formData, model: e.target.value })} /></div>
                </div>
                <div className="space-y-2"><Label>Número de Série</Label><Input value={formData.serial_number} onChange={(e) => setFormData({ ...formData, serial_number: e.target.value })} /></div>
                <div className="space-y-2">
                  <Label>Cliente</Label>
                  <Select value={formData.client_id} onValueChange={(v) => setFormData({ ...formData, client_id: v })}>
                    <SelectTrigger><SelectValue placeholder="Selecionar cliente" /></SelectTrigger>
                    <SelectContent>
                      {clients.map((c) => (<SelectItem key={c.id} value={c.id}>{c.full_name}</SelectItem>))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2"><Label>Localização</Label><Input value={formData.location} onChange={(e) => setFormData({ ...formData, location: e.target.value })} /></div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2"><Label>Data de Compra</Label><Input type="date" value={formData.purchase_date} onChange={(e) => setFormData({ ...formData, purchase_date: e.target.value })} /></div>
                  <div className="space-y-2"><Label>Garantia até</Label><Input type="date" value={formData.warranty_until} onChange={(e) => setFormData({ ...formData, warranty_until: e.target.value })} /></div>
                </div>
                <div className="space-y-2"><Label>Observações</Label><Textarea value={formData.notes} onChange={(e) => setFormData({ ...formData, notes: e.target.value })} /></div>
                <Button type="submit" className="w-full" disabled={isSubmitting}>
                  {isSubmitting ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Cadastrando...</> : "Cadastrar Equipamento"}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
          </div>
        </div>

        <ApiIntegrationDialog open={isApiDialogOpen} onOpenChange={setIsApiDialogOpen} />

        {/* Filters */}
        <div className="flex gap-4">
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="w-48"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os Status</SelectItem>
              <SelectItem value="active">Ativo</SelectItem>
              <SelectItem value="inactive">Inativo</SelectItem>
              <SelectItem value="maintenance">Em Manutenção</SelectItem>
              <SelectItem value="retired">Aposentado</SelectItem>
            </SelectContent>
          </Select>
          <Select value={filterType} onValueChange={setFilterType}>
            <SelectTrigger className="w-48"><SelectValue placeholder="Tipo" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os Tipos</SelectItem>
              {equipmentTypes.map((t) => (<SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>))}
            </SelectContent>
          </Select>
        </div>

        <Card>
          <CardHeader><CardTitle>Equipamentos</CardTitle></CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex items-center justify-center py-8"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
            ) : equipment.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">Nenhum equipamento cadastrado</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Marca/Modelo</TableHead>
                    <TableHead>Série</TableHead>
                    <TableHead>Cliente</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {equipment.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell className="font-medium">{item.name}</TableCell>
                      <TableCell>{item.equipment_type?.name || "-"}</TableCell>
                      <TableCell>{[item.brand, item.model].filter(Boolean).join(" ") || "-"}</TableCell>
                      <TableCell className="font-mono text-sm">{item.serial_number || "-"}</TableCell>
                      <TableCell>{item.client?.full_name || "-"}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={statusColors[item.status] || ""}>
                          {statusLabels[item.status] || item.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="sm" asChild>
                          <Link to={`/admin/inventory/${item.id}`}><Eye className="w-4 h-4 mr-1" />Ver</Link>
                        </Button>
                      </TableCell>
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

export default EquipmentInventory;
