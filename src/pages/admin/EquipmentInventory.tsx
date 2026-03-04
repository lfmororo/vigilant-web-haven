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
import { Plus, Loader2, Eye, Key, Trash2, Pencil, FileText, Clock } from "lucide-react";
import { formatTimeAgo } from "@/lib/formatTimeAgo";
import { Link, useSearchParams } from "react-router-dom";
import ApiIntegrationDialog from "@/components/admin/ApiIntegrationDialog";
import EquipmentInventoryPrint from "@/components/admin/EquipmentInventoryPrint";
import SectorSelect from "@/components/admin/SectorSelect";

interface Equipment {
  id: string;
  name: string;
  brand: string | null;
  model: string | null;
  serial_number: string | null;
  asset_tag: string | null;
  location: string | null;
  status: string;
  client_id: string | null;
  equipment_type_id: string | null;
  purchase_date: string | null;
  warranty_until: string | null;
  notes: string | null;
  created_at: string;
  cpu: string | null;
  ram_total_gb: number | null;
  disk_total_gb: number | null;
  disk_used_gb: number | null;
  disk_free_gb: number | null;
  hardware_updated_at: string | null;
  logged_in_user: string | null;
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

const emptyForm = {
  name: "",
  equipment_type_id: "",
  brand: "",
  model: "",
  serial_number: "",
  client_id: "",
  sector_id: "",
  location: "",
  status: "active",
  purchase_date: "",
  warranty_until: "",
  notes: "",
  asset_tag: "",
};

const EquipmentInventory = () => {
  const [isApiDialogOpen, setIsApiDialogOpen] = useState(false);
  const { toast } = useToast();
  const [searchParams] = useSearchParams();
  const clientFilter = searchParams.get("client");
  const [equipment, setEquipment] = useState<Equipment[]>([]);
  const [diskMap, setDiskMap] = useState<Record<string, { drive_letter: string; pct: number; used: number; total: number; free: number }>>({});
  const [clients, setClients] = useState<{ id: string; full_name: string }[]>([]);
  const [equipmentTypes, setEquipmentTypes] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterType, setFilterType] = useState<string>("all");
  const [filterClient, setFilterClient] = useState<string>("all");
  const [deleteTarget, setDeleteTarget] = useState<Equipment | null>(null);
  const [editTarget, setEditTarget] = useState<Equipment | null>(null);
  const [showPrint, setShowPrint] = useState(false);
  const [formData, setFormData] = useState({ ...emptyForm });

  useEffect(() => {
    fetchEquipment();
    fetchClients();
    fetchEquipmentTypes();
  }, [clientFilter, filterStatus, filterType, filterClient]);

  const fetchEquipment = async () => {
    try {
      let query = supabase
        .from("equipment_inventory")
        .select("*, client:clients!equipment_inventory_client_id_fkey(full_name), equipment_type:equipment_types!equipment_inventory_equipment_type_id_fkey(name)")
        .order("created_at", { ascending: false });

      if (clientFilter) query = query.eq("client_id", clientFilter);
      if (filterStatus !== "all") query = query.eq("status", filterStatus as any);
      if (filterType !== "all") query = query.eq("equipment_type_id", filterType);
      if (filterClient !== "all") query = query.eq("client_id", filterClient);

      const { data, error } = await query;
      if (error) throw error;
      const items = (data as any) || [];
      setEquipment(items);

      // Fetch all disks for these equipment IDs
      const ids = items.map((e: any) => e.id);
      if (ids.length > 0) {
        const { data: allDisks } = await supabase
          .from("equipment_disks")
          .select("equipment_id, drive_letter, disk_total_gb, disk_used_gb, disk_free_gb")
          .in("equipment_id", ids);
        
        const map: Record<string, { drive_letter: string; pct: number; used: number; total: number; free: number }> = {};
        for (const d of allDisks || []) {
          if (d.disk_total_gb && d.disk_total_gb > 0 && d.disk_used_gb != null) {
            const pct = Math.round((d.disk_used_gb / d.disk_total_gb) * 100);
            if (!map[d.equipment_id] || pct > map[d.equipment_id].pct) {
              map[d.equipment_id] = { drive_letter: d.drive_letter || "?", pct, used: d.disk_used_gb, total: d.disk_total_gb, free: d.disk_free_gb || 0 };
            }
          }
        }
        setDiskMap(map);
      } else {
        setDiskMap({});
      }
    } catch (error: any) {
      toast({ variant: "destructive", title: "Erro ao carregar equipamentos", description: error.message });
    } finally {
      setLoading(false);
    }
  };

  const fetchClients = async () => {
    const { data } = await supabase.from("clients").select("id, full_name").order("full_name");
    setClients(data || []);
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
        asset_tag: (formData as any).asset_tag || null,
        sector_id: formData.sector_id && formData.sector_id !== "none" ? formData.sector_id : null,
      };

      const { error } = await supabase.from("equipment_inventory").insert(insertData);
      if (error) throw error;

      toast({ title: "Equipamento cadastrado com sucesso!" });
      setFormData({ ...emptyForm });
      setIsDialogOpen(false);
      fetchEquipment();
    } catch (error: any) {
      toast({ variant: "destructive", title: "Erro ao cadastrar", description: error.message });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editTarget || !formData.name) return;
    setIsSubmitting(true);

    try {
      const updateData: any = {
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
        asset_tag: (formData as any).asset_tag || null,
        sector_id: formData.sector_id && formData.sector_id !== "none" ? formData.sector_id : null,
      };

      const { error } = await supabase.from("equipment_inventory").update(updateData).eq("id", editTarget.id);
      if (error) throw error;

      toast({ title: "Equipamento atualizado com sucesso!" });
      setEditTarget(null);
      setFormData({ ...emptyForm });
      fetchEquipment();
    } catch (error: any) {
      toast({ variant: "destructive", title: "Erro ao atualizar", description: error.message });
    } finally {
      setIsSubmitting(false);
    }
  };

  const openEdit = (item: Equipment) => {
    setFormData({
      name: item.name,
      equipment_type_id: item.equipment_type_id || "",
      brand: item.brand || "",
      model: item.model || "",
      serial_number: item.serial_number || "",
      client_id: item.client_id || "",
      sector_id: (item as any).sector_id || "",
      location: item.location || "",
      status: item.status,
      purchase_date: item.purchase_date || "",
      warranty_until: item.warranty_until || "",
      notes: item.notes || "",
      asset_tag: (item as any).asset_tag || "",
    });
    setEditTarget(item);
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      const { error } = await supabase.from("equipment_inventory").delete().eq("id", deleteTarget.id);
      if (error) throw error;
      toast({ title: "Equipamento excluído com sucesso!" });
      setDeleteTarget(null);
      fetchEquipment();
    } catch (error: any) {
      toast({ variant: "destructive", title: "Erro ao excluir", description: error.message });
    }
  };

  const getFilterLabels = () => {
    const typeName = filterType !== "all" ? equipmentTypes.find(t => t.id === filterType)?.name || filterType : "all";
    const clientName = filterClient !== "all" ? clients.find(c => c.id === filterClient)?.full_name || filterClient : "all";
    return { status: filterStatus, type: typeName, client: clientName };
  };

  // Equipment form fields (shared between create and edit)
  const renderFormFields = () => (
    <>
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
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2"><Label>Número de Série</Label><Input value={formData.serial_number} onChange={(e) => setFormData({ ...formData, serial_number: e.target.value })} /></div>
        <div className="space-y-2"><Label>Tombamento</Label><Input value={(formData as any).asset_tag} onChange={(e) => setFormData({ ...formData, asset_tag: e.target.value } as any)} /></div>
      </div>
      <div className="space-y-2">
        <Label>Cliente</Label>
        <Select value={formData.client_id} onValueChange={(v) => setFormData({ ...formData, client_id: v, sector_id: "" })}>
          <SelectTrigger><SelectValue placeholder="Selecionar cliente" /></SelectTrigger>
          <SelectContent>
            {clients.map((c) => (<SelectItem key={c.id} value={c.id}>{c.full_name}</SelectItem>))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label>Setor</Label>
        <SectorSelect
          clientId={formData.client_id || null}
          value={formData.sector_id || "none"}
          onValueChange={(v) => setFormData({ ...formData, sector_id: v === "none" ? "" : v })}
        />
      </div>
      <div className="space-y-2"><Label>Localização</Label><Input value={formData.location} onChange={(e) => setFormData({ ...formData, location: e.target.value })} /></div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2"><Label>Data de Compra</Label><Input type="date" value={formData.purchase_date} onChange={(e) => setFormData({ ...formData, purchase_date: e.target.value })} /></div>
        <div className="space-y-2"><Label>Garantia até</Label><Input type="date" value={formData.warranty_until} onChange={(e) => setFormData({ ...formData, warranty_until: e.target.value })} /></div>
      </div>
      <div className="space-y-2"><Label>Observações</Label><Textarea value={formData.notes} onChange={(e) => setFormData({ ...formData, notes: e.target.value })} /></div>
    </>
  );

  if (showPrint) {
    return <EquipmentInventoryPrint equipment={equipment} filters={getFilterLabels()} onClose={() => setShowPrint(false)} />;
  }

  return (
    <AdminLayout>
      <div className="space-y-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-display font-bold">Inventário de Equipamentos</h1>
            <p className="text-muted-foreground">Gerencie os equipamentos cadastrados</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setShowPrint(true)}>
              <FileText className="w-4 h-4 mr-2" />Gerar PDF
            </Button>
            <Button variant="outline" onClick={() => setIsApiDialogOpen(true)}>
              <Key className="w-4 h-4 mr-2" />Integração API
            </Button>
            <Dialog open={isDialogOpen} onOpenChange={(open) => { setIsDialogOpen(open); if (!open) setFormData({ ...emptyForm }); }}>
              <DialogTrigger asChild>
                <Button><Plus className="w-4 h-4 mr-2" />Novo Equipamento</Button>
              </DialogTrigger>
              <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
                <DialogHeader><DialogTitle>Cadastrar Equipamento</DialogTitle></DialogHeader>
                <form onSubmit={handleCreate} className="space-y-4">
                  {renderFormFields()}
                  <Button type="submit" className="w-full" disabled={isSubmitting}>
                    {isSubmitting ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Cadastrando...</> : "Cadastrar Equipamento"}
                  </Button>
                </form>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        <ApiIntegrationDialog open={isApiDialogOpen} onOpenChange={setIsApiDialogOpen} />

        {/* Edit Dialog */}
        <Dialog open={!!editTarget} onOpenChange={(open) => { if (!open) { setEditTarget(null); setFormData({ ...emptyForm }); } }}>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader><DialogTitle>Editar Equipamento</DialogTitle></DialogHeader>
            <form onSubmit={handleEdit} className="space-y-4">
              {renderFormFields()}
              <Button type="submit" className="w-full" disabled={isSubmitting}>
                {isSubmitting ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Salvando...</> : "Salvar Alterações"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>

        {/* Filters */}
        <div className="flex gap-4 flex-wrap">
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
          <Select value={filterClient} onValueChange={setFilterClient}>
            <SelectTrigger className="w-48"><SelectValue placeholder="Cliente" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os Clientes</SelectItem>
              {clients.map((c) => (<SelectItem key={c.id} value={c.id}>{c.full_name}</SelectItem>))}
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
              <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead>Tombamento</TableHead>
                    <TableHead>Cliente</TableHead>
                    <TableHead>Processador</TableHead>
                    <TableHead>Memória</TableHead>
                    <TableHead>Disco</TableHead>
                     <TableHead>Usuário Logado</TableHead>
                     <TableHead>Últ. Atualização Agente</TableHead>
                     <TableHead>Status</TableHead>
                     <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {equipment.map((item) => {
                    const worstDisk = diskMap[item.id];
                    const diskPercent = worstDisk ? worstDisk.pct
                      : (item.disk_total_gb && item.disk_used_gb ? Math.round((item.disk_used_gb / item.disk_total_gb) * 100) : null);
                    const diskColorClass = diskPercent != null
                      ? diskPercent > 90 ? "text-destructive font-bold" : diskPercent > 80 ? "text-destructive font-medium" : diskPercent > 60 ? "text-yellow-500 font-medium" : "text-muted-foreground"
                      : "text-muted-foreground";
                    return (
                      <TableRow key={item.id}>
                        <TableCell className="font-medium">{item.name}</TableCell>
                        <TableCell className="font-mono text-xs">{(item as any).asset_tag || "-"}</TableCell>
                        <TableCell>{item.client?.full_name || "-"}</TableCell>
                        <TableCell className="text-xs max-w-[150px] truncate" title={item.cpu || undefined}>
                          {item.cpu || "-"}
                        </TableCell>
                        <TableCell className="text-xs">
                          {item.ram_total_gb != null ? `${item.ram_total_gb} GB` : "-"}
                        </TableCell>
                        <TableCell className="text-xs">
                          {worstDisk ? (
                            <div className="space-y-0.5">
                              <div className={diskColorClass}>
                                {worstDisk.drive_letter}: {worstDisk.used}/{worstDisk.total} GB ({worstDisk.pct}%)
                              </div>
                              <div className="text-muted-foreground/60 text-[10px]">
                                {worstDisk.free} GB livre (pior disco)
                              </div>
                            </div>
                          ) : item.disk_total_gb != null ? (
                            <div className="space-y-0.5">
                              <div className={diskColorClass}>
                                {item.disk_used_gb ?? 0}/{item.disk_total_gb} GB ({diskPercent}%)
                              </div>
                              <div className="text-muted-foreground/60 text-[10px]">
                                {item.disk_free_gb != null ? `${item.disk_free_gb} GB livre` : ""}
                              </div>
                            </div>
                          ) : "-"}
                        </TableCell>
                        <TableCell className="text-xs">{item.logged_in_user || "-"}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className={statusColors[item.status] || ""}>
                            {statusLabels[item.status] || item.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right flex gap-1 justify-end">
                          <Button variant="ghost" size="sm" asChild>
                            <Link to={`/admin/inventory/${item.id}`}><Eye className="w-4 h-4 mr-1" />Ver</Link>
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => openEdit(item)}>
                            <Pencil className="w-4 h-4" />
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => setDeleteTarget(item)}>
                            <Trash2 className="w-4 h-4 text-destructive" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
              </div>
            )}
          </CardContent>
        </Card>

        <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Excluir equipamento</AlertDialogTitle>
              <AlertDialogDescription>
                Tem certeza que deseja excluir o equipamento <strong>{deleteTarget?.name}</strong>? Esta ação não pode ser desfeita.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                Excluir
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </AdminLayout>
  );
};

export default EquipmentInventory;
