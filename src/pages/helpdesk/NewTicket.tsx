import { useState, useEffect, useCallback } from "react";
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
import { Loader2, Sparkles, AlertTriangle, Info } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

const PRIORITY_LABELS: Record<string, string> = {
  low: "Baixa",
  medium: "Média",
  high: "Alta",
  urgent: "Urgente",
};

interface IncidentMatch {
  match: boolean;
  incident_id?: string;
  incident_title?: string;
  incident_message?: string;
}

const NewTicket = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [parentClientId, setParentClientId] = useState<string | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [classifying, setClassifying] = useState(false);
  const [classified, setClassified] = useState(false);
  const [checkingIncident, setCheckingIncident] = useState(false);
  const [incidentMatch, setIncidentMatch] = useState<IncidentMatch | null>(null);
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

  const classifyTicket = useCallback(async () => {
    if (!form.title.trim() || !form.description.trim() || classifying || classified) return;

    setClassifying(true);
    try {
      const { data, error } = await supabase.functions.invoke("ai-classify-ticket", {
        body: { title: form.title, description: form.description },
      });

      if (error) {
        console.error("Classification error:", error);
        return;
      }

      if (data) {
        setForm((prev) => ({
          ...prev,
          priority: data.priority || prev.priority,
          equipment_type_id: data.equipment_type_id || prev.equipment_type_id,
        }));
        setClassified(true);
        toast({
          title: "🤖 IA classificou o chamado",
          description: `Prioridade: ${PRIORITY_LABELS[data.priority] || data.priority}${data.equipment_type_id ? " • Tipo de equipamento detectado" : ""}`,
        });
      }
    } catch (err) {
      console.error("Classification error:", err);
    } finally {
      setClassifying(false);
    }
  }, [form.title, form.description, classifying, classified, toast]);

  const checkForIncident = useCallback(async () => {
    if (!form.title.trim() || !form.description.trim()) return;
    setCheckingIncident(true);
    try {
      const { data } = await supabase.functions.invoke("ai-detect-incident", {
        body: { title: form.title, description: form.description, client_id: parentClientId },
      });
      if (data?.match) {
        setIncidentMatch(data);
      } else {
        setIncidentMatch(null);
      }
    } catch {
      // Silent fail
    } finally {
      setCheckingIncident(false);
    }
  }, [form.title, form.description, parentClientId]);

  const handleDescriptionBlur = () => {
    if (form.title.trim() && form.description.trim()) {
      if (!classified) classifyTicket();
      checkForIncident();
    }
  };

  const handleFieldChange = (field: string, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    if (field === "title" || field === "description") {
      setClassified(false);
      setIncidentMatch(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim() || !form.description.trim() || !user || !parentClientId) {
      toast({ variant: "destructive", title: "Preencha todos os campos obrigatórios" });
      return;
    }
    setLoading(true);

    const insertData: any = {
      title: form.title,
      description: form.description,
      equipment_type_id: form.equipment_type_id || null,
      equipment_info: form.equipment_info || null,
      priority: form.priority,
      client_id: parentClientId,
      created_by: user.id,
    };

    // If matches an incident, link to it
    if (incidentMatch?.match && incidentMatch.incident_id) {
      insertData.parent_incident_id = incidentMatch.incident_id;
    }

    const { data: insertedTicket, error } = await supabase.from("tickets")
      .insert(insertData)
      .select("id")
      .single();

    if (error) {
      toast({ variant: "destructive", title: "Erro ao criar chamado", description: error.message });
    } else {
      toast({ title: incidentMatch?.match ? "Chamado vinculado ao incidente!" : "Chamado criado com sucesso!" });
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

        {incidentMatch?.match && (
          <Alert className="mb-6 border-orange-500/50 bg-orange-500/10">
            <AlertTriangle className="h-5 w-5 text-orange-500" />
            <AlertTitle className="text-orange-600 font-semibold">
              🚨 Incidente em andamento: {incidentMatch.incident_title}
            </AlertTitle>
            <AlertDescription className="mt-2 space-y-2">
              <p className="text-sm">{incidentMatch.incident_message}</p>
              <p className="text-xs text-muted-foreground">
                Seu chamado será vinculado automaticamente a este incidente. Você receberá atualizações assim que o problema for resolvido.
              </p>
            </AlertDescription>
          </Alert>
        )}

        {checkingIncident && (
          <Alert className="mb-6">
            <Info className="h-4 w-4" />
            <AlertDescription className="flex items-center gap-2 text-sm">
              <Loader2 className="w-3 h-3 animate-spin" />
              Verificando incidentes ativos...
            </AlertDescription>
          </Alert>
        )}

        <Card>
          <CardContent className="pt-6">
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="title">Título *</Label>
                <Input id="title" placeholder="Descreva brevemente o problema" value={form.title} onChange={(e) => handleFieldChange("title", e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="description">Descrição *</Label>
                <Textarea
                  id="description"
                  placeholder="Detalhe o problema, quando começou, o que já tentou..."
                  value={form.description}
                  onChange={(e) => handleFieldChange("description", e.target.value)}
                  onBlur={handleDescriptionBlur}
                  className="min-h-[120px]"
                />
                {classifying && (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground animate-pulse">
                    <Sparkles className="w-3 h-3" />
                    <span>IA classificando chamado...</span>
                  </div>
                )}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="flex items-center gap-1.5">
                    Tipo de Equipamento
                    {classified && form.equipment_type_id && (
                      <span className="text-xs text-primary flex items-center gap-0.5"><Sparkles className="w-3 h-3" /> IA</span>
                    )}
                  </Label>
                  <EquipmentTypeSelect value={form.equipment_type_id} onValueChange={(v) => setForm({ ...form, equipment_type_id: v })} />
                </div>
                <div className="space-y-2">
                  <Label className="flex items-center gap-1.5">
                    Prioridade
                    {classified && (
                      <span className="text-xs text-primary flex items-center gap-0.5"><Sparkles className="w-3 h-3" /> IA</span>
                    )}
                  </Label>
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
                  {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  {incidentMatch?.match ? "Vincular ao Incidente" : "Enviar Chamado"}
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
