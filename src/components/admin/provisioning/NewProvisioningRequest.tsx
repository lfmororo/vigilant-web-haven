import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue } from
"@/components/ui/select";
import { toast } from "sonner";
import { UserPlus } from "lucide-react";

interface Option {id: string;name: string;}

export interface NewProvisioningRequestProps {
  onCreated: () => void;
}

const gerarSenha = () => {
  const base = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  let saida = "";
  const bytes = crypto.getRandomValues(new Uint32Array(10));
  bytes.forEach((b) => (saida += base[b % base.length]));
  return `${saida}@1`;
};

const NewProvisioningRequest = ({ onCreated }: NewProvisioningRequestProps) => {
  const [clients, setClients] = useState<Option[]>([]);
  const [sectors, setSectors] = useState<Option[]>([]);
  const [clientId, setClientId] = useState("");
  const [sectorId, setSectorId] = useState("");
  const [fullName, setFullName] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState(gerarSenha());
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (supabase.from("clients") as any).
    select("id, name").
    order("name").
    then(({ data }: { data: Option[] | null }) => setClients(data || []));
  }, []);

  useEffect(() => {
    if (!clientId) return setSectors([]);
    (supabase.from("client_sectors" as any) as any).
    select("id, name").
    eq("client_id", clientId).
    order("name").
    then(({ data }: { data: Option[] | null }) => setSectors(data || []));
  }, [clientId]);

  const submit = async () => {
    if (!clientId || !fullName.trim() || !username.trim()) {
      toast.error("Informe a empresa, o nome completo e o login.");
      return;
    }
    setSaving(true);
    const { error } = await (supabase.from("provisioning_requests" as any) as any).insert({
      client_id: clientId,
      sector_id: sectorId || null,
      full_name: fullName.trim(),
      username: username.trim().toLowerCase(),
      email: email.trim() || null,
      phone: phone.trim() || null,
      job_title: jobTitle.trim() || null,
      initial_password: password
    });
    setSaving(false);
    if (error) {
      toast.error(`Erro ao criar: ${error.message}`);
      return;
    }
    toast.success("Pedido criado. O agente do servidor vai executar em instantes.");
    setFullName("");setUsername("");setEmail("");setJobTitle("");setPhone("");
    setPassword(gerarSenha());
    onCreated();
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <UserPlus className="w-5 h-5" /> Novo usuário
        </CardTitle>
        <CardDescription>
          Cria o usuário no Active Directory, adiciona aos grupos e monta as pastas do setor.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label>Empresa</Label>
          <Select value={clientId} onValueChange={setClientId}>
            <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
            <SelectContent>
              {clients.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Setor</Label>
          <Select value={sectorId} onValueChange={setSectorId} disabled={!clientId}>
            <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
            <SelectContent>
              {sectors.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Nome completo</Label>
          <Input value={fullName} onChange={(e) => setFullName(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label>Login (usuário do AD)</Label>
          <Input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="joao.silva" />
        </div>
        <div className="space-y-2">
          <Label>E-mail</Label>
          <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="joao.silva@empresa.com.br" />
        </div>
        <div className="space-y-2">
          <Label>Cargo</Label>
          <Input value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label>Telefone</Label>
          <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label>Senha inicial</Label>
          <div className="flex gap-2">
            <Input value={password} onChange={(e) => setPassword(e.target.value)} />
            <Button type="button" variant="outline" onClick={() => setPassword(gerarSenha())}>
              Gerar
            </Button>
          </div>
        </div>
        <div className="md:col-span-2">
          <Button onClick={submit} disabled={saving} className="w-full md:w-auto">
            {saving ? "Enviando..." : "Criar usuário"}
          </Button>
        </div>
      </CardContent>
    </Card>);

};

export default NewProvisioningRequest;
