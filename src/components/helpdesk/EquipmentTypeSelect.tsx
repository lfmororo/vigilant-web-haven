import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface EquipmentType {
  id: string;
  name: string;
  icon: string;
}

interface EquipmentTypeSelectProps {
  value: string;
  onValueChange: (value: string) => void;
}

const EquipmentTypeSelect = ({ value, onValueChange }: EquipmentTypeSelectProps) => {
  const [types, setTypes] = useState<EquipmentType[]>([]);

  useEffect(() => {
    supabase.from("equipment_types").select("*").order("name").then(({ data }) => {
      if (data) setTypes(data);
    });
  }, []);

  return (
    <Select value={value} onValueChange={onValueChange}>
      <SelectTrigger>
        <SelectValue placeholder="Selecione o tipo de equipamento" />
      </SelectTrigger>
      <SelectContent>
        {types.map((type) => (
          <SelectItem key={type.id} value={type.id}>
            {type.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
};

export default EquipmentTypeSelect;
