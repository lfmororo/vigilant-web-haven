import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import AdminLayout from "@/components/admin/AdminLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Plus, Loader2 } from "lucide-react";

const statusMap: Record<string, { label: string; className: string }> = {
  draft: { label: "Rascunho", className: "bg-muted text-muted-foreground" },
  in_progress: { label: "Em Andamento", className: "bg-yellow-500/20 text-yellow-400" },
  completed: { label: "Concluída", className: "bg-green-500/20 text-green-400" },
  cancelled: { label: "Cancelada", className: "bg-destructive/20 text-destructive" },
};

const AdminServiceOrders = () => {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [clients, setClients] = useState<any[]>([]);
  const [selectedClient, setSelectedClient] = useState("");
  const [creating, setCreating] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);

  useEffect(() => {
    supabase.from("service_orders")
      .select("*, client:clients!service_orders_client_id_fkey(full_name), technician:profiles!service_orders_technician_id_fkey(full_name)")
      .order("created_at", { ascending: false })
      .then(({ data }) => { setOrders(data || []); setLoading(false); });
    supabase.from("profiles").select("id, full_name").then(({ data }) => setClients(data || []));
  }, []);

  const createOrder = async () => {
    if (!selectedClient) return;
    setCreating(true);
    const { data, error } = await supabase.from("service_orders").insert({ client_id: selectedClient }).select().single();
    if (error) toast({ variant: "destructive", title: "Erro", description: error.message });
    else { setDialogOpen(false); navigate(`/admin/service-orders/${data.id}`); }
    setCreating(false);
  };

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-display font-bold">Ordens de Serviço</h1>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild><Button><Plus className="w-4 h-4 mr-2" />Nova OS</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Nova Ordem de Serviço</DialogTitle></DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Cliente</Label>
                  <Select value={selectedClient} onValueChange={setSelectedClient}>
                    <SelectTrigger><SelectValue placeholder="Selecione o cliente" /></SelectTrigger>
                    <SelectContent>
                      {clients.map((c) => <SelectItem key={c.id} value={c.id}>{c.full_name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <Button onClick={createOrder} disabled={!selectedClient || creating} className="w-full">
                  {creating && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}Criar OS
                </Button>
              </div>
            </DialogContent>
          </Dialog>
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
                    <TableHead>Cliente</TableHead>
                    <TableHead>Técnico</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Custo Total</TableHead>
                    <TableHead>Data</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {orders.length === 0 ? (
                    <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">Nenhuma OS encontrada</TableCell></TableRow>
                  ) : orders.map((o) => {
                    const s = statusMap[o.status] || statusMap.draft;
                    return (
                      <TableRow key={o.id} className="cursor-pointer hover:bg-muted/50" onClick={() => navigate(`/admin/service-orders/${o.id}`)}>
                        <TableCell className="font-mono text-xs">{o.order_number}</TableCell>
                        <TableCell>{o.client?.full_name || "-"}</TableCell>
                        <TableCell className="text-muted-foreground">{o.technician?.full_name || "Não atribuído"}</TableCell>
                        <TableCell><Badge variant="outline" className={s.className}>{s.label}</Badge></TableCell>
                        <TableCell>{o.total_cost ? `R$ ${Number(o.total_cost).toFixed(2)}` : "-"}</TableCell>
                        <TableCell className="text-muted-foreground">{new Date(o.created_at).toLocaleDateString("pt-BR")}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
};

export default AdminServiceOrders;
