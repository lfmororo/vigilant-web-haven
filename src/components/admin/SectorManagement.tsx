import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Plus, X, Loader2 } from "lucide-react";

interface Sector {
  id: string;
  name: string;
  client_id: string;
}

interface SectorManagementProps {
  clientId: string;
}

const SectorManagement = ({ clientId }: SectorManagementProps) => {
  const { toast } = useToast();
  const [sectors, setSectors] = useState<Sector[]>([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState("");
  const [adding, setAdding] = useState(false);

  const fetchSectors = async () => {
    const { data } = await (supabase.from("client_sectors" as any) as any)
      .select("id, name, client_id")
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
    });
    if (error) {
      toast({ variant: "destructive", title: "Erro", description: error.message.includes("unique") ? "Setor já existe para este cliente" : error.message });
    } else {
      toast({ title: "Setor adicionado" });
      setNewName("");
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

  if (loading) return <Loader2 className="w-4 h-4 animate-spin" />;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1.5">
        {sectors.length === 0 && (
          <p className="text-xs text-muted-foreground">Nenhum setor cadastrado</p>
        )}
        {sectors.map((s) => (
          <Badge key={s.id} variant="secondary" className="gap-1 pr-1">
            {s.name}
            <button
              type="button"
              onClick={() => handleRemove(s.id)}
              className="ml-0.5 rounded-full hover:bg-destructive/20 p-0.5"
            >
              <X className="w-3 h-3" />
            </button>
          </Badge>
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
        <Button type="button" size="sm" onClick={handleAdd} disabled={adding || !newName.trim()}>
          {adding ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
        </Button>
      </div>
    </div>
  );
};

export default SectorManagement;
