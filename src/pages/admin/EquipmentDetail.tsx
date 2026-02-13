import { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import AdminLayout from "@/components/admin/AdminLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, Loader2 } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import TicketStatusBadge from "@/components/helpdesk/TicketStatusBadge";
import PriorityBadge from "@/components/helpdesk/PriorityBadge";

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

const EquipmentDetail = () => {
  const { id } = useParams<{ id: string }>();
  const [equipment, setEquipment] = useState<any>(null);
  const [tickets, setTickets] = useState<any[]>([]);
  const [serviceOrders, setServiceOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    fetchEquipment();
  }, [id]);

  const fetchEquipment = async () => {
    const { data } = await supabase
      .from("equipment_inventory")
      .select("*, client:profiles!equipment_inventory_client_id_fkey(full_name, email), equipment_type:equipment_types!equipment_inventory_equipment_type_id_fkey(name)")
      .eq("id", id!)
      .single();

    setEquipment(data);

    if (data?.client_id && data?.equipment_type_id) {
      const { data: ticketData } = await supabase
        .from("tickets")
        .select("*")
        .eq("client_id", data.client_id)
        .eq("equipment_type_id", data.equipment_type_id)
        .order("created_at", { ascending: false });
      setTickets(ticketData || []);
    }

    if (data?.client_id) {
      const { data: osData } = await supabase
        .from("service_orders")
        .select("*")
        .eq("client_id", data.client_id)
        .order("created_at", { ascending: false })
        .limit(10);
      setServiceOrders(osData || []);
    }

    setLoading(false);
  };

  if (loading) return <AdminLayout><div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div></AdminLayout>;
  if (!equipment) return <AdminLayout><p className="text-center text-muted-foreground py-12">Equipamento não encontrado</p></AdminLayout>;

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Link to="/admin/inventory"><Button variant="ghost" size="icon"><ArrowLeft className="w-5 h-5" /></Button></Link>
          <div className="flex-1">
            <h1 className="text-2xl font-display font-bold">{equipment.name}</h1>
            <p className="text-sm text-muted-foreground">
              {equipment.equipment_type?.name} — {equipment.client?.full_name || "Sem cliente"}
            </p>
          </div>
          <Badge variant="outline" className={statusColors[equipment.status] || ""}>
            {statusLabels[equipment.status] || equipment.status}
          </Badge>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader><CardTitle className="text-sm">Informações do Equipamento</CardTitle></CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-y-3">
                <div><span className="text-muted-foreground">Marca:</span><p>{equipment.brand || "-"}</p></div>
                <div><span className="text-muted-foreground">Modelo:</span><p>{equipment.model || "-"}</p></div>
                <div><span className="text-muted-foreground">Nº Série:</span><p className="font-mono">{equipment.serial_number || "-"}</p></div>
                <div><span className="text-muted-foreground">Localização:</span><p>{equipment.location || "-"}</p></div>
                <div><span className="text-muted-foreground">Data de Compra:</span><p>{equipment.purchase_date ? new Date(equipment.purchase_date).toLocaleDateString("pt-BR") : "-"}</p></div>
                <div><span className="text-muted-foreground">Garantia até:</span><p>{equipment.warranty_until ? new Date(equipment.warranty_until).toLocaleDateString("pt-BR") : "-"}</p></div>
              </div>
              {equipment.notes && <div><span className="text-muted-foreground">Observações:</span><p className="mt-1">{equipment.notes}</p></div>}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-sm">Cliente</CardTitle></CardHeader>
            <CardContent className="text-sm">
              {equipment.client ? (
                <div>
                  <p className="font-medium">{equipment.client.full_name}</p>
                  <p className="text-muted-foreground">{equipment.client.email}</p>
                </div>
              ) : (
                <p className="text-muted-foreground">Nenhum cliente associado</p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Tickets relacionados */}
        <Card>
          <CardHeader><CardTitle className="text-sm">Tickets Relacionados</CardTitle></CardHeader>
          <CardContent>
            {tickets.length === 0 ? (
              <p className="text-center text-muted-foreground py-4">Nenhum ticket relacionado</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>#</TableHead>
                    <TableHead>Título</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Prioridade</TableHead>
                    <TableHead>Data</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {tickets.map((t) => (
                    <TableRow key={t.id}>
                      <TableCell className="font-mono">{t.ticket_number}</TableCell>
                      <TableCell>
                        <Link to={`/admin/tickets/${t.id}`} className="text-primary hover:underline">{t.title}</Link>
                      </TableCell>
                      <TableCell><TicketStatusBadge status={t.status} /></TableCell>
                      <TableCell><PriorityBadge priority={t.priority} /></TableCell>
                      <TableCell>{new Date(t.created_at).toLocaleDateString("pt-BR")}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* OS relacionadas */}
        <Card>
          <CardHeader><CardTitle className="text-sm">Ordens de Serviço Relacionadas</CardTitle></CardHeader>
          <CardContent>
            {serviceOrders.length === 0 ? (
              <p className="text-center text-muted-foreground py-4">Nenhuma OS relacionada</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>#</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Data</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {serviceOrders.map((os) => (
                    <TableRow key={os.id}>
                      <TableCell className="font-mono">{os.order_number}</TableCell>
                      <TableCell>
                        <Link to={`/admin/service-orders/${os.id}`} className="text-primary hover:underline">
                          {os.status}
                        </Link>
                      </TableCell>
                      <TableCell>{new Date(os.created_at).toLocaleDateString("pt-BR")}</TableCell>
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

export default EquipmentDetail;
