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

/** SMTP usado nas notificações por e-mail. */
export default function SmtpSettingsTab() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // SMTP form state
  const [smtpForm, setSmtpForm] = useState({
    smtp_host: "",
    smtp_port: "",
    smtp_user: "",
    smtp_password: "",
    smtp_from_name: "",
    notification_enabled: "false",
  });

  // WhatsApp form state
  const [showPasswords, setShowPasswords] = useState<Record<string, boolean>>({});
  const [testingSmtp, setTestingSmtp] = useState(false);
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
      setSmtpForm({
        smtp_host: map.smtp_host || "",
        smtp_port: map.smtp_port || "",
        smtp_user: map.smtp_user || "",
        smtp_password: map.smtp_password || "",
        smtp_from_name: map.smtp_from_name || "",
        notification_enabled: map.notification_enabled || "false",
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
  const handleSaveSmtp = () => {
    saveMutation.mutate(Object.entries(smtpForm).map(([key, value]) => ({ key, value })));
  };

  const togglePassword = (field: string) => {
    setShowPasswords((prev) => ({ ...prev, [field]: !prev[field] }));
  };

  const handleTestSmtp = async () => {
    setTestingSmtp(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/test-smtp-connection`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${sessionData.session?.access_token}`,
          },
          body: JSON.stringify({
            host: smtpForm.smtp_host,
            port: smtpForm.smtp_port,
            user: smtpForm.smtp_user,
            password: smtpForm.smtp_password,
            from_name: smtpForm.smtp_from_name,
          }),
        }
      );
      const result = await res.json();
      toast({
        title: result.success ? "Teste SMTP" : "Falha no teste SMTP",
        description: String(result.message || result.error || ""),
        variant: result.success ? "default" : "destructive",
      });
    } catch {
      toast({ title: "Erro ao testar conexão SMTP", variant: "destructive" });
    } finally {
      setTestingSmtp(false);
    }
  };


  if (settingsLoading) {
    return <div className="flex items-center justify-center h-64"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;
  }

  return (
    <>
            <Card>
              <CardHeader>
                <CardTitle>SMTP para Notificações</CardTitle>
                <CardDescription>
                  Configure o servidor SMTP para envio de notificações por email aos clientes e técnicos.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="smtp_host">Servidor SMTP</Label>
                    <Input id="smtp_host" placeholder="smtp.gmail.com" value={smtpForm.smtp_host} onChange={(e) => setSmtpForm((f) => ({ ...f, smtp_host: e.target.value }))} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="smtp_port">Porta SMTP</Label>
                    <Input id="smtp_port" placeholder="587" value={smtpForm.smtp_port} onChange={(e) => setSmtpForm((f) => ({ ...f, smtp_port: e.target.value }))} />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="smtp_user">Email de Envio</Label>
                  <Input id="smtp_user" type="email" placeholder="notificacoes@empresa.com" value={smtpForm.smtp_user} onChange={(e) => setSmtpForm((f) => ({ ...f, smtp_user: e.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="smtp_password">Senha SMTP</Label>
                  <div className="relative">
                    <Input id="smtp_password" type={showPasswords.smtp ? "text" : "password"} placeholder="••••••••" value={smtpForm.smtp_password} onChange={(e) => setSmtpForm((f) => ({ ...f, smtp_password: e.target.value }))} />
                    <button type="button" onClick={() => togglePassword("smtp")} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                      {showPasswords.smtp ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="smtp_from_name">Nome do Remetente</Label>
                  <Input id="smtp_from_name" placeholder="Mororo.tech Suporte" value={smtpForm.smtp_from_name} onChange={(e) => setSmtpForm((f) => ({ ...f, smtp_from_name: e.target.value }))} />
                </div>
                <div className="flex items-center gap-3 pt-2">
                  <Switch id="notification_enabled" checked={smtpForm.notification_enabled === "true"} onCheckedChange={(checked) => setSmtpForm((f) => ({ ...f, notification_enabled: checked ? "true" : "false" }))} />
                  <Label htmlFor="notification_enabled">Ativar notificações por email</Label>
                </div>
                <div className="flex gap-3">
                  <Button onClick={handleSaveSmtp} disabled={saveMutation.isPending} className="gap-2">
                    {saveMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    Salvar
                  </Button>
                  <Button variant="outline" onClick={handleTestSmtp} disabled={testingSmtp} className="gap-2">
                    {testingSmtp ? <Loader2 className="w-4 h-4 animate-spin" /> : <TestTube className="w-4 h-4" />}
                    Enviar Email de Teste
                  </Button>
                </div>
              </CardContent>
            </Card>
    </>
  );
}
