import { Badge } from "@/components/ui/badge";
import type { Tables } from "@/integrations/supabase/types";

/** Nó Proxmox com o nome do cliente resolvido pelo join da consulta. */
export type ProxmoxNode = Tables<"proxmox_nodes"> & {
  clients?: { full_name: string } | null;
};

export type ProxmoxGuest = Tables<"proxmox_guests">;

export const proxmoxStatusDot = (status: string): string => {
  switch (status) {
    case "online": return "bg-emerald-500";
    case "warning": return "bg-amber-500";
    case "offline": return "bg-red-500";
    default: return "bg-muted-foreground";
  }
};

export const proxmoxStatusBadge = (status: string) => {
  switch (status) {
    case "online": return <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30">Online</Badge>;
    case "warning": return <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30">Alerta</Badge>;
    case "offline": return <Badge className="bg-red-500/20 text-red-400 border-red-500/30">Offline</Badge>;
    default: return <Badge variant="secondary">Desconhecido</Badge>;
  }
};

export const usageBarClass = (value: number | null | undefined): string => {
  if (value == null || Number.isNaN(value)) return "bg-muted-foreground";
  if (value > 90) return "bg-red-500";
  if (value > 70) return "bg-amber-500";
  return "bg-emerald-500";
};

export const formatGB = (val: number | null | undefined): string =>
  val != null && !Number.isNaN(val) ? `${Number(val).toFixed(1)} GB` : "—";

export const formatPct = (val: number | null | undefined): string =>
  val != null && !Number.isNaN(val) ? `${Number(val).toFixed(1)}%` : "—";
