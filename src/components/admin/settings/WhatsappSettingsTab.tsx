import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Eye, EyeOff, Save, Loader2, Mail, Send, TestTube, Inbox, MessageCircle, Plus, Trash2, Edit2, X, Check, Bell } from "lucide-react";

interface ImapAccount {
  id: string;
  label: string;
  host: string;
  port: string;
  username: string;
  password: string;
  client_id: string | null;
  is_active: boolean;
  last_checked_at: string | null;
}

interface ClientProfile {
  id: string;
  full_name: string;
  email: string;
}

/** Integração com a Evolution API (WhatsApp). */
export default function WhatsappSettingsTab() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // SMTP form state
  const [whatsappForm, setWhatsappForm] = useState({
    whatsapp_api_url: "",
    whatsapp_api_token: "",
    whatsapp_instance: "",
    whatsapp_enabled: "false",
    admin_contact_phone: "",
  });

  // IMAP accounts state
  const [showPasswords, setShowPasswords] = useState<Record<string, boolean>>({});
  const [testingWhatsapp, setTestingWhatsapp] = useState(false);
  const { data: settings, isLoading: settingsLoading } = useQuery({
    queryKey: ["system-settings"],
    queryFn: async () => {
      const { data, error } = await supabase.from("system_settings").select("*");
      if (error) throw error;
      return data;
    },
  });

  // Fetch IMAP accounts
  useEffect(() => {
    if (settings) {
      const map: Record<string, string> = {};
      settings.forEach((s: any) => { map[s.key] = s.value || ""; });
      setWhatsappForm({
        whatsapp_api_url: map.whatsapp_api_url || "",
        whatsapp_api_token: map.whatsapp_api_token || "",
        whatsapp_instance: map.whatsapp_instance || "",
        whatsapp_enabled: map.whatsapp_enabled || "false",
        admin_contact_phone: map.admin_contact_phone || "",
      });
    }
  }, [settings]);

  const saveMutation = useMutation({
    mutationFn: async (entries: { key: string; value: string }[]) => {
      for (const entry of entries) {
        const { error } = await supabase
          .from("system_settings")
          .update({ value: entry.value, updated_at: new Date().toISOString(), updated_by: user?.id })
          .eq("key", entry.key);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["system-settings"] });
      toast({ title: "Configurações salvas com sucesso!" });
    },
    onError: () => {
      toast({ title: "Erro ao salvar configurações", variant: "destructive" });
    },
  });

  // IMAP account mutations
  const handleSaveWhatsapp = () => {
    saveMutation.mutate(Object.entries(whatsappForm).map(([key, value]) => ({ key, value })));
  };

  const togglePassword = (field: string) => {
    setShowPasswords((prev) => ({ ...prev, [field]: !prev[field] }));
  };

  const handleTestWhatsapp = async () => {
    if (!whatsappForm.whatsapp_api_url || !whatsappForm.whatsapp_api_token) {
      toast({ title: "Preencha a URL e a API Key antes de testar", variant: "destructive" });
      return;
    }
    if (!whatsappForm.whatsapp_instance) {
      toast({ title: "Informe o nome da instância da Evolution API", variant: "destructive" });
      return;
    }
    setTestingWhatsapp(true);
    try {
      // Evolution API: GET /instance/connectionState/{instance} com header apikey
      const statusUrl = `${whatsappForm.whatsapp_api_url.replace(/\/+$/, "")}/instance/connectionState/${encodeURIComponent(
        whatsappForm.whatsapp_instance.trim(),
      )}`;
      const res = await fetch(statusUrl, {
        method: "GET",
        headers: { apikey: whatsappForm.whatsapp_api_token },
      });
      const result = await res.json();
      if (res.ok) {
        const state = result?.instance?.state || result?.state || JSON.stringify(result);
        toast({
          title: state === "open" ? "Evolution API conectada" : "Evolution API respondeu",
          description: `Estado da instância: ${state}`,
          variant: state === "open" ? "default" : "destructive",
        });
      } else {
        const errText = typeof result === "object"
          ? (result.error ? String(result.error) : result.message ? String(result.message) : `Status: ${res.status}`)
          : String(result);
        toast({ title: "Falha na conexão com a Evolution API", description: errText, variant: "destructive" });
      }

    } catch (err: any) {
      toast({
        title: "Erro ao testar conexão WhatsApp",
        description: err.message || "Verifique a URL da API",
        variant: "destructive",
      });
    } finally {
      setTestingWhatsapp(false);
    }
  };


  if (settingsLoading) {
    return <div className="flex items-center justify-center h-64"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;
  }

  return (
    <>
            <Card>
              <CardHeader>
                <CardTitle>WhatsApp (Evolution API)</CardTitle>
                <CardDescription>
                  Configure a instância da Evolution API usada para enviar e receber mensagens de WhatsApp.
                  Webhook a cadastrar na instância: <code className="text-xs">{`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/whatsapp-webhook`}</code>
                  {" "}(eventos <code className="text-xs">MESSAGES_UPSERT</code> e <code className="text-xs">MESSAGES_UPDATE</code>).
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="whatsapp_api_url">URL da Evolution API</Label>
                  <Input id="whatsapp_api_url" placeholder="https://evolution.seudominio.com.br" value={whatsappForm.whatsapp_api_url} onChange={(e) => setWhatsappForm((f) => ({ ...f, whatsapp_api_url: e.target.value }))} />
                  <p className="text-xs text-muted-foreground">Sem barra final. Ex.: https://evolution.seudominio.com.br</p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="whatsapp_instance">Nome da Instância</Label>
                  <Input id="whatsapp_instance" placeholder="suporte" value={whatsappForm.whatsapp_instance} onChange={(e) => setWhatsappForm((f) => ({ ...f, whatsapp_instance: e.target.value }))} />
                  <p className="text-xs text-muted-foreground">Exatamente como aparece no Evolution Manager.</p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="whatsapp_api_token">API Key (header apikey)</Label>
                  <div className="relative">
                    <Input id="whatsapp_api_token" type={showPasswords.whatsapp ? "text" : "password"} placeholder="••••••••" value={whatsappForm.whatsapp_api_token} onChange={(e) => setWhatsappForm((f) => ({ ...f, whatsapp_api_token: e.target.value }))} />
                    <button type="button" onClick={() => togglePassword("whatsapp")} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                      {showPasswords.whatsapp ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  <p className="text-xs text-muted-foreground">Pode ser a API Key global ou a chave da própria instância.</p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="admin_contact_phone">Telefone de Contato (exibido nas notificações)</Label>
                  <Input id="admin_contact_phone" placeholder="5585986801458" value={whatsappForm.admin_contact_phone} onChange={(e) => setWhatsappForm((f) => ({ ...f, admin_contact_phone: e.target.value }))} />
                  <p className="text-xs text-muted-foreground">Número exibido nas mensagens para que os destinatários saibam como entrar em contato com o suporte.</p>
                </div>
                <div className="flex items-center gap-3 pt-2">
                  <Switch id="whatsapp_enabled" checked={whatsappForm.whatsapp_enabled === "true"} onCheckedChange={(checked) => setWhatsappForm((f) => ({ ...f, whatsapp_enabled: checked ? "true" : "false" }))} />
                  <Label htmlFor="whatsapp_enabled">Ativar notificações via WhatsApp</Label>
                </div>
                <div className="flex gap-3">
                  <Button onClick={handleSaveWhatsapp} disabled={saveMutation.isPending} className="gap-2">
                    {saveMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    Salvar
                  </Button>
                  <Button variant="outline" onClick={handleTestWhatsapp} disabled={testingWhatsapp} className="gap-2">
                    {testingWhatsapp ? <Loader2 className="w-4 h-4 animate-spin" /> : <TestTube className="w-4 h-4" />}
                    Testar Conexão
                  </Button>
                </div>
              </CardContent>
            </Card>
    </>
  );
}
