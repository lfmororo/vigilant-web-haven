import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import HelpdeskLayout from "@/components/helpdesk/HelpdeskLayout";
import EquipmentTypeSelect from "@/components/helpdesk/EquipmentTypeSelect";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";

const NewTicket = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [parentClientId, setParentClientId] = useState<string | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [form, setForm] = useState({
    title: "",
    description: "",
    equipment_type_id: "",
    equipment_info: "",
    priority: "medium",
  });

  useEffect(() => {
    if (!user) return;
    supabase.from("profiles").select("parent_client_id").eq("id", user.id).maybeSingle()
      .then(({ data }) => {
        setParentClientId(data?.parent_client_id || null);
        setLoadingProfile(false);
      });
  }, [user]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim() || !form.description.trim() || !user || !parentClientId) {
      toast({ variant: "destructive", title: "Preencha todos os campos obrigatórios" });
      return;
    }
    setLoading(true);
    const { data: insertedTicket, error } = await supabase.from("tickets").insert({
      title: form.title,
      description: form.description,
      equipment_type_id: form.equipment_type_id || null,
      equipment_info: form.equipment_info || null,
      priority: form.priority as any,
      client_id: parentClientId,
      created_by: user.id,
    }).select("id").single();
    if (error) {
      toast({ variant: "destructive", title: "Erro ao criar chamado", description: error.message });
    } else {
      toast({ title: "Chamado criado com sucesso!" });
      if (insertedTicket?.id) {
        supabase.functions.invoke("notify-ticket-update", {
          body: {
            ticket_id: insertedTicket.id,
            sender_id: user.id,
            message: form.description,
            is_internal: false,
            notification_type: "ticket_opened",
          },
        }).catch((err) => console.error("Notification error:", err));
      }
      navigate("/helpdesk/tickets");
    }
    setLoading(false);
  };

  if (loadingProfile) {
    return <HelpdeskLayout><div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div></HelpdeskLayout>;
  }

  if (!parentClientId) {
    return (
      <HelpdeskLayout>
        <div className="max-w-2xl mx-auto text-center py-12">
          <p className="text-muted-foreground">Seu usuário não está vinculado a nenhum cliente. Solicite ao administrador para vincular sua conta.</p>
          <Button variant="outline" className="mt-4" onClick={() => navigate(-1)}>Voltar</Button>
        </div>
      </HelpdeskLayout>
    );
  }

  return (
    <HelpdeskLayout>
      <div className="max-w-2xl mx-auto">
        <h1 className="text-2xl font-display font-bold mb-6">Abrir Novo Chamado</h1>
        <Card>
          <CardContent className="pt-6">
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="title">Título *</Label>
                <Input id="title" placeholder="Descreva brevemente o problema" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="description">Descrição *</Label>
                <Textarea id="description" placeholder="Detalhe o problema, quando começou, o que já tentou..." value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="min-h-[120px]" />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Tipo de Equipamento</Label>
                  <EquipmentTypeSelect value={form.equipment_type_id} onValueChange={(v) => setForm({ ...form, equipment_type_id: v })} />
                </div>
                <div className="space-y-2">
                  <Label>Prioridade</Label>
                  <Select value={form.priority} onValueChange={(v) => setForm({ ...form, priority: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="low">Baixa</SelectItem>
                      <SelectItem value="medium">Média</SelectItem>
                      <SelectItem value="high">Alta</SelectItem>
                      <SelectItem value="urgent">Urgente</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="equipment_info">Informações do Equipamento</Label>
                <Input id="equipment_info" placeholder="Modelo, marca, número de série..." value={form.equipment_info} onChange={(e) => setForm({ ...form, equipment_info: e.target.value })} />
              </div>
              <div className="flex justify-end gap-3 pt-4">
                <Button type="button" variant="outline" onClick={() => navigate(-1)}>Cancelar</Button>
                <Button type="submit" disabled={loading}>
                  {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}Enviar Chamado
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </HelpdeskLayout>
  );
};

export default NewTicket;
