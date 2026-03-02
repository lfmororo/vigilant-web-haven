import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import HelpdeskLayout from "@/components/helpdesk/HelpdeskLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Loader2 } from "lucide-react";

const statusMap: Record<string, { label: string; className: string }> = {
  draft: { label: "Rascunho", className: "bg-muted text-muted-foreground" },
  in_progress: { label: "Em Andamento", className: "bg-yellow-500/20 text-yellow-400" },
  completed: { label: "Concluída", className: "bg-green-500/20 text-green-400" },
  cancelled: { label: "Cancelada", className: "bg-destructive/20 text-destructive" },
};

const ClientServiceOrders = () => {
  const { user } = useAuth();
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    // Get parent_client_id from profile, then fetch service orders for that client
    supabase.from("profiles").select("parent_client_id").eq("id", user.id).maybeSingle()
      .then(({ data }) => {
        const clientId = data?.parent_client_id;
        if (!clientId) { setLoading(false); return; }
        
        supabase.from("service_orders").select("*").eq("client_id", clientId)
          .order("created_at", { ascending: false })
          .then(({ data: orderData }) => { setOrders(orderData || []); setLoading(false); });
      });
  }, [user]);

  return (
    <HelpdeskLayout>
      <div className="space-y-6">
        <h1 className="text-2xl font-display font-bold">Ordens de Serviço</h1>
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
                    <TableHead>Status</TableHead>
                    <TableHead>Diagnóstico</TableHead>
                    <TableHead>Custo Total</TableHead>
                    <TableHead>Data</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {orders.length === 0 ? (
                    <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">Nenhuma ordem de serviço</TableCell></TableRow>
                  ) : orders.map((o) => {
                    const s = statusMap[o.status] || statusMap.draft;
                    return (
                      <TableRow key={o.id}>
                        <TableCell className="font-mono text-xs">{o.order_number}</TableCell>
                        <TableCell><Badge variant="outline" className={s.className}>{s.label}</Badge></TableCell>
                        <TableCell className="max-w-[200px] truncate">{o.diagnosis || "-"}</TableCell>
                        <TableCell>{o.total_cost ? `R$ ${Number(o.total_cost).toFixed(2)}` : "-"}</TableCell>
                        <TableCell className="text-muted-foreground">{new Date(o.created_at).toLocaleDateString("pt-BR")}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </HelpdeskLayout>
  );
};

export default ClientServiceOrders;
