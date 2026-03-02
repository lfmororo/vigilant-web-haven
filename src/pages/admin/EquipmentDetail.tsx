import { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import AdminLayout from "@/components/admin/AdminLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { ArrowLeft, Loader2, Cpu, MemoryStick, HardDrive } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
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
  const [disks, setDisks] = useState<any[]>([]);
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
      .select("*, client:clients!equipment_inventory_client_id_fkey(full_name, email), equipment_type:equipment_types!equipment_inventory_equipment_type_id_fkey(name)")
      .eq("id", id!)
      .single();

    setEquipment(data);

    // Fetch individual disks
    if (data?.id) {
      const { data: diskData } = await supabase
        .from("equipment_disks")
        .select("*")
        .eq("equipment_id", data.id)
        .order("drive_letter");
      setDisks(diskData || []);
    }
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
              {equipment.asset_tag ? `Tombamento: ${equipment.asset_tag}` : equipment.equipment_type?.name || "Sem tipo"} — {equipment.client?.full_name || "Sem cliente"}
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
                <div><span className="text-muted-foreground">Tombamento:</span><p className="font-mono">{equipment.asset_tag || "-"}</p></div>
                <div><span className="text-muted-foreground">Tipo:</span><p>{equipment.equipment_type?.name || "-"}</p></div>
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

        {/* Hardware Resources */}
        {(equipment.cpu || equipment.ram_total_gb || equipment.disk_total_gb || disks.length > 0) && (() => {
          return (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm flex items-center gap-2">
                  <Cpu className="w-4 h-4" /> Recursos de Hardware
                  {equipment.hardware_updated_at && (
                    <span className="text-xs text-muted-foreground font-normal ml-auto">
                      Última atualização: {format(new Date(equipment.hardware_updated_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                    </span>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 text-sm">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  {equipment.cpu && (
                    <div className="flex items-start gap-2">
                      <Cpu className="w-4 h-4 mt-0.5 text-muted-foreground shrink-0" />
                      <div>
                        <p className="text-muted-foreground text-xs">Processador</p>
                        <p className="font-medium">{equipment.cpu}</p>
                      </div>
                    </div>
                  )}
                  {equipment.ram_total_gb && (
                    <div className="flex items-start gap-2">
                      <MemoryStick className="w-4 h-4 mt-0.5 text-muted-foreground shrink-0" />
                      <div>
                        <p className="text-muted-foreground text-xs">Memória RAM</p>
                        <p className="font-medium">{equipment.ram_total_gb} GB</p>
                      </div>
                    </div>
                  )}
                  {equipment.disk_total_gb && (
                    <div className="flex items-start gap-2">
                      <HardDrive className="w-4 h-4 mt-0.5 text-muted-foreground shrink-0" />
                      <div>
                        <p className="text-muted-foreground text-xs">Disco Total (todos)</p>
                        <p className="font-medium">{equipment.disk_total_gb} GB</p>
                      </div>
                    </div>
                  )}
                </div>

                {/* Individual disks */}
                {disks.length > 0 ? (
                  <div className="space-y-3 pt-2 border-t border-border">
                    <p className="text-xs text-muted-foreground font-medium">Discos Individuais</p>
                    {disks.map((d: any) => {
                      const pct = d.disk_total_gb > 0 ? Math.round((d.disk_used_gb / d.disk_total_gb) * 100) : null;
                      const colorClass = pct == null ? "" : pct > 90 ? "[&>div]:bg-destructive" : pct > 80 ? "[&>div]:bg-yellow-500" : "[&>div]:bg-green-500";
                      return (
                        <div key={d.id} className="space-y-1">
                          <div className="flex justify-between text-xs">
                            <span className="font-medium">
                              <HardDrive className="w-3 h-3 inline mr-1" />
                              {d.drive_letter || "?"}{d.label ? ` (${d.label})` : ""}{d.file_system ? ` — ${d.file_system}` : ""}
                            </span>
                            <span className="text-muted-foreground">{d.disk_total_gb} GB</span>
                          </div>
                          {pct !== null && (
                            <>
                              <Progress value={pct} className={`h-2 ${colorClass}`} />
                              <div className="flex justify-between text-xs text-muted-foreground">
                                <span>
                                  Usado: {d.disk_used_gb} GB
                                  <span className={pct > 90 ? " text-destructive font-bold" : pct > 80 ? " text-yellow-500 font-medium" : " text-green-500 font-medium"}> ({pct}%)</span>
                                </span>
                                <span>Livre: {d.disk_free_gb} GB</span>
                              </div>
                            </>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ) : equipment.disk_total_gb > 0 && (() => {
                  const diskPct = Math.round((equipment.disk_used_gb / equipment.disk_total_gb) * 100);
                  const diskColor = diskPct > 80 ? "[&>div]:bg-destructive" : diskPct > 60 ? "[&>div]:bg-yellow-500" : "[&>div]:bg-green-500";
                  return (
                    <div className="space-y-2">
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span>
                          Usado: {equipment.disk_used_gb ?? "-"} GB
                          <span className={diskPct > 80 ? " text-destructive font-bold" : diskPct > 60 ? " text-yellow-500 font-medium" : " text-green-500 font-medium"}> ({diskPct}%)</span>
                        </span>
                        <span>Livre: {equipment.disk_free_gb ?? "-"} GB</span>
                      </div>
                      <Progress value={diskPct} className={`h-2 ${diskColor}`} />
                    </div>
                  );
                })()}
              </CardContent>
            </Card>
          );
        })()}

        {/* Tickets relacionados */}
        <Card>
          <CardHeader><CardTitle className="text-sm">Tickets Relacionados</CardTitle></CardHeader>
          <CardContent>
            {tickets.length === 0 ? (
              <p className="text-center text-muted-foreground py-4">Nenhum ticket relacionado</p>
            ) : (
              <div className="overflow-x-auto">
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
              </div>
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
              <div className="overflow-x-auto">
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
