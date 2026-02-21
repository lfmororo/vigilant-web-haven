import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import AdminLayout from "@/components/admin/AdminLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { Eye, EyeOff, Save, Loader2, Mail, Send, TestTube, Inbox, MessageCircle } from "lucide-react";

const SystemSettings = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [imapForm, setImapForm] = useState({
    email_imap_host: "",
    email_imap_port: "",
    email_imap_user: "",
    email_imap_password: "",
  });

  const [smtpForm, setSmtpForm] = useState({
    smtp_host: "",
    smtp_port: "",
    smtp_user: "",
    smtp_password: "",
    smtp_from_name: "",
    notification_enabled: "false",
  });

  const [whatsappForm, setWhatsappForm] = useState({
    whatsapp_api_url: "",
    whatsapp_api_token: "",
    whatsapp_enabled: "false",
  });

  const [showPasswords, setShowPasswords] = useState<Record<string, boolean>>({});
  const [testingImap, setTestingImap] = useState(false);
  const [testingSmtp, setTestingSmtp] = useState(false);
  const [testingWhatsapp, setTestingWhatsapp] = useState(false);
  const [processingEmails, setProcessingEmails] = useState(false);

  const { data: settings, isLoading } = useQuery({
    queryKey: ["system-settings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("system_settings")
        .select("*");
      if (error) throw error;
      return data;
    },
  });

  useEffect(() => {
    if (settings) {
      const map: Record<string, string> = {};
      settings.forEach((s: any) => {
        map[s.key] = s.value || "";
      });
      setImapForm({
        email_imap_host: map.email_imap_host || "",
        email_imap_port: map.email_imap_port || "",
        email_imap_user: map.email_imap_user || "",
        email_imap_password: map.email_imap_password || "",
      });
      setSmtpForm({
        smtp_host: map.smtp_host || "",
        smtp_port: map.smtp_port || "",
        smtp_user: map.smtp_user || "",
        smtp_password: map.smtp_password || "",
        smtp_from_name: map.smtp_from_name || "",
        notification_enabled: map.notification_enabled || "false",
      });
      setWhatsappForm({
        whatsapp_api_url: map.whatsapp_api_url || "",
        whatsapp_api_token: map.whatsapp_api_token || "",
        whatsapp_enabled: map.whatsapp_enabled || "false",
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

  const handleSaveImap = () => {
    saveMutation.mutate(
      Object.entries(imapForm).map(([key, value]) => ({ key, value }))
    );
  };

  const handleSaveSmtp = () => {
    saveMutation.mutate(
      Object.entries(smtpForm).map(([key, value]) => ({ key, value }))
    );
  };

  const handleSaveWhatsapp = () => {
    saveMutation.mutate(
      Object.entries(whatsappForm).map(([key, value]) => ({ key, value }))
    );
  };

  const togglePassword = (field: string) => {
    setShowPasswords((prev) => ({ ...prev, [field]: !prev[field] }));
  };

  const handleTestImap = async () => {
    setTestingImap(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/test-imap-connection`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${sessionData.session?.access_token}`,
          },
          body: JSON.stringify({
            host: imapForm.email_imap_host,
            port: imapForm.email_imap_port,
            user: imapForm.email_imap_user,
            password: imapForm.email_imap_password,
          }),
        }
      );
      const result = await res.json();
      toast({
        title: result.success ? "Teste IMAP" : "Falha no teste IMAP",
        description: result.message || result.error,
        variant: result.success ? "default" : "destructive",
      });
    } catch {
      toast({ title: "Erro ao testar conexão IMAP", variant: "destructive" });
    } finally {
      setTestingImap(false);
    }
  };

  const handleProcessEmails = async () => {
    setProcessingEmails(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/process-incoming-emails`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${sessionData.session?.access_token}`,
          },
        }
      );
      const result = await res.json();
      if (result.success) {
        toast({
          title: "Emails processados",
          description: result.message,
        });
      } else {
        toast({
          title: "Erro ao processar emails",
          description: result.error || result.message,
          variant: "destructive",
        });
      }
    } catch {
      toast({ title: "Erro ao processar emails", variant: "destructive" });
    } finally {
      setProcessingEmails(false);
    }
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
        description: result.message || result.error,
        variant: result.success ? "default" : "destructive",
      });
    } catch {
      toast({ title: "Erro ao testar conexão SMTP", variant: "destructive" });
    } finally {
      setTestingSmtp(false);
    }
  };

  const handleTestWhatsapp = async () => {
    if (!whatsappForm.whatsapp_api_url || !whatsappForm.whatsapp_api_token) {
      toast({ title: "Preencha a URL e o Token antes de testar", variant: "destructive" });
      return;
    }
    setTestingWhatsapp(true);
    try {
      const statusUrl = `${whatsappForm.whatsapp_api_url.replace(/\/+$/, "")}/instance/status`;
      const res = await fetch(statusUrl, {
        method: "GET",
        headers: { token: whatsappForm.whatsapp_api_token },
      });
      const result = await res.json();
      if (res.ok) {
        const statusText = typeof result === "object"
          ? (result.status ? String(result.status) : result.message ? String(result.message) : JSON.stringify(result))
          : String(result);
        toast({
          title: "Conexão WhatsApp OK",
          description: statusText,
        });
      } else {
        const errText = typeof result === "object"
          ? (result.error ? String(result.error) : result.message ? String(result.message) : `Status: ${res.status}`)
          : String(result);
        toast({
          title: "Falha na conexão WhatsApp",
          description: errText,
          variant: "destructive",
        });
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

  if (isLoading) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Configurações do Sistema</h1>
          <p className="text-muted-foreground mt-1">
            Gerencie as configurações de email e notificações do sistema.
          </p>
        </div>

        <Tabs defaultValue="imap" className="space-y-4">
          <TabsList>
            <TabsTrigger value="imap" className="gap-2">
              <Mail className="w-4 h-4" />
              Email de Captura
            </TabsTrigger>
            <TabsTrigger value="smtp" className="gap-2">
              <Send className="w-4 h-4" />
              SMTP (Notificações)
            </TabsTrigger>
            <TabsTrigger value="whatsapp" className="gap-2">
              <MessageCircle className="w-4 h-4" />
              WhatsApp
            </TabsTrigger>
          </TabsList>

          <TabsContent value="imap">
            <Card>
              <CardHeader>
                <CardTitle>Email de Captura de Tickets</CardTitle>
                <CardDescription>
                  Configure o email que o sistema irá verificar periodicamente para abrir tickets automaticamente a partir de emails recebidos.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="imap_host">Servidor IMAP</Label>
                    <Input
                      id="imap_host"
                      placeholder="imap.gmail.com"
                      value={imapForm.email_imap_host}
                      onChange={(e) => setImapForm((f) => ({ ...f, email_imap_host: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="imap_port">Porta IMAP</Label>
                    <Input
                      id="imap_port"
                      placeholder="993"
                      value={imapForm.email_imap_port}
                      onChange={(e) => setImapForm((f) => ({ ...f, email_imap_port: e.target.value }))}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="imap_user">Email</Label>
                  <Input
                    id="imap_user"
                    type="email"
                    placeholder="suporte@empresa.com"
                    value={imapForm.email_imap_user}
                    onChange={(e) => setImapForm((f) => ({ ...f, email_imap_user: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="imap_password">Senha</Label>
                  <div className="relative">
                    <Input
                      id="imap_password"
                      type={showPasswords.imap ? "text" : "password"}
                      placeholder="••••••••"
                      value={imapForm.email_imap_password}
                      onChange={(e) => setImapForm((f) => ({ ...f, email_imap_password: e.target.value }))}
                    />
                    <button
                      type="button"
                      onClick={() => togglePassword("imap")}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      {showPasswords.imap ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
                <div className="flex gap-3 flex-wrap">
                  <Button onClick={handleSaveImap} disabled={saveMutation.isPending} className="gap-2">
                    {saveMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    Salvar
                  </Button>
                  <Button variant="outline" onClick={handleTestImap} disabled={testingImap} className="gap-2">
                    {testingImap ? <Loader2 className="w-4 h-4 animate-spin" /> : <TestTube className="w-4 h-4" />}
                    Testar Conexão
                  </Button>
                  <Button variant="secondary" onClick={handleProcessEmails} disabled={processingEmails} className="gap-2">
                    {processingEmails ? <Loader2 className="w-4 h-4 animate-spin" /> : <Inbox className="w-4 h-4" />}
                    Verificar Emails Agora
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="smtp">
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
                    <Input
                      id="smtp_host"
                      placeholder="smtp.gmail.com"
                      value={smtpForm.smtp_host}
                      onChange={(e) => setSmtpForm((f) => ({ ...f, smtp_host: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="smtp_port">Porta SMTP</Label>
                    <Input
                      id="smtp_port"
                      placeholder="587"
                      value={smtpForm.smtp_port}
                      onChange={(e) => setSmtpForm((f) => ({ ...f, smtp_port: e.target.value }))}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="smtp_user">Email de Envio</Label>
                  <Input
                    id="smtp_user"
                    type="email"
                    placeholder="notificacoes@empresa.com"
                    value={smtpForm.smtp_user}
                    onChange={(e) => setSmtpForm((f) => ({ ...f, smtp_user: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="smtp_password">Senha SMTP</Label>
                  <div className="relative">
                    <Input
                      id="smtp_password"
                      type={showPasswords.smtp ? "text" : "password"}
                      placeholder="••••••••"
                      value={smtpForm.smtp_password}
                      onChange={(e) => setSmtpForm((f) => ({ ...f, smtp_password: e.target.value }))}
                    />
                    <button
                      type="button"
                      onClick={() => togglePassword("smtp")}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      {showPasswords.smtp ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="smtp_from_name">Nome do Remetente</Label>
                  <Input
                    id="smtp_from_name"
                    placeholder="FM TechFlow Suporte"
                    value={smtpForm.smtp_from_name}
                    onChange={(e) => setSmtpForm((f) => ({ ...f, smtp_from_name: e.target.value }))}
                  />
                </div>
                <div className="flex items-center gap-3 pt-2">
                  <Switch
                    id="notification_enabled"
                    checked={smtpForm.notification_enabled === "true"}
                    onCheckedChange={(checked) =>
                      setSmtpForm((f) => ({ ...f, notification_enabled: checked ? "true" : "false" }))
                    }
                  />
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
          </TabsContent>

          <TabsContent value="whatsapp">
            <Card>
              <CardHeader>
                <CardTitle>WhatsApp (Whatsapi.my)</CardTitle>
                <CardDescription>
                  Configure a integração com WhatsApp para enviar notificações automáticas de chamados via WhatsApp.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="whatsapp_api_url">URL da API</Label>
                  <Input
                    id="whatsapp_api_url"
                    placeholder="https://ipazua.uazapi.com"
                    value={whatsappForm.whatsapp_api_url}
                    onChange={(e) => setWhatsappForm((f) => ({ ...f, whatsapp_api_url: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="whatsapp_api_token">Token da Instância</Label>
                  <div className="relative">
                    <Input
                      id="whatsapp_api_token"
                      type={showPasswords.whatsapp ? "text" : "password"}
                      placeholder="••••••••"
                      value={whatsappForm.whatsapp_api_token}
                      onChange={(e) => setWhatsappForm((f) => ({ ...f, whatsapp_api_token: e.target.value }))}
                    />
                    <button
                      type="button"
                      onClick={() => togglePassword("whatsapp")}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      {showPasswords.whatsapp ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
                <div className="flex items-center gap-3 pt-2">
                  <Switch
                    id="whatsapp_enabled"
                    checked={whatsappForm.whatsapp_enabled === "true"}
                    onCheckedChange={(checked) =>
                      setWhatsappForm((f) => ({ ...f, whatsapp_enabled: checked ? "true" : "false" }))
                    }
                  />
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
          </TabsContent>
        </Tabs>
      </div>
    </AdminLayout>
  );
};

export default SystemSettings;
