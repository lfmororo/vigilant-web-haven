import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import AdminLayout from "@/components/admin/AdminLayout";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { ArrowLeft, Building2, Download, Pencil } from "lucide-react";
import { generateQuotePdf } from "@/lib/generateQuotePdf";

const statusMap: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  draft: { label: "Rascunho", variant: "secondary" },
  sent: { label: "Enviado", variant: "default" },
  approved: { label: "Aprovado", variant: "default" },
  rejected: { label: "Rejeitado", variant: "destructive" },
};

const QuoteDetail = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [quote, setQuote] = useState<any>(null);
  const [items, setItems] = useState<any[]>([]);
  const [sender, setSender] = useState<any>(null);
  const [client, setClient] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    const fetch = async () => {
      if (!id) return;
      const { data: q, error } = await supabase
        .from("quotes")
        .select("*")
        .eq("id", id)
        .single();

      if (error || !q) {
        toast({ title: "Orçamento não encontrado", variant: "destructive" });
        navigate("/admin/quotes");
        return;
      }
      setQuote(q);

      const [itemsRes, senderRes, clientRes] = await Promise.all([
        supabase.from("quote_items").select("*").eq("quote_id", id).order("item_order"),
        q.sender_profile_id
          ? supabase.from("quote_sender_profiles").select("*").eq("id", q.sender_profile_id).single()
          : { data: null },
        q.client_id
          ? supabase.from("clients").select("*").eq("id", q.client_id).single()
          : { data: null },
      ]);

      setItems(itemsRes.data || []);
      if (senderRes.data) setSender(senderRes.data);
      if (clientRes.data) setClient(clientRes.data);
      setLoading(false);
    };
    fetch();
  }, [id]);

  if (loading) {
    return (
      <AdminLayout>
        <p className="text-muted-foreground text-center py-12">Carregando...</p>
      </AdminLayout>
    );
  }

  if (!quote) return null;

  const st = statusMap[quote.status] || { label: quote.status, variant: "outline" as const };
  const total = items.reduce((sum: number, i: any) => sum + Number(i.quantity) * Number(i.unit_price), 0);

  const handleExportPdf = async () => {
    setExporting(true);
    try {
      const pdf = await generateQuotePdf({
        quoteNumber: quote.quote_number,
        title: quote.title,
        notes: quote.notes,
        validityDays: quote.validity_days || 30,
        createdAt: quote.created_at,
        sender,
        client,
        items: items.map((i: any) => ({
          description: i.description,
          quantity: Number(i.quantity),
          unit_price: Number(i.unit_price),
        })),
      });
      pdf.save(`Proposta_${String(quote.quote_number).padStart(4, "0")}.pdf`);
      toast({ title: "PDF exportado com sucesso!" });
    } catch (err: any) {
      toast({ title: "Erro ao gerar PDF", description: err.message, variant: "destructive" });
    }
    setExporting(false);
  };

  return (
    <AdminLayout>
      <div className="space-y-6 max-w-4xl">
        <div className="flex items-center gap-4">
          <Button variant="outline" size="icon" onClick={() => navigate("/admin/quotes")}>
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div className="flex-1">
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold">Orçamento #{quote.quote_number}</h1>
              <Badge variant={st.variant}>{st.label}</Badge>
            </div>
            <p className="text-muted-foreground">{quote.title || "Proposta Comercial"}</p>
          </div>
          <Button onClick={handleExportPdf} disabled={exporting}>
            <Download className="w-4 h-4 mr-2" />
            {exporting ? "Gerando..." : "Exportar PDF"}
          </Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Sender */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Empresa Emissora</CardTitle>
            </CardHeader>
            <CardContent>
              {sender ? (
                <div className="flex items-start gap-4">
                  {sender.logo_url ? (
                    <img src={sender.logo_url} alt={sender.trade_name} className="w-14 h-14 object-contain rounded border border-border p-1" />
                  ) : (
                    <div className="w-14 h-14 rounded border border-dashed border-border bg-muted flex items-center justify-center">
                      <Building2 className="w-6 h-6 text-muted-foreground" />
                    </div>
                  )}
                  <div className="text-sm space-y-1">
                    <p className="font-medium">{sender.trade_name}</p>
                    {sender.cnpj && <p className="text-muted-foreground">CNPJ: {sender.cnpj}</p>}
                    {sender.address && <p className="text-muted-foreground">{sender.address}</p>}
                    {sender.email && <p className="text-muted-foreground">{sender.email}</p>}
                  </div>
                </div>
              ) : (
                <p className="text-muted-foreground">—</p>
              )}
            </CardContent>
          </Card>

          {/* Client */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Cliente Destinatário</CardTitle>
            </CardHeader>
            <CardContent>
              {client ? (
                <div className="text-sm space-y-1">
                  <p className="font-medium">{client.full_name}</p>
                  {client.email && <p className="text-muted-foreground">{client.email}</p>}
                  {client.phone && <p className="text-muted-foreground">{client.phone}</p>}
                  {client.address && <p className="text-muted-foreground">{client.address}{client.address_number ? `, ${client.address_number}` : ""}</p>}
                  {client.city && <p className="text-muted-foreground">{client.city}</p>}
                </div>
              ) : (
                <p className="text-muted-foreground">—</p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Info */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Informações</CardTitle>
          </CardHeader>
          <CardContent className="text-sm space-y-2">
            <p><span className="text-muted-foreground">Validade:</span> {quote.validity_days} dias</p>
            <p><span className="text-muted-foreground">Criado em:</span> {new Date(quote.created_at).toLocaleDateString("pt-BR")}</p>
            {quote.notes && <p><span className="text-muted-foreground">Observações:</span> {quote.notes}</p>}
          </CardContent>
        </Card>

        {/* Items */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Itens</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[50%]">Descrição</TableHead>
                  <TableHead>Qtd</TableHead>
                  <TableHead>Valor Unit.</TableHead>
                  <TableHead>Subtotal</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell>{item.description}</TableCell>
                    <TableCell>{Number(item.quantity)}</TableCell>
                    <TableCell>R$ {Number(item.unit_price).toFixed(2)}</TableCell>
                    <TableCell className="font-medium">R$ {(Number(item.quantity) * Number(item.unit_price)).toFixed(2)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <div className="flex justify-end mt-4 text-lg font-bold">
              Total: R$ {total.toFixed(2)}
            </div>
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
};

export default QuoteDetail;
