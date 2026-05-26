import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import AdminLayout from "@/components/admin/AdminLayout";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { Plus, Trash2, ArrowLeft, Save } from "lucide-react";

interface QuoteItem {
  id: string;
  description: string;
  quantity: number;
  unit_price: number;
}

interface SenderProfile {
  id: string;
  trade_name: string;
  logo_url: string | null;
}

interface Client {
  id: string;
  full_name: string;
}

const CreateQuote = () => {
  const { toast } = useToast();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { id: editId } = useParams<{ id: string }>();
  const isEditing = !!editId;

  const [saving, setSaving] = useState(false);
  const [loadingQuote, setLoadingQuote] = useState(isEditing);

  const [senderProfiles, setSenderProfiles] = useState<SenderProfile[]>([]);
  const [clients, setClients] = useState<Client[]>([]);

  const [senderProfileId, setSenderProfileId] = useState("");
  const [clientId, setClientId] = useState("");
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [validityDays, setValidityDays] = useState(30);

  const [status, setStatus] = useState("draft");
  const [items, setItems] = useState<QuoteItem[]>([
    { id: crypto.randomUUID(), description: "", quantity: 1, unit_price: 0 },
  ]);

  useEffect(() => {
    const fetchData = async () => {
      const [sendersRes, clientsRes] = await Promise.all([
        supabase.from("quote_sender_profiles").select("id, trade_name, logo_url").order("trade_name"),
        supabase.from("clients").select("id, full_name").order("full_name"),
      ]);
      if (sendersRes.data) setSenderProfiles(sendersRes.data);
      if (clientsRes.data) setClients(clientsRes.data);

      // Load existing quote for editing
      if (editId) {
        const { data: q, error } = await supabase
          .from("quotes")
          .select("*")
          .eq("id", editId)
          .single();

        if (error || !q) {
          toast({ title: "Orçamento não encontrado", variant: "destructive" });
          navigate("/admin/quotes");
          return;
        }

        setSenderProfileId(q.sender_profile_id || "");
        setClientId(q.client_id || "");
        setTitle(q.title || "");
        setNotes(q.notes || "");
        setValidityDays(q.validity_days || 30);
        setStatus(q.status || "draft");

        const { data: existingItems } = await supabase
          .from("quote_items")
          .select("*")
          .eq("quote_id", editId)
          .order("item_order");

        if (existingItems && existingItems.length > 0) {
          setItems(
            existingItems.map((i) => ({
              id: i.id,
              description: i.description,
              quantity: Number(i.quantity),
              unit_price: Number(i.unit_price),
            }))
          );
        }
        setLoadingQuote(false);
      }
    };
    fetchData();
  }, [editId]);

  const addItem = () => {
    setItems([...items, { id: crypto.randomUUID(), description: "", quantity: 1, unit_price: 0 }]);
  };

  const removeItem = (id: string) => {
    if (items.length <= 1) return;
    setItems(items.filter((i) => i.id !== id));
  };

  const updateItem = (id: string, field: keyof QuoteItem, value: string | number) => {
    setItems(items.map((i) => (i.id === id ? { ...i, [field]: value } : i)));
  };

  const totalQuote = items.reduce((sum, i) => sum + i.quantity * i.unit_price, 0);

  const handleSave = async () => {
    if (!senderProfileId) {
      toast({ title: "Selecione a empresa emissora", variant: "destructive" });
      return;
    }
    if (!clientId) {
      toast({ title: "Selecione o cliente destinatário", variant: "destructive" });
      return;
    }
    if (items.some((i) => !i.description.trim())) {
      toast({ title: "Preencha a descrição de todos os itens", variant: "destructive" });
      return;
    }

    setSaving(true);

    const payload = {
      sender_profile_id: senderProfileId,
      client_id: clientId,
      title: title.trim() || "Proposta Comercial",
      notes: notes.trim() || null,
      validity_days: validityDays,
      total: totalQuote,
      status: status,
    };

    let quoteId = editId;

    if (isEditing) {
      const { error } = await supabase.from("quotes").update(payload).eq("id", editId);
      if (error) {
        toast({ title: "Erro ao atualizar orçamento", description: error.message, variant: "destructive" });
        setSaving(false);
        return;
      }

      // Delete old items and re-insert
      await supabase.from("quote_items").delete().eq("quote_id", editId);
    } else {
      const { data: quote, error: quoteError } = await supabase
        .from("quotes")
        .insert({ ...payload, created_by: user?.id })
        .select("id")
        .single();

      if (quoteError || !quote) {
        toast({ title: "Erro ao criar orçamento", description: quoteError?.message, variant: "destructive" });
        setSaving(false);
        return;
      }
      quoteId = quote.id;
    }

    const itemsPayload = items.map((i, idx) => ({
      quote_id: quoteId!,
      description: i.description.trim(),
      quantity: i.quantity,
      unit_price: i.unit_price,
      item_order: idx,
    }));

    const { error: itemsError } = await supabase.from("quote_items").insert(itemsPayload);

    if (itemsError) {
      toast({ title: "Erro ao salvar itens", description: itemsError.message, variant: "destructive" });
    } else {
      toast({ title: isEditing ? "Orçamento atualizado!" : "Orçamento criado com sucesso!" });
      navigate(isEditing ? `/admin/quotes/${editId}` : "/admin/quotes");
    }

    setSaving(false);
  };

  if (loadingQuote) {
    return (
      <AdminLayout>
        <p className="text-muted-foreground text-center py-12">Carregando orçamento...</p>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="space-y-6 max-w-4xl">
        <div className="flex items-center gap-4">
          <Button variant="outline" size="icon" onClick={() => navigate(isEditing ? `/admin/quotes/${editId}` : "/admin/quotes")}>
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold">{isEditing ? "Editar Orçamento" : "Novo Orçamento"}</h1>
            <p className="text-muted-foreground">{isEditing ? "Altere os dados da proposta" : "Crie uma proposta comercial"}</p>
          </div>
        </div>

        {/* Sender & Recipient */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Empresa Emissora</CardTitle>
            </CardHeader>
            <CardContent>
              <Select value={senderProfileId} onValueChange={setSenderProfileId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione a empresa emissora" />
                </SelectTrigger>
                <SelectContent>
                  {senderProfiles.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.trade_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Cliente Destinatário</CardTitle>
            </CardHeader>
            <CardContent>
              <Select value={clientId} onValueChange={setClientId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o cliente" />
                </SelectTrigger>
                <SelectContent>
                  {clients.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.full_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </CardContent>
          </Card>
        </div>

        {/* Details */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Detalhes do Orçamento</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="title">Título da Proposta</Label>
                <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Proposta Comercial" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="validity">Validade (dias)</Label>
                <Input id="validity" type="number" value={validityDays} onChange={(e) => setValidityDays(Number(e.target.value))} min={1} />
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="status">Status</Label>
                <Select value={status} onValueChange={setStatus}>
                  <SelectTrigger id="status">
                    <SelectValue placeholder="Selecione o status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="draft">Rascunho</SelectItem>
                    <SelectItem value="sent">Enviado</SelectItem>
                    <SelectItem value="approved">Aprovado</SelectItem>
                    <SelectItem value="rejected">Rejeitado</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="notes">Observações</Label>
              <Textarea id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Condições de pagamento, prazos, etc." rows={3} />
            </div>
          </CardContent>
        </Card>

        {/* Items */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">Itens do Orçamento</CardTitle>
            <Button size="sm" variant="outline" onClick={addItem}>
              <Plus className="w-4 h-4 mr-1" />
              Adicionar Item
            </Button>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[50%]">Descrição</TableHead>
                  <TableHead>Qtd</TableHead>
                  <TableHead>Valor Unit.</TableHead>
                  <TableHead>Subtotal</TableHead>
                  <TableHead className="w-10"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell>
                      <Input value={item.description} onChange={(e) => updateItem(item.id, "description", e.target.value)} placeholder="Descrição do item/serviço" />
                    </TableCell>
                    <TableCell>
                      <Input type="number" className="w-20" value={item.quantity} onChange={(e) => updateItem(item.id, "quantity", Number(e.target.value))} min={0.01} step={0.01} />
                    </TableCell>
                    <TableCell>
                      <Input type="number" className="w-28" value={item.unit_price} onChange={(e) => updateItem(item.id, "unit_price", Number(e.target.value))} min={0} step={0.01} />
                    </TableCell>
                    <TableCell className="font-medium">R$ {(item.quantity * item.unit_price).toFixed(2)}</TableCell>
                    <TableCell>
                      <Button size="icon" variant="ghost" onClick={() => removeItem(item.id)} disabled={items.length <= 1}>
                        <Trash2 className="w-4 h-4 text-destructive" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <div className="flex justify-end mt-4 text-lg font-bold">
              Total: R$ {totalQuote.toFixed(2)}
            </div>
          </CardContent>
        </Card>

        {/* Actions */}
        <div className="flex justify-end gap-3">
          <Button variant="outline" onClick={() => navigate(isEditing ? `/admin/quotes/${editId}` : "/admin/quotes")}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            <Save className="w-4 h-4 mr-2" />
            {saving ? "Salvando..." : isEditing ? "Salvar Alterações" : "Salvar Orçamento"}
          </Button>
        </div>
      </div>
    </AdminLayout>
  );
};

export default CreateQuote;
