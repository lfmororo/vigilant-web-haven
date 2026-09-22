import { useEffect, useMemo, useState } from "react";
import { KeyRound, RefreshCw, Search, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import ResetADPasswordDialog, { type PasswordResetUser } from "./ResetADPasswordDialog";
import { toast } from "sonner";

interface CompletedUser {
  id: string;
  client_id: string;
  full_name: string;
  username: string;
  email: string | null;
  phone: string | null;
  job_title: string | null;
  sector_id: string | null;
  finished_at: string | null;
  whatsapp_notification_status: string;
  clients: { full_name: string } | { full_name: string }[] | null;
}

export interface CompletedADUsersProps { refreshToken: number }

const clientName = (row: CompletedUser) => {
  const client = Array.isArray(row.clients) ? row.clients[0] : row.clients;
  return client?.full_name || "Empresa não informada";
};

const notificationLabel: Record<string, string> = {
  sent: "WhatsApp enviado", failed: "Falha no WhatsApp", skipped: "WhatsApp desativado",
  sending: "Enviando WhatsApp", pending: "WhatsApp pendente",
};

const CompletedADUsers = ({ refreshToken }: CompletedADUsersProps) => {
  const [rows, setRows] = useState<CompletedUser[]>([]);
  const [clientId, setClientId] = useState("all");
  const [search, setSearch] = useState("");
  const [selectedUser, setSelectedUser] = useState<PasswordResetUser | null>(null);
  const [actionMode, setActionMode] = useState<"change" | "resend">("change");
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    const load = async () => {
      const { data, error } = await supabase.from("provisioning_requests")
        .select("id, client_id, sector_id, full_name, username, email, phone, job_title, finished_at, whatsapp_notification_status, clients(full_name)")
        .eq("status", "done").order("finished_at", { ascending: false });
      if (error) toast.error(`Erro ao carregar usuários do AD: ${error.message}`);
      else setRows((data as unknown as CompletedUser[]) || []);
    };
    load();
  }, [refreshToken, reloadToken]);

  const openAction = (row: CompletedUser, mode: "change" | "resend") => {
    setActionMode(mode);
    setSelectedUser(row);
  };

  const clients = useMemo(() => Array.from(new Map(rows.map((row) => [row.client_id, clientName(row)])).entries()), [rows]);
  const filtered = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("pt-BR");
    return rows.filter((row) => (clientId === "all" || row.client_id === clientId) && (!term ||
      [row.full_name, row.username, row.email || ""].some((value) => value.toLocaleLowerCase("pt-BR").includes(term))));
  }, [clientId, rows, search]);

  return <Card><CardHeader><CardTitle className="flex items-center gap-2"><Users className="h-5 w-5" /> Usuários criados no AD</CardTitle><CardDescription>Consulte os usuários concluídos de cada empresa.</CardDescription></CardHeader><CardContent className="space-y-4">
    <div className="grid gap-3 md:grid-cols-2"><Select value={clientId} onValueChange={setClientId}><SelectTrigger aria-label="Filtrar por empresa"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Todas as empresas</SelectItem>{clients.map(([id, name]) => <SelectItem key={id} value={id}>{name}</SelectItem>)}</SelectContent></Select><div className="relative"><Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" /><Input className="pl-9" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar nome, usuário ou e-mail" /></div></div>
    <div className="overflow-x-auto"><table className="w-full min-w-[980px] text-sm"><thead><tr className="border-b text-left text-muted-foreground"><th className="p-3">Empresa</th><th className="p-3">Usuário</th><th className="p-3">E-mail</th><th className="p-3">Criado em</th><th className="p-3">Aviso</th><th className="p-3 text-right">Ações</th></tr></thead><tbody>{filtered.map((row) => <tr key={row.id} className="border-b border-border/60"><td className="p-3">{clientName(row)}</td><td className="p-3"><div className="font-medium">{row.full_name}</div><div className="text-muted-foreground">{row.username}</div></td><td className="p-3">{row.email || "—"}</td><td className="p-3">{row.finished_at ? new Date(row.finished_at).toLocaleString("pt-BR") : "—"}</td><td className="p-3"><Badge variant={row.whatsapp_notification_status === "failed" ? "destructive" : "secondary"}>{notificationLabel[row.whatsapp_notification_status] || "Pendente"}</Badge></td><td className="p-3"><div className="flex justify-end gap-2"><Button size="sm" variant="outline" onClick={() => openAction(row, "change")}><KeyRound /> Alterar senha</Button><Button size="sm" variant="secondary" onClick={() => openAction(row, "resend")}><RefreshCw /> Reenviar dados</Button></div></td></tr>)}</tbody></table></div>
    {filtered.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">Nenhum usuário criado encontrado.</p>}
    <ResetADPasswordDialog user={selectedUser} mode={actionMode} onClose={() => setSelectedUser(null)} onQueued={() => setReloadToken((value) => value + 1)} />
  </CardContent></Card>;
};

export default CompletedADUsers;