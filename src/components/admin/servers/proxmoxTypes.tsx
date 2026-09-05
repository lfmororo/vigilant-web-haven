import { Badge } from "@/components/ui/badge";
import type { Tables } from "@/integrations/supabase/types";

/** Nó Proxmox com o nome do cliente resolvido pelo join da consulta. */
export type ProxmoxNode = Tables<"proxmox_nodes"> & {
  clients?: { full_name: string } | null;
};

export type ProxmoxGuest = Tables<"proxmox_guests">;

export type ProxmoxInterface = Tables<"proxmox_interfaces">;

/** Formata bits por segundo em unidades legíveis (Kbps/Mbps/Gbps). */
export const formatBps = (val: number | null | undefined): string => {
  if (val == null || Number.isNaN(Number(val))) return "—";
  const bps = Number(val);
  if (bps >= 1e9) return `${(bps / 1e9).toFixed(2)} Gbps`;
  if (bps >= 1e6) return `${(bps / 1e6).toFixed(2)} Mbps`;
  if (bps >= 1e3) return `${(bps / 1e3).toFixed(1)} Kbps`;
  return `${bps} bps`;
};

/** Formata bytes acumulados em unidades legíveis. */
export const formatBytes = (val: number | null | undefined): string => {
  if (val == null || Number.isNaN(Number(val))) return "—";
  const bytes = Number(val);
  const units = ["B", "KB", "MB", "GB", "TB", "PB"];
  let i = 0;
  let value = bytes;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i++;
  }
  return `${value.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
};

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
