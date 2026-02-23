import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface Sector {
  id: string;
  name: string;
  client_id: string;
}

interface SectorSelectProps {
  clientId: string | null | undefined;
  value: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  includeNone?: boolean;
}

const SectorSelect = ({
  clientId,
  value,
  onValueChange,
  placeholder = "Selecionar setor",
  disabled = false,
  includeNone = true,
}: SectorSelectProps) => {
  const [sectors, setSectors] = useState<Sector[]>([]);

  useEffect(() => {
    if (!clientId) {
      setSectors([]);
      return;
    }
    supabase
      .from("client_sectors" as any)
      .select("id, name, client_id")
      .eq("client_id", clientId)
      .order("name")
      .then(({ data }: any) => setSectors(data || []));
  }, [clientId]);

  if (!clientId || sectors.length === 0) return null;

  return (
    <Select value={value} onValueChange={onValueChange} disabled={disabled}>
      <SelectTrigger>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {includeNone && <SelectItem value="none">Nenhum</SelectItem>}
        {sectors.map((s) => (
          <SelectItem key={s.id} value={s.id}>
            {s.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
};

export default SectorSelect;
