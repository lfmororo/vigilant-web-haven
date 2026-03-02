import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Plus, X, Loader2, Phone, Pencil, Check } from "lucide-react";

interface Sector {
  id: string;
  name: string;
  client_id: string;
  phone: string | null;
}

interface SectorManagementProps {
  clientId: string;
}

const SectorManagement = ({ clientId }: SectorManagementProps) => {
  const { toast } = useToast();
  const [sectors, setSectors] = useState<Sector[]>([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editPhone, setEditPhone] = useState("");

  const fetchSectors = async () => {
    const { data } = await (supabase.from("client_sectors" as any) as any)
      .select("id, name, client_id, phone")
      .eq("client_id", clientId)
      .order("name");
    setSectors(data || []);
    setLoading(false);
  };

  useEffect(() => {
    fetchSectors();
  }, [clientId]);

  const handleAdd = async () => {
    if (!newName.trim()) return;
    setAdding(true);
    const { error } = await (supabase.from("client_sectors" as any) as any).insert({
      client_id: clientId,
      name: newName.trim(),
      phone: newPhone.trim() || null,
    });
    if (error) {
      toast({ variant: "destructive", title: "Erro", description: error.message.includes("unique") ? "Setor já existe para este cliente" : error.message });
    } else {
      toast({ title: "Setor adicionado" });
      setNewName("");
      setNewPhone("");
      fetchSectors();
    }
    setAdding(false);
  };

  const handleRemove = async (sectorId: string) => {
    const { error } = await (supabase.from("client_sectors" as any) as any).delete().eq("id", sectorId);
    if (error) {
      toast({ variant: "destructive", title: "Erro ao remover setor", description: error.message });
    } else {
      fetchSectors();
    }
  };

  const handleEditPhone = (sector: Sector) => {
    setEditingId(sector.id);
    setEditPhone(sector.phone || "");
  };

  const handleSavePhone = async (sectorId: string) => {
    const { error } = await (supabase.from("client_sectors" as any) as any)
      .update({ phone: editPhone.trim() || null })
      .eq("id", sectorId);
    if (error) {
      toast({ variant: "destructive", title: "Erro", description: error.message });
    } else {
      toast({ title: "Telefone atualizado" });
      setEditingId(null);
      fetchSectors();
    }
  };

  if (loading) return <Loader2 className="w-4 h-4 animate-spin" />;

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        {sectors.length === 0 && (
          <p className="text-xs text-muted-foreground">Nenhum setor cadastrado</p>
        )}
        {sectors.map((s) => (
          <div key={s.id} className="flex items-center gap-2 text-sm">
            <Badge variant="secondary" className="gap-1 pr-1 shrink-0">
              {s.name}
              <button
                type="button"
                onClick={() => handleRemove(s.id)}
                className="ml-0.5 rounded-full hover:bg-destructive/20 p-0.5"
              >
                <X className="w-3 h-3" />
              </button>
            </Badge>
            {editingId === s.id ? (
              <div className="flex items-center gap-1 flex-1">
                <Phone className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                <Input
                  value={editPhone}
                  onChange={(e) => setEditPhone(e.target.value)}
                  placeholder="5511999999999"
                  className="h-7 text-xs flex-1"
                  onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), handleSavePhone(s.id))}
                />
                <Button type="button" size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => handleSavePhone(s.id)}>
                  <Check className="w-3.5 h-3.5" />
                </Button>
              </div>
            ) : (
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                {s.phone ? (
                  <>
                    <Phone className="w-3 h-3" />
                    <span>{s.phone}</span>
                  </>
                ) : null}
                <button
                  type="button"
                  onClick={() => handleEditPhone(s)}
                  className="ml-1 hover:text-foreground"
                  title={s.phone ? "Editar telefone" : "Adicionar telefone"}
                >
                  <Pencil className="w-3 h-3" />
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
      <div className="flex gap-2">
        <Input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="Nome do setor"
          className="flex-1"
          onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), handleAdd())}
        />
        <Input
          value={newPhone}
          onChange={(e) => setNewPhone(e.target.value)}
          placeholder="Telefone (opcional)"
          className="flex-1"
        />
        <Button type="button" size="sm" onClick={handleAdd} disabled={adding || !newName.trim()}>
          {adding ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
        </Button>
      </div>
    </div>
  );
};

export default SectorManagement;
