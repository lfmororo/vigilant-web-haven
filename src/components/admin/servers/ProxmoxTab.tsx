import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/hooks/use-toast";
import { Boxes, Plus } from "lucide-react";
import ProxmoxNodeCard from "./ProxmoxNodeCard";
import type { ProxmoxGuest, ProxmoxNode } from "./proxmoxTypes";

interface ProxmoxFormState {
  name: string;
  host: string;
  client_id: string;
  port: number;
  node_name: string;
  auth_mode: "token" | "password";
  username: string;
  token_name: string;
  token_secret: string;
  password: string;
  is_active: boolean;
}

const EMPTY_FORM: ProxmoxFormState = {
  name: "", host: "", client_id: "", port: 8006, node_name: "", auth_mode: "token",
  username: "root@pam", token_name: "monitor", token_secret: "", password: "", is_active: true,
};

export interface ProxmoxTabProps {
  clients: { id: string; full_name: string }[];
}

const ProxmoxTab = ({ clients }: ProxmoxTabProps) => {
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [form, setForm] = useState<ProxmoxFormState>(EMPTY_FORM);

  const { data: nodes } = useQuery({
    queryKey: ["proxmox-nodes"],
    queryFn: async () => {
      const { data, error } = await supabase.from("proxmox_nodes").select("*, clients(full_name)").order("name");
      if (error) throw error;
      return (data || []) as ProxmoxNode[];
    },
    refetchInterval: 30000,
  });

  const { data: guests } = useQuery({
    queryKey: ["proxmox-guests"],
    queryFn: async () => {
      const { data, error } = await supabase.from("proxmox_guests").select("*").order("vmid");
      if (error) throw error;
      return (data || []) as ProxmoxGuest[];
    },
    refetchInterval: 30000,
  });

  const saveNode = useMutation({
    mutationFn: async (payload: ProxmoxFormState) => {
      if (!payload.name.trim() || !payload.host.trim() || !payload.client_id) {
        throw new Error("Cliente, nome e endereço do Proxmox são obrigatórios.");
      }
      if (!editingId && payload.auth_mode === "token" && !payload.token_secret) {
        throw new Error("Informe o Token Secret gerado no Proxmox.");
      }
      if (!editingId && payload.auth_mode === "password" && !payload.password) {
        throw new Error("Informe a senha do usuário do Proxmox.");
      }

      const record: Record<string, unknown> = {
        name: payload.name.trim(),
        host: payload.host.trim(),
        client_id: payload.client_id,
        port: payload.port,
        node_name: payload.node_name.trim() || null,
        auth_mode: payload.auth_mode,
        username: payload.username.trim(),
        token_name: payload.token_name.trim() || null,
        is_active: payload.is_active,
      };
      // Campos secretos em branco na edição = manter o valor atual.
      if (payload.token_secret) record.token_secret = payload.token_secret;
      if (payload.password) record.password = payload.password;

      if (editingId) {
        const { error } = await supabase.from("proxmox_nodes").update(record).eq("id", editingId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("proxmox_nodes").insert(record as never);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["proxmox-nodes"] });
      setDialogOpen(false);
      setEditingId(null);
      toast({ title: editingId ? "Nó Proxmox atualizado" : "Nó Proxmox adicionado" });
    },
    onError: (e: Error) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  const deleteNode = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("proxmox_nodes").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["proxmox-nodes"] });
      queryClient.invalidateQueries({ queryKey: ["proxmox-guests"] });
      toast({ title: "Nó Proxmox removido" });
    },
    onError: (e: Error) => toast({ title: "Erro ao remover", description: e.message, variant: "destructive" }),
  });

  const guestsByNode = useMemo(() => {
    const map: Record<string, ProxmoxGuest[]> = {};
    (guests || []).forEach((g) => { (map[g.node_id] ||= []).push(g); });
    return map;
  }, [guests]);

  const openAdd = () => { setEditingId(null); setForm(EMPTY_FORM); setDialogOpen(true); };

  const openEdit = (node: ProxmoxNode) => {
    setEditingId(node.id);
    setForm({
      name: node.name, host: node.host, client_id: node.client_id, port: node.port,
      node_name: node.node_name || "", auth_mode: node.auth_mode === "password" ? "password" : "token",
      username: node.username, token_name: node.token_name || "", token_secret: "", password: "",
      is_active: node.is_active,
    });
    setDialogOpen(true);
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button size="sm" onClick={openAdd}><Plus className="w-4 h-4 mr-1" /> Adicionar Nó Proxmox</Button>
      </div>

      {(nodes || []).map((node) => (
        <ProxmoxNodeCard
          key={node.id}
          node={node}
          guests={guestsByNode[node.id] || []}
          expanded={expandedId === node.id}
          onToggle={() => setExpandedId(expandedId === node.id ? null : node.id)}
          onEdit={() => openEdit(node)}
          onDelete={() => deleteNode.mutate(node.id)}
        />
      ))}

      {(!nodes || nodes.length === 0) && (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground space-y-2">
            <Boxes className="w-8 h-8 mx-auto opacity-60" />
            <p>Nenhum nó Proxmox VE cadastrado.</p>
            <p className="text-xs">Cadastre o endereço do Proxmox e rode o coletor (aba “Guia Coletor”).</p>
          </CardContent>
        </Card>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingId ? "Editar" : "Adicionar"} Nó Proxmox VE</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Cliente</Label>
              <Select value={form.client_id} onValueChange={(v) => setForm((p) => ({ ...p, client_id: v }))}>
                <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                <SelectContent>
                  {clients.map((c) => <SelectItem key={c.id} value={c.id}>{c.full_name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Nome</Label>
                <Input value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} placeholder="Ex: PVE-01" />
              </div>
              <div>
                <Label>Nome do nó no cluster <span className="text-xs text-muted-foreground">(opcional)</span></Label>
                <Input value={form.node_name} onChange={(e) => setForm((p) => ({ ...p, node_name: e.target.value }))} placeholder="pve" />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2">
                <Label>IP / Host</Label>
                <Input value={form.host} onChange={(e) => setForm((p) => ({ ...p, host: e.target.value }))} placeholder="192.168.1.10" />
              </div>
              <div>
                <Label>Porta</Label>
                <Input type="number" value={form.port} onChange={(e) => setForm((p) => ({ ...p, port: Number(e.target.value) || 8006 }))} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Autenticação</Label>
                <Select value={form.auth_mode} onValueChange={(v) => setForm((p) => ({ ...p, auth_mode: v as "token" | "password" }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="token">API Token (recomendado)</SelectItem>
                    <SelectItem value="password">Usuário e senha</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Usuário</Label>
                <Input value={form.username} onChange={(e) => setForm((p) => ({ ...p, username: e.target.value }))} placeholder="root@pam" />
              </div>
            </div>
            {form.auth_mode === "token" ? (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Token ID</Label>
                  <Input value={form.token_name} onChange={(e) => setForm((p) => ({ ...p, token_name: e.target.value }))} placeholder="monitor" />
                </div>
                <div>
                  <Label>Token Secret {editingId && <span className="text-xs text-muted-foreground">(manter em branco)</span>}</Label>
                  <Input type="password" value={form.token_secret} onChange={(e) => setForm((p) => ({ ...p, token_secret: e.target.value }))} />
                </div>
              </div>
            ) : (
              <div>
                <Label>Senha {editingId && <span className="text-xs text-muted-foreground">(manter em branco)</span>}</Label>
                <Input type="password" value={form.password} onChange={(e) => setForm((p) => ({ ...p, password: e.target.value }))} />
              </div>
            )}
            <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2">
              <div>
                <Label>Monitoramento ativo</Label>
                <p className="text-xs text-muted-foreground">Quando desligado, o coletor ignora este nó.</p>
              </div>
              <Switch checked={form.is_active} onCheckedChange={(v) => setForm((p) => ({ ...p, is_active: v }))} />
            </div>
            <Button className="w-full" onClick={() => saveNode.mutate(form)} disabled={saveNode.isPending}>
              {editingId ? "Salvar" : "Adicionar"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ProxmoxTab;
