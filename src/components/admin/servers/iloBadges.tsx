import { Badge } from "@/components/ui/badge";
import { healthLabel, iloStatusLabel } from "./iloTypes";

/** Badge da saúde do subsistema (OK / Atenção / Crítico). */
export const healthBadge = (health: string | null | undefined) => {
  const { label, className } = healthLabel(health);
  return <Badge className={className}>{label}</Badge>;
};

/** Badge da disponibilidade do servidor iLO. */
export const iloStatusBadge = (status: string) => {
  const { label, className } = iloStatusLabel(status);
  return <Badge className={className}>{label}</Badge>;
};
