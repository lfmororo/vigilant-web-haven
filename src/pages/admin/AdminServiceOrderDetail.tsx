import { useEffect, useState, useRef } from "react";
import { useParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import AdminLayout from "@/components/admin/AdminLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Loader2, Plus, Trash2, Save, Printer } from "lucide-react";
import ServiceOrderPrint from "@/components/admin/ServiceOrderPrint";

interface Part {
  name: string;
  qty: number;
  cost: number;
}

const AdminServiceOrderDetail = () => {
  const { id } = useParams<{ id: string }>();
  const { toast } = useToast();
  const [order, setOrder] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [technicians, setTechnicians] = useState<any[]>([]);
  const [showPrint, setShowPrint] = useState(false);
  const [form, setForm] = useState({
    status: "draft",
    diagnosis: "",
    solution: "",
    labor_cost: 0,
    travel_cost: 0,
    notes: "",
    technician_id: "",
    parts_used: [] as Part[],
    service_description: "",
    equipment_removed: "",
    material_used: "",
    checked_by: "",
    technician_signature: "",
    arrival_date: "",
    departure_date: "",
  });

  const fetchOrder = () => {
    if (!id) return;
    supabase.from("service_orders")
      .select("*, client:profiles!service_orders_client_id_fkey(full_name, email, phone, address, address_number, address_complement, neighborhood, city), technician:profiles!service_orders_technician_id_fkey(full_name)")
      .eq("id", id).single()
      .then(({ data }) => {
        if (data) {
          setOrder(data);
          setForm({
            status: data.status,
            diagnosis: data.diagnosis || "",
            solution: data.solution || "",
            labor_cost: Number(data.labor_cost) || 0,
            travel_cost: Number((data as any).travel_cost) || 0,
            notes: data.notes || "",
            technician_id: data.technician_id || "",
            parts_used: (data.parts_used as unknown as Part[]) || [],
            service_description: (data as any).service_description || "",
            equipment_removed: (data as any).equipment_removed || "",
            material_used: (data as any).material_used || "",
            checked_by: (data as any).checked_by || "",
            technician_signature: (data as any).technician_signature || "",
            arrival_date: (data as any).arrival_date ? new Date((data as any).arrival_date).toISOString().slice(0, 16) : "",
            departure_date: (data as any).departure_date ? new Date((data as any).departure_date).toISOString().slice(0, 16) : "",
          });
        }
        setLoading(false);
      });
  };

  useEffect(() => {
    fetchOrder();
    supabase.from("profiles").select("id, full_name").then(({ data }) => setTechnicians(data || []));
  }, [id]);

  const partsCost = form.parts_used.reduce((sum, p) => sum + p.qty * p.cost, 0);
  const totalCost = partsCost + form.labor_cost + form.travel_cost;

  const addPart = () => setForm({ ...form, parts_used: [...form.parts_used, { name: "", qty: 1, cost: 0 }] });
  const removePart = (i: number) => setForm({ ...form, parts_used: form.parts_used.filter((_, idx) => idx !== i) });
  const updatePart = (i: number, field: keyof Part, value: string | number) => {
    const parts = [...form.parts_used];
    (parts[i] as any)[field] = value;
    setForm({ ...form, parts_used: parts });
  };

  const handleSave = async () => {
    setSaving(true);
    const { error } = await supabase.from("service_orders").update({
      status: form.status as any,
      diagnosis: form.diagnosis || null,
      solution: form.solution || null,
      labor_cost: form.labor_cost,
      travel_cost: form.travel_cost,
      total_cost: totalCost,
      notes: form.notes || null,
      technician_id: form.technician_id || null,
      parts_used: form.parts_used as any,
      service_description: form.service_description || null,
      equipment_removed: form.equipment_removed || null,
      material_used: form.material_used || null,
      checked_by: form.checked_by || null,
      technician_signature: form.technician_signature || null,
      arrival_date: form.arrival_date ? new Date(form.arrival_date).toISOString() : null,
      departure_date: form.departure_date ? new Date(form.departure_date).toISOString() : null,
      started_at: form.status !== "draft" ? new Date().toISOString() : null,
      completed_at: form.status === "completed" ? new Date().toISOString() : null,
    } as any).eq("id", id!);
    if (error) toast({ variant: "destructive", title: "Erro", description: error.message });
    else { toast({ title: "OS salva com sucesso!" }); fetchOrder(); }
    setSaving(false);
  };

  const handlePrint = () => {
    setShowPrint(true);
    setTimeout(() => window.print(), 300);
  };

  if (loading) return <AdminLayout><div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div></AdminLayout>;
  if (!order) return <AdminLayout><p className="text-center text-muted-foreground py-12">OS não encontrada</p></AdminLayout>;

  if (showPrint) {
    return <ServiceOrderPrint order={order} form={form} partsCost={partsCost} totalCost={totalCost} onClose={() => setShowPrint(false)} />;
  }

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Link to="/admin/service-orders"><Button variant="ghost" size="icon"><ArrowLeft className="w-5 h-5" /></Button></Link>
          <div className="flex-1">
            <h1 className="text-xl font-display font-bold">OS #{order.order_number}</h1>
            <p className="text-sm text-muted-foreground">Cliente: {order.client?.full_name} ({order.client?.email})</p>
          </div>
          <Button variant="outline" onClick={handlePrint}>
            <Printer className="w-4 h-4 mr-2" />Imprimir
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}Salvar
          </Button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <Card>
              <CardHeader><CardTitle>Diagnóstico e Solução</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Diagnóstico</Label>
                  <Textarea value={form.diagnosis} onChange={(e) => setForm({ ...form, diagnosis: e.target.value })} placeholder="Descreva o problema encontrado..." className="min-h-[100px]" />
                </div>
                <div className="space-y-2">
                  <Label>Solução Aplicada</Label>
                  <Textarea value={form.solution} onChange={(e) => setForm({ ...form, solution: e.target.value })} placeholder="Descreva a solução aplicada..." className="min-h-[100px]" />
                </div>
                <div className="space-y-2">
                  <Label>Observações</Label>
                  <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Notas adicionais..." />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle>Serviço</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Descrição do Serviço Realizado</Label>
                  <Textarea value={form.service_description} onChange={(e) => setForm({ ...form, service_description: e.target.value })} placeholder="Descreva o serviço realizado..." className="min-h-[100px]" />
                </div>
                <div className="space-y-2">
                  <Label>Equipamento Retirado</Label>
                  <Textarea value={form.equipment_removed} onChange={(e) => setForm({ ...form, equipment_removed: e.target.value })} placeholder="Equipamento retirado do local..." />
                </div>
                <div className="space-y-2">
                  <Label>Material Utilizado</Label>
                  <Textarea value={form.material_used} onChange={(e) => setForm({ ...form, material_used: e.target.value })} placeholder="Materiais utilizados no serviço..." />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>Peças Utilizadas</CardTitle>
                <Button variant="outline" size="sm" onClick={addPart}><Plus className="w-4 h-4 mr-1" />Adicionar</Button>
              </CardHeader>
              <CardContent>
                {form.parts_used.length === 0 ? (
                  <p className="text-muted-foreground text-center py-4">Nenhuma peça adicionada</p>
                ) : (
                  <div className="space-y-3">
                    {form.parts_used.map((part, i) => (
                      <div key={i} className="flex items-center gap-3">
                        <Input placeholder="Nome da peça" value={part.name} onChange={(e) => updatePart(i, "name", e.target.value)} className="flex-1" />
                        <Input type="number" placeholder="Qtd" value={part.qty} onChange={(e) => updatePart(i, "qty", Number(e.target.value))} className="w-20" />
                        <Input type="number" placeholder="Custo" value={part.cost} onChange={(e) => updatePart(i, "cost", Number(e.target.value))} className="w-28" />
                        <Button variant="ghost" size="icon" onClick={() => removePart(i)}><Trash2 className="w-4 h-4 text-destructive" /></Button>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="space-y-4">
            <Card>
              <CardHeader><CardTitle className="text-sm">Configurações</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Status</Label>
                  <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="draft">Rascunho</SelectItem>
                      <SelectItem value="in_progress">Em Andamento</SelectItem>
                      <SelectItem value="completed">Concluída</SelectItem>
                      <SelectItem value="cancelled">Cancelada</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Técnico</Label>
                  <Select value={form.technician_id} onValueChange={(v) => setForm({ ...form, technician_id: v })}>
                    <SelectTrigger><SelectValue placeholder="Selecionar" /></SelectTrigger>
                    <SelectContent>
                      {technicians.map((t) => <SelectItem key={t.id} value={t.id}>{t.full_name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Conferido por</Label>
                  <Input value={form.checked_by} onChange={(e) => setForm({ ...form, checked_by: e.target.value })} placeholder="Nome de quem conferiu" />
                </div>
                <div className="space-y-2">
                  <Label>Assinatura do Técnico</Label>
                  <Input value={form.technician_signature} onChange={(e) => setForm({ ...form, technician_signature: e.target.value })} placeholder="Nome do técnico para assinatura" />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="text-sm">Datas</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Data de Chegada</Label>
                  <Input type="datetime-local" value={form.arrival_date} onChange={(e) => setForm({ ...form, arrival_date: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Data de Saída</Label>
                  <Input type="datetime-local" value={form.departure_date} onChange={(e) => setForm({ ...form, departure_date: e.target.value })} />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="text-sm">Custos</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <div className="space-y-2">
                  <Label>Mão de Obra (R$)</Label>
                  <Input type="number" value={form.labor_cost} onChange={(e) => setForm({ ...form, labor_cost: Number(e.target.value) })} />
                </div>
                <div className="space-y-2">
                  <Label>Deslocamento (R$)</Label>
                  <Input type="number" value={form.travel_cost} onChange={(e) => setForm({ ...form, travel_cost: Number(e.target.value) })} />
                </div>
                <div className="flex justify-between text-sm"><span className="text-muted-foreground">Peças:</span><span>R$ {partsCost.toFixed(2)}</span></div>
                <div className="flex justify-between text-sm"><span className="text-muted-foreground">Mão de Obra:</span><span>R$ {form.labor_cost.toFixed(2)}</span></div>
                <div className="flex justify-between text-sm"><span className="text-muted-foreground">Deslocamento:</span><span>R$ {form.travel_cost.toFixed(2)}</span></div>
                <div className="flex justify-between font-bold border-t border-border pt-2"><span>Total:</span><span>R$ {totalCost.toFixed(2)}</span></div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
};

export default AdminServiceOrderDetail;
