import { Badge } from "@/components/ui/badge";

export const statusColor = (status: string) => {
  switch (status) {
    case "online": return "bg-emerald-500";
    case "offline": return "bg-red-500";
    case "warning": return "bg-amber-500";
    default: return "bg-muted-foreground";
  }
};

export const statusBadge = (status: string) => {
  switch (status) {
    case "online": return <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30">Online</Badge>;
    case "offline": return <Badge className="bg-red-500/20 text-red-400 border-red-500/30">Offline</Badge>;
    case "warning": return <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30">Alerta</Badge>;
    default: return <Badge variant="secondary">Desconhecido</Badge>;
  }
};

export const formatUptime = (seconds: number | null) => {
  if (!seconds) return "—";
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${d}d ${h}h ${m}m`;
};

export const formatGB = (val: number | null | undefined) => val != null ? `${val.toFixed(1)} GB` : "—";
export const formatPct = (val: number | null | undefined) => val != null ? `${val.toFixed(1)}%` : "—";
