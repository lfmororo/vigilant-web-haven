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

interface Option {id: string;name: string;}

interface TemplateForm {
  ad_ou: string;
  ad_groups: string;
  base_path: string;
  subfolders: string;
  home_drive: string;
  email_domain: string;
  email_groups: string;
}

const vazio: TemplateForm = {
  ad_ou: "",
  ad_groups: "",
  base_path: "",
  subfolders: "Documentos, Area de Trabalho, Downloads",
  home_drive: "",
  email_domain: "",
  email_groups: ""
};

const lista = (valor: string) =>
valor.split(/[;,\n]/).map((v) => v.trim()).filter(Boolean);

const ProvisioningTemplates = () => {
  const [clients, setClients] = useState<Option[]>([]);
  const [sectors, setSectors] = useState<Option[]>([]);
  const [clientId, setClientId] = useState("");
  const [sectorId, setSectorId] = useState("");
  const [form, setForm] = useState<TemplateForm>(vazio);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (supabase.from("clients") as any).
    select("id, name").order("name").
    then(({ data }: { data: Option[] | null }) => setClients(data || []));
  }, []);

  useEffect(() => {
    if (!clientId) return setSectors([]);
    (supabase.from("client_sectors" as any) as any).
    select("id, name").eq("client_id", clientId).order("name").
    then(({ data }: { data: Option[] | null }) => setSectors(data || []));
  }, [clientId]);

  useEffect(() => {
    if (!clientId) return;
    (async () => {
      const query = (supabase.from("provisioning_templates" as any) as any).
      select("*").eq("client_id", clientId);
      const { data } = sectorId ?
      await query.eq("sector_id", sectorId).maybeSingle() :
      await query.is("sector_id", null).maybeSingle();

      if (!data) return setForm(vazio);
      setForm({
        ad_ou: data.ad_ou || "",
        ad_groups: (data.ad_groups || []).join(", "),
        base_path: data.base_path || "",
        subfolders: (data.subfolders || []).join(", "),
        home_drive: data.home_drive || "",
        email_domain: data.email_domain || "",
        email_groups: (data.email_groups || []).join(", ")
      });
    })();
  }, [clientId, sectorId]);

  const salvar = async () => {
    if (!clientId) return toast.error("Selecione a empresa.");
    setSaving(true);
    const payload = {
      client_id: clientId,
      sector_id: sectorId || null,
      ad_ou: form.ad_ou.trim() || null,
      ad_groups: lista(form.ad_groups),
      base_path: form.base_path.trim() || null,
      subfolders: lista(form.subfolders),
      home_drive: form.home_drive.trim() || null,
      email_domain: form.email_domain.trim() || null,
      email_groups: lista(form.email_groups)
    };
    const table = (supabase.from("provisioning_templates" as any) as any);
    const existing = sectorId ?
    await table.select("id").eq("client_id", clientId).eq("sector_id", sectorId).maybeSingle() :
    await table.select("id").eq("client_id", clientId).is("sector_id", null).maybeSingle();

    const { error } = existing.data?.id ?
    await table.update(payload).eq("id", existing.data.id) :
    await table.insert(payload);

    setSaving(false);
    if (error) return toast.error(`Erro ao salvar: ${error.message}`);
    toast.success("Modelo salvo.");
  };

  const campo = (rotulo: string, chave: keyof TemplateForm, dica?: string) =>
  <div className="space-y-2" key={chave}>
      <Label>{rotulo}</Label>
      <Input
      value={form[chave]}
      placeholder={dica}
      onChange={(e) => setForm({ ...form, [chave]: e.target.value })} />

    </div>;


  return (
    <Card>
      <CardHeader>
        <CardTitle>Modelo por setor</CardTitle>
        <CardDescription>
          Define onde o usuário é criado, os grupos que recebe e as pastas montadas.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label>Empresa</Label>
          <Select value={clientId} onValueChange={(v) => {setClientId(v);setSectorId("");}}>
            <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
            <SelectContent>
              {clients.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Setor (vazio = padrão da empresa)</Label>
          <Select value={sectorId} onValueChange={setSectorId} disabled={!clientId}>
            <SelectTrigger><SelectValue placeholder="Padrão da empresa" /></SelectTrigger>
            <SelectContent>
              {sectors.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        {campo("Unidade organizacional do AD", "ad_ou", "OU=Financeiro,DC=empresa,DC=local")}
        {campo("Grupos do AD (separe por vírgula)", "ad_groups", "GG_Financeiro, VPN")}
        {campo("Caminho base das pastas", "base_path", "\\\\servidor\\setores\\financeiro")}
        {campo("Subpastas do usuário", "subfolders", "Documentos, Area de Trabalho")}
        {campo("Letra da unidade de rede", "home_drive", "H:")}
        {campo("Domínio de e-mail (Locaweb)", "email_domain", "empresa.com.br")}
        {campo("Grupos de e-mail", "email_groups", "financeiro@empresa.com.br")}
        <div className="md:col-span-2">
          <Button onClick={salvar} disabled={saving}>
            {saving ? "Salvando..." : "Salvar modelo"}
          </Button>
        </div>
      </CardContent>
    </Card>);

};

export default ProvisioningTemplates;
