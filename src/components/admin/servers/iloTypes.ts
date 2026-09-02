import type { Tables } from "@/integrations/supabase/types";

/** Servidor iLO com o nome do cliente resolvido pelo join da consulta. */
export type IloServer = Tables<"ilo_servers"> & {
  clients?: { full_name: string } | null;
};

export type IloSensor = Tables<"ilo_sensors">;
export type IloEvent = Tables<"ilo_events">;

/** Cor do indicador de status do servidor. */
export const statusDotClass = (status: string): string => {
  switch (status) {
    case "online": return "bg-emerald-500";
    case "warning": return "bg-amber-500";
    case "offline": return "bg-red-500";
    default: return "bg-muted-foreground";
  }
};

/** Badge de disponibilidade (coleta). Importado como função para evitar JSX aqui. */
export const iloStatusLabel = (status: string): { label: string; className: string } => {
  switch (status) {
    case "online": return { label: "Online", className: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30" };
    case "warning": return { label: "Alerta", className: "bg-amber-500/20 text-amber-400 border-amber-500/30" };
    case "offline": return { label: "Offline", className: "bg-red-500/20 text-red-400 border-red-500/30" };
    default: return { label: "Desconhecido", className: "bg-muted text-muted-foreground" };
  }
};

/** Traduz a saúde Redfish (OK / Warning / Critical) para rótulo em pt-BR. */
export const healthLabel = (health: string | null | undefined): { label: string; className: string } => {
  switch (health) {
    case "OK": return { label: "OK", className: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30" };
    case "Warning": return { label: "Atenção", className: "bg-amber-500/20 text-amber-400 border-amber-500/30" };
    case "Critical": return { label: "Crítico", className: "bg-red-500/20 text-red-400 border-red-500/30" };
    default: return { label: health || "—", className: "bg-muted text-muted-foreground" };
  }
};

export const formatUptime = (seconds: number | null): string => {
  if (!seconds) return "—";
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  return `${d}d ${h}h`;
};
