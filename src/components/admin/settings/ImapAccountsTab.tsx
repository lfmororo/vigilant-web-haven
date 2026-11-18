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

/** Contas IMAP lidas para abrir chamados por e-mail. */
export default function ImapAccountsTab() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // SMTP form state
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
  const [testingImapId, setTestingImapId] = useState<string | null>(null);
  const [processingEmails, setProcessingEmails] = useState(false);

  // Fetch system settings
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

  const getClientName = (clientId: string | null) => {
    if (!clientId || !clients) return "Nenhum (auto-detectar)";
    const client = clients.find((c) => c.id === clientId);
    return client ? client.full_name : "Cliente não encontrado";
  };

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


  if (imapLoading) {
    return <div className="flex items-center justify-center h-64"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;
  }

  return (
    <>
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
    </>
  );
}
