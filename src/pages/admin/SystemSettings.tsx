import { useState, useEffect } from "react";
import NotificationsTab from "@/components/admin/NotificationsTab";
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

const SystemSettings = () => {
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
  const [whatsappForm, setWhatsappForm] = useState({
    whatsapp_api_url: "",
    whatsapp_api_token: "",
    whatsapp_enabled: "false",
    admin_contact_phone: "",
  });

  // IMAP accounts state
  const [editingAccount, setEditingAccount] = useState<ImapAccount | null>(null);
  const [isAddingAccount, setIsAddingAccount] = useState(false);
  const [newAccount, setNewAccount] = useState<Omit<ImapAccount, "id" | "last_checked_at">>({
    label: "",
    host: "",
    port: "993",
    username: "",
    password: "",
    client_id: null,
    is_active: true,
  });

  const [showPasswords, setShowPasswords] = useState<Record<string, boolean>>({});
  const [testingSmtp, setTestingSmtp] = useState(false);
  const [testingWhatsapp, setTestingWhatsapp] = useState(false);
  const [testingImapId, setTestingImapId] = useState<string | null>(null);
  const [processingEmails, setProcessingEmails] = useState(false);

  // Fetch system settings
  const { data: settings, isLoading: settingsLoading } = useQuery({
    queryKey: ["system-settings"],
    queryFn: async () => {
      const { data, error } = await supabase.from("system_settings").select("*");
      if (error) throw error;
      return data;
    },
  });

  // Fetch IMAP accounts
  const { data: imapAccounts, isLoading: imapLoading } = useQuery({
    queryKey: ["imap-accounts"],
    queryFn: async () => {
      const { data, error } = await supabase.from("imap_accounts").select("*").order("created_at");
      if (error) throw error;
      return data as ImapAccount[];
    },
  });

  // Fetch clients for the select dropdown
  const { data: clients } = useQuery({
    queryKey: ["clients-for-imap"],
    queryFn: async () => {
      const { data: roles } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("role", "client");
      if (!roles || roles.length === 0) return [];
      const clientIds = roles.map((r) => r.user_id);
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, full_name, email")
        .in("id", clientIds)
        .is("parent_client_id", null)
        .order("full_name");
      return (profiles || []) as ClientProfile[];
    },
  });

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
      setWhatsappForm({
        whatsapp_api_url: map.whatsapp_api_url || "",
        whatsapp_api_token: map.whatsapp_api_token || "",
        whatsapp_enabled: map.whatsapp_enabled || "false",
        admin_contact_phone: map.admin_contact_phone || "",
      });
    }
  }, [settings]);

  // Save system settings mutation
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
  const createImapMutation = useMutation({
    mutationFn: async (account: Omit<ImapAccount, "id" | "last_checked_at">) => {
      const { error } = await supabase.from("imap_accounts").insert(account);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["imap-accounts"] });
      setIsAddingAccount(false);
      setNewAccount({ label: "", host: "", port: "993", username: "", password: "", client_id: null, is_active: true });
      toast({ title: "Conta IMAP adicionada com sucesso!" });
    },
    onError: () => {
      toast({ title: "Erro ao adicionar conta IMAP", variant: "destructive" });
    },
  });

  const updateImapMutation = useMutation({
    mutationFn: async (account: ImapAccount) => {
      const { id, last_checked_at, ...updates } = account;
      const { error } = await supabase.from("imap_accounts").update(updates).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["imap-accounts"] });
      setEditingAccount(null);
      toast({ title: "Conta IMAP atualizada com sucesso!" });
    },
    onError: () => {
      toast({ title: "Erro ao atualizar conta IMAP", variant: "destructive" });
    },
  });

  const deleteImapMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("imap_accounts").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["imap-accounts"] });
      toast({ title: "Conta IMAP removida!" });
    },
    onError: () => {
      toast({ title: "Erro ao remover conta IMAP", variant: "destructive" });
    },
  });

  const handleSaveSmtp = () => {
    saveMutation.mutate(Object.entries(smtpForm).map(([key, value]) => ({ key, value })));
  };

  const handleSaveWhatsapp = () => {
    saveMutation.mutate(Object.entries(whatsappForm).map(([key, value]) => ({ key, value })));
  };

  const togglePassword = (field: string) => {
    setShowPasswords((prev) => ({ ...prev, [field]: !prev[field] }));
  };

  const handleTestImap = async (account: ImapAccount) => {
    setTestingImapId(account.id);
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
            host: account.host,
            port: account.port,
            user: account.username,
            password: account.password,
          }),
        }
      );
      const result = await res.json();
      toast({
        title: result.success ? `Teste IMAP - ${account.label}` : `Falha - ${account.label}`,
        description: String(result.message || result.error || ""),
        variant: result.success ? "default" : "destructive",
      });
    } catch {
      toast({ title: "Erro ao testar conexão IMAP", variant: "destructive" });
    } finally {
      setTestingImapId(null);
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
        toast({ title: "Emails processados", description: String(result.message || "") });
      } else {
        toast({
          title: "Erro ao processar emails",
          description: String(result.error || result.message || ""),
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
        description: String(result.message || result.error || ""),
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

  const getClientName = (clientId: string | null) => {
    if (!clientId || !clients) return "Nenhum (auto-detectar)";
    const client = clients.find((c) => c.id === clientId);
    return client ? client.full_name : "Cliente não encontrado";
  };

  const isLoading = settingsLoading || imapLoading;

  if (isLoading) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </AdminLayout>
    );
  }

  const renderImapAccountForm = (
    account: Omit<ImapAccount, "id" | "last_checked_at">,
    onChange: (updates: Partial<typeof account>) => void,
    passwordKey: string
  ) => (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>Nome da Conta</Label>
        <Input
          placeholder="Ex: Suporte Principal"
          value={account.label}
          onChange={(e) => onChange({ label: e.target.value })}
        />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Servidor IMAP</Label>
          <Input
            placeholder="imap.gmail.com"
            value={account.host}
            onChange={(e) => onChange({ host: e.target.value })}
          />
        </div>
        <div className="space-y-2">
          <Label>Porta IMAP</Label>
          <Input
            placeholder="993"
            value={account.port}
            onChange={(e) => onChange({ port: e.target.value })}
          />
        </div>
      </div>
      <div className="space-y-2">
        <Label>Email</Label>
        <Input
          type="email"
          placeholder="suporte@empresa.com"
          value={account.username}
          onChange={(e) => onChange({ username: e.target.value })}
        />
      </div>
      <div className="space-y-2">
        <Label>Senha</Label>
        <div className="relative">
          <Input
            type={showPasswords[passwordKey] ? "text" : "password"}
            placeholder="••••••••"
            value={account.password}
            onChange={(e) => onChange({ password: e.target.value })}
          />
          <button
            type="button"
            onClick={() => togglePassword(passwordKey)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            {showPasswords[passwordKey] ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        </div>
      </div>
      <div className="space-y-2">
        <Label>Cliente vinculado</Label>
        <Select
          value={account.client_id || "none"}
          onValueChange={(v) => onChange({ client_id: v === "none" ? null : v })}
        >
          <SelectTrigger>
            <SelectValue placeholder="Selecione um cliente (opcional)" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">Nenhum (auto-detectar por domínio)</SelectItem>
            {clients?.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.full_name} ({c.email})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex items-center gap-3">
        <Switch
          checked={account.is_active}
          onCheckedChange={(checked) => onChange({ is_active: checked })}
        />
        <Label>Conta ativa</Label>
      </div>
    </div>
  );

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
          <TabsList className="flex-wrap">
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
            <TabsTrigger value="notifications" className="gap-2">
              <Bell className="w-4 h-4" />
              Notificações
            </TabsTrigger>
          </TabsList>

          {/* IMAP Tab */}
          <TabsContent value="imap">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Contas de Email para Captura de Tickets</CardTitle>
                    <CardDescription>
                      Configure as contas IMAP que o sistema verificará periodicamente. Cada conta pode ser vinculada a um cliente específico.
                    </CardDescription>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="secondary"
                      onClick={handleProcessEmails}
                      disabled={processingEmails}
                      className="gap-2"
                    >
                      {processingEmails ? <Loader2 className="w-4 h-4 animate-spin" /> : <Inbox className="w-4 h-4" />}
                      Verificar Emails
                    </Button>
                    <Button onClick={() => setIsAddingAccount(true)} disabled={isAddingAccount} className="gap-2">
                      <Plus className="w-4 h-4" />
                      Nova Conta
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Add new account form */}
                {isAddingAccount && (
                  <Card className="border-primary/30 bg-primary/5">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-lg">Nova Conta IMAP</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {renderImapAccountForm(newAccount, (updates) => setNewAccount((prev) => ({ ...prev, ...updates })), "new-imap")}
                      <div className="flex gap-3">
                        <Button
                          onClick={() => createImapMutation.mutate(newAccount)}
                          disabled={createImapMutation.isPending || !newAccount.host || !newAccount.username}
                          className="gap-2"
                        >
                          {createImapMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                          Salvar
                        </Button>
                        <Button variant="ghost" onClick={() => setIsAddingAccount(false)} className="gap-2">
                          <X className="w-4 h-4" />
                          Cancelar
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Existing accounts list */}
                {(!imapAccounts || imapAccounts.length === 0) && !isAddingAccount && (
                  <div className="text-center py-8 text-muted-foreground">
                    <Mail className="w-12 h-12 mx-auto mb-3 opacity-30" />
                    <p>Nenhuma conta IMAP configurada.</p>
                    <p className="text-sm">Clique em "Nova Conta" para adicionar.</p>
                  </div>
                )}

                {imapAccounts?.map((account) => (
                  <Card key={account.id} className={!account.is_active ? "opacity-60" : ""}>
                    <CardContent className="pt-4">
                      {editingAccount?.id === account.id ? (
                        <div className="space-y-4">
                          {renderImapAccountForm(
                            editingAccount,
                            (updates) => setEditingAccount((prev) => prev ? { ...prev, ...updates } : prev),
                            `edit-${account.id}`
                          )}
                          <div className="flex gap-3">
                            <Button
                              onClick={() => updateImapMutation.mutate(editingAccount)}
                              disabled={updateImapMutation.isPending}
                              className="gap-2"
                            >
                              {updateImapMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                              Salvar
                            </Button>
                            <Button variant="ghost" onClick={() => setEditingAccount(null)} className="gap-2">
                              <X className="w-4 h-4" />
                              Cancelar
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center justify-between">
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <h3 className="font-semibold">{account.label || account.username}</h3>
                              {!account.is_active && (
                                <span className="text-xs bg-muted px-2 py-0.5 rounded-full">Inativa</span>
                              )}
                            </div>
                            <p className="text-sm text-muted-foreground">
                              {account.host}:{account.port} — {account.username}
                            </p>
                            <p className="text-sm text-muted-foreground">
                              Cliente: {getClientName(account.client_id)}
                            </p>
                            {account.last_checked_at && (
                              <p className="text-xs text-muted-foreground">
                                Última verificação: {new Date(account.last_checked_at).toLocaleString("pt-BR")}
                              </p>
                            )}
                          </div>
                          <div className="flex gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleTestImap(account)}
                              disabled={testingImapId === account.id}
                              className="gap-1"
                            >
                              {testingImapId === account.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <TestTube className="w-3 h-3" />}
                              Testar
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setEditingAccount({ ...account })}
                              className="gap-1"
                            >
                              <Edit2 className="w-3 h-3" />
                              Editar
                            </Button>
                            <Button
                              variant="destructive"
                              size="sm"
                              onClick={() => {
                                if (confirm("Tem certeza que deseja remover esta conta IMAP?")) {
                                  deleteImapMutation.mutate(account.id);
                                }
                              }}
                              className="gap-1"
                            >
                              <Trash2 className="w-3 h-3" />
                            </Button>
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </CardContent>
            </Card>
          </TabsContent>

          {/* SMTP Tab */}
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
                  <Input id="smtp_from_name" placeholder="FM TechFlow Suporte" value={smtpForm.smtp_from_name} onChange={(e) => setSmtpForm((f) => ({ ...f, smtp_from_name: e.target.value }))} />
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
          </TabsContent>

          {/* WhatsApp Tab */}
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
                  <Input id="whatsapp_api_url" placeholder="https://ipazua.uazapi.com" value={whatsappForm.whatsapp_api_url} onChange={(e) => setWhatsappForm((f) => ({ ...f, whatsapp_api_url: e.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="whatsapp_api_token">Token da Instância</Label>
                  <div className="relative">
                    <Input id="whatsapp_api_token" type={showPasswords.whatsapp ? "text" : "password"} placeholder="••••••••" value={whatsappForm.whatsapp_api_token} onChange={(e) => setWhatsappForm((f) => ({ ...f, whatsapp_api_token: e.target.value }))} />
                    <button type="button" onClick={() => togglePassword("whatsapp")} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                      {showPasswords.whatsapp ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
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
          </TabsContent>

          {/* Notifications Tab */}
          <TabsContent value="notifications">
            <NotificationsTab settings={settings} saveMutation={saveMutation} user={user} />
          </TabsContent>
        </Tabs>
      </div>
    </AdminLayout>
  );
};

export default SystemSettings;
