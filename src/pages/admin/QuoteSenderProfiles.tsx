import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import AdminLayout from "@/components/admin/AdminLayout";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, FileText, Trash2, Eye, Building2, Pencil } from "lucide-react";
import QuoteSenderProfilesTab from "@/components/admin/quotes/QuoteSenderProfilesTab";

interface Quote {
  id: string;
  quote_number: number;
  title: string;
  status: string;
  total: number;
  validity_days: number;
  created_at: string;
  sender_profile: { trade_name: string } | null;
  client: { full_name: string } | null;
}

const statusMap: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  draft: { label: "Rascunho", variant: "secondary" },
  sent: { label: "Enviado", variant: "default" },
  approved: { label: "Aprovado", variant: "default" },
  rejected: { label: "Rejeitado", variant: "destructive" },
};

const QuotesManagement = () => {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const fetchQuotes = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("quotes")
      .select("id, quote_number, title, status, total, validity_days, created_at, sender_profile_id, client_id")
      .order("created_at", { ascending: false });

    if (error) {
      toast({ title: "Erro ao carregar orçamentos", description: error.message, variant: "destructive" });
      setLoading(false);
      return;
    }

    // Fetch sender and client names
    const senderIds = [...new Set((data || []).map((q) => q.sender_profile_id).filter(Boolean))];
    const clientIds = [...new Set((data || []).map((q) => q.client_id).filter(Boolean))];

    const [sendersRes, clientsRes] = await Promise.all([
      senderIds.length > 0
        ? supabase.from("quote_sender_profiles").select("id, trade_name").in("id", senderIds)
        : { data: [] },
      clientIds.length > 0
        ? supabase.from("clients").select("id, full_name").in("id", clientIds)
        : { data: [] },
    ]);

    const sendersMap = new Map((sendersRes.data || []).map((s) => [s.id, s.trade_name]));
    const clientsMap = new Map((clientsRes.data || []).map((c) => [c.id, c.full_name]));

    const enriched: Quote[] = (data || []).map((q) => ({
      id: q.id,
      quote_number: q.quote_number,
      title: q.title,
      status: q.status,
      total: Number(q.total) || 0,
      validity_days: q.validity_days || 30,
      created_at: q.created_at || "",
      sender_profile: q.sender_profile_id ? { trade_name: sendersMap.get(q.sender_profile_id) || "—" } : null,
      client: q.client_id ? { full_name: clientsMap.get(q.client_id) || "—" } : null,
    }));

    setQuotes(enriched);
    setLoading(false);
  };

  useEffect(() => {
    fetchQuotes();
  }, []);

  const handleDelete = async () => {
    if (!deleteId) return;
    const { error } = await supabase.from("quotes").delete().eq("id", deleteId);
    if (error) {
      toast({ title: "Erro ao excluir", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Orçamento excluído" });
      fetchQuotes();
    }
    setDeleteId(null);
  };

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-2xl font-bold">Orçamentos</h1>
            <p className="text-muted-foreground">Gerencie propostas comerciais e empresas emissoras</p>
          </div>
          <Button onClick={() => navigate("/admin/quotes/new")}>
            <Plus className="w-4 h-4 mr-2" />
            Novo Orçamento
          </Button>
        </div>

        <Tabs defaultValue="quotes">
          <TabsList>
            <TabsTrigger value="quotes">
              <FileText className="w-4 h-4 mr-2" />
              Orçamentos
            </TabsTrigger>
            <TabsTrigger value="senders">
              <Building2 className="w-4 h-4 mr-2" />
              Empresas Emissoras
            </TabsTrigger>
          </TabsList>

          <TabsContent value="quotes" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle>Orçamentos Criados</CardTitle>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <p className="text-muted-foreground text-center py-8">Carregando...</p>
                ) : quotes.length === 0 ? (
                  <p className="text-muted-foreground text-center py-8">
                    Nenhum orçamento criado. Clique em "Novo Orçamento" para começar.
                  </p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Nº</TableHead>
                        <TableHead>Título</TableHead>
                        <TableHead>Emissora</TableHead>
                        <TableHead>Cliente</TableHead>
                        <TableHead>Total</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Data</TableHead>
                        <TableHead className="text-right">Ações</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {quotes.map((q) => {
                        const st = statusMap[q.status] || { label: q.status, variant: "outline" as const };
                        return (
                          <TableRow key={q.id}>
                            <TableCell className="font-mono">#{q.quote_number}</TableCell>
                            <TableCell className="font-medium">{q.title || "Proposta Comercial"}</TableCell>
                            <TableCell>{q.sender_profile?.trade_name || "—"}</TableCell>
                            <TableCell>{q.client?.full_name || "—"}</TableCell>
                            <TableCell>R$ {q.total.toFixed(2)}</TableCell>
                            <TableCell>
                              <Badge variant={st.variant}>{st.label}</Badge>
                            </TableCell>
                            <TableCell className="text-sm">
                              {new Date(q.created_at).toLocaleDateString("pt-BR")}
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex justify-end gap-2">
                                <Button size="sm" variant="outline" onClick={() => navigate(`/admin/quotes/${q.id}`)}>
                                  <Eye className="w-4 h-4" />
                                </Button>
                                <Button size="sm" variant="outline" onClick={() => navigate(`/admin/quotes/${q.id}/edit`)}>
                                  <Pencil className="w-4 h-4" />
                                </Button>
                                <Button size="sm" variant="destructive" onClick={() => setDeleteId(q.id)}>
                                  <Trash2 className="w-4 h-4" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="senders" className="mt-4">
            <QuoteSenderProfilesTab />
          </TabsContent>
        </Tabs>
      </div>

      <AlertDialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar exclusão</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir este orçamento? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AdminLayout>
  );
};

export default QuotesManagement;
