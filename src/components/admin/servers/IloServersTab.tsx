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
import { Plus, ServerCog } from "lucide-react";
import IloServerCard from "./IloServerCard";
import type { IloEvent, IloSensor, IloServer } from "./iloTypes";

interface IloFormState {
  name: string;
  host: string;
  client_id: string;
  username: string;
  password: string;
  port: number;
  is_active: boolean;
}

const EMPTY_FORM: IloFormState = {
  name: "", host: "", client_id: "", username: "monitor", password: "", port: 443, is_active: true,
};

export interface IloServersTabProps {
  clients: { id: string; full_name: string }[];
}

const IloServersTab = ({ clients }: IloServersTabProps) => {
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [form, setForm] = useState<IloFormState>(EMPTY_FORM);

  const { data: servers } = useQuery({
    queryKey: ["ilo-servers"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ilo_servers")
        .select("*, clients(full_name)")
        .order("name");
      if (error) throw error;
      return (data || []) as IloServer[];
    },
    refetchInterval: 30000,
  });

  const { data: sensors } = useQuery({
    queryKey: ["ilo-sensors"],
    queryFn: async () => {
      const { data, error } = await supabase.from("ilo_sensors").select("*").order("name");
      if (error) throw error;
      return (data || []) as IloSensor[];
    },
    refetchInterval: 30000,
  });

  const { data: events } = useQuery({
    queryKey: ["ilo-events"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ilo_events")
        .select("*")
        .order("recorded_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data || []) as IloEvent[];
    },
    refetchInterval: 30000,
  });

  const saveServer = useMutation({
    mutationFn: async (payload: IloFormState) => {
      if (!payload.name.trim() || !payload.host.trim() || !payload.client_id) {
        throw new Error("Cliente, nome e endereço do iLO são obrigatórios.");
      }
      if (!editingId && !payload.password) {
        throw new Error("Informe a senha do usuário do iLO.");
      }

      const record: Record<string, unknown> = {
        name: payload.name.trim(),
        host: payload.host.trim(),
        client_id: payload.client_id,
        username: payload.username.trim(),
        port: payload.port,
        is_active: payload.is_active,
      };
      // Senha em branco na edição = manter a senha atual.
      if (payload.password) record.password = payload.password;

      if (editingId) {
        const { error } = await supabase.from("ilo_servers").update(record).eq("id", editingId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("ilo_servers").insert(record as never);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ilo-servers"] });
      setDialogOpen(false);
      setEditingId(null);
      toast({ title: editingId ? "Servidor iLO atualizado" : "Servidor iLO adicionado" });
    },
    onError: (e: Error) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  const deleteServer = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("ilo_servers").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ilo-servers"] });
      queryClient.invalidateQueries({ queryKey: ["ilo-sensors"] });
      queryClient.invalidateQueries({ queryKey: ["ilo-events"] });
      toast({ title: "Servidor iLO removido" });
    },
    onError: (e: Error) => toast({ title: "Erro ao remover", description: e.message, variant: "destructive" }),
  });

  const sensorsByServer = useMemo(() => {
    const map: Record<string, IloSensor[]> = {};
    (sensors || []).forEach((s) => {
      (map[s.server_id] ||= []).push(s);
    });
    return map;
  }, [sensors]);

  const eventsByServer = useMemo(() => {
    const map: Record<string, IloEvent[]> = {};
    (events || []).forEach((e) => {
      (map[e.server_id] ||= []).push(e);
    });
    return map;
  }, [events]);

  const openAdd = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setDialogOpen(true);
  };

  const openEdit = (server: IloServer) => {
    setEditingId(server.id);
    setForm({
      name: server.name,
      host: server.host,
      client_id: server.client_id,
      username: server.username,
      password: "",
      port: server.port,
      is_active: server.is_active,
    });
    setDialogOpen(true);
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button size="sm" onClick={openAdd}>
          <Plus className="w-4 h-4 mr-1" /> Adicionar Servidor iLO
        </Button>
      </div>

      {(servers || []).map((server) => (
        <IloServerCard
          key={server.id}
          server={server}
          sensors={sensorsByServer[server.id] || []}
          events={eventsByServer[server.id] || []}
          expanded={expandedId === server.id}
          onToggle={() => setExpandedId(expandedId === server.id ? null : server.id)}
          onEdit={() => openEdit(server)}
          onDelete={() => deleteServer.mutate(server.id)}
        />
      ))}

      {(!servers || servers.length === 0) && (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground space-y-2">
            <ServerCog className="w-8 h-8 mx-auto opacity-60" />
            <p>Nenhum servidor HP iLO cadastrado.</p>
            <p className="text-xs">Cadastre o endereço do iLO e rode o coletor (aba “Guia Coletor”).</p>
          </CardContent>
        </Card>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingId ? "Editar" : "Adicionar"} Servidor HP iLO4</DialogTitle>
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
            <div>
              <Label>Nome</Label>
              <Input value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} placeholder="Ex: ILO-DL380-01" />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2">
                <Label>IP / Host do iLO</Label>
                <Input value={form.host} onChange={(e) => setForm((p) => ({ ...p, host: e.target.value }))} placeholder="192.168.1.50" />
              </div>
              <div>
                <Label>Porta HTTPS</Label>
                <Input type="number" value={form.port} onChange={(e) => setForm((p) => ({ ...p, port: Number(e.target.value) || 443 }))} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Usuário do iLO</Label>
                <Input value={form.username} onChange={(e) => setForm((p) => ({ ...p, username: e.target.value }))} />
              </div>
              <div>
                <Label>Senha {editingId && <span className="text-xs text-muted-foreground">(manter em branco)</span>}</Label>
                <Input type="password" value={form.password} onChange={(e) => setForm((p) => ({ ...p, password: e.target.value }))} />
              </div>
            </div>
            <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2">
              <div>
                <Label>Monitoramento ativo</Label>
                <p className="text-xs text-muted-foreground">Quando desligado, o coletor ignora este servidor.</p>
              </div>
              <Switch checked={form.is_active} onCheckedChange={(v) => setForm((p) => ({ ...p, is_active: v }))} />
            </div>
            <Button className="w-full" onClick={() => saveServer.mutate(form)} disabled={saveServer.isPending}>
              {editingId ? "Salvar" : "Adicionar"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default IloServersTab;
