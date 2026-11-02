import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Server, Terminal, Database, Monitor, Boxes, ServerCog, type LucideIcon } from "lucide-react";

export type SourceType = "windows" | "linux" | "sqlserver" | "vmware" | "proxmox" | "ilo";
export type Severity = "info" | "warning" | "critical";

export const SOURCE_META: Record<SourceType, { label: string; icon: LucideIcon; tab: string | null; table: string }> = {
  windows: { label: "Windows", icon: Server, tab: "windows", table: "windows_servers" },
  linux: { label: "Linux", icon: Terminal, tab: "linux", table: "linux_servers" },
  sqlserver: { label: "SQL Server", icon: Database, tab: "sqlserver", table: "sql_instances" },
  vmware: { label: "VMware", icon: Monitor, tab: "vmware", table: "vmware_hosts" },
  proxmox: { label: "Proxmox", icon: Boxes, tab: "proxmox", table: "proxmox_nodes" },
  ilo: { label: "iLO / iDRAC", icon: ServerCog, tab: "ilo", table: "ilo_servers" },
};

export const SOURCE_ORDER: SourceType[] = ["windows", "linux", "sqlserver", "vmware", "proxmox", "ilo"];

export const STALE_MINUTES = 15;

/** Sem coleta há mais de 15 min (ou nunca coletou). */
export function isStale(lastPolledAt: string | null | undefined, minutes = STALE_MINUTES): boolean {
  if (!lastPolledAt) return true;
  return Date.now() - new Date(lastPolledAt).getTime() > minutes * 60_000;
}

export function fmtAgo(iso: string | null | undefined): string {
  if (!iso) return "nunca";
  const s = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return "agora";
  const m = Math.floor(s / 60);
  if (m < 60) return `há ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `há ${h}h${m % 60 ? ` ${m % 60}min` : ""}`;
  const d = Math.floor(h / 24);
  return `há ${d} dia${d > 1 ? "s" : ""}`;
}

export function fmtUptime(seconds: number | null | undefined): string {
  if (seconds == null) return "—";
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

export function fmtDuration(ms: number): string {
  const m = Math.round(ms / 60000);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ${m % 60}min`;
  return `${Math.floor(h / 24)}d ${h % 24}h`;
}

const SEV_STYLE: Record<Severity, { label: string; cls: string }> = {
  critical: { label: "Crítico", cls: "bg-red-500/15 text-red-400 border-red-500/30" },
  warning: { label: "Atenção", cls: "bg-amber-500/15 text-amber-400 border-amber-500/30" },
  info: { label: "Info", cls: "bg-blue-500/15 text-blue-400 border-blue-500/30" },
};

export function SeverityBadge({ severity, className }: { severity: Severity | string; className?: string }) {
  const s = SEV_STYLE[(severity as Severity)] ?? SEV_STYLE.info;
  return <Badge variant="outline" className={cn(s.cls, className)}>{s.label}</Badge>;
}

/** Verde online, âmbar warning, vermelho (pulsando) offline, cinza sem dados. */
export function StatusDot({ status, stale, className }: { status?: string | null; stale?: boolean; className?: string }) {
  let color = "bg-muted-foreground/50";
  let ping = false;
  if (!stale) {
    if (status === "online") color = "bg-emerald-500";
    else if (status === "warning" || status === "degraded") color = "bg-amber-500";
    else if (status === "offline") { color = "bg-red-500"; ping = true; }
  }
  return (
    <span className={cn("relative inline-flex h-2.5 w-2.5", className)}>
      {ping && <span className={cn("absolute inline-flex h-full w-full animate-ping rounded-full opacity-75", color)} />}
      <span className={cn("relative inline-flex h-2.5 w-2.5 rounded-full", color)} />
    </span>
  );
}

export function usageColor(pct: number, warn = 85, crit = 92): string {
  if (pct >= crit) return "bg-red-500";
  if (pct >= warn) return "bg-amber-500";
  if (pct >= 70) return "bg-yellow-500";
  return "bg-emerald-500";
}

export function UsageBar({ value, label, warn, crit, className }: {
  value: number | null | undefined; label?: string; warn?: number; crit?: number; className?: string;
}) {
  if (value == null || isNaN(Number(value))) return <span className="text-xs text-muted-foreground">—</span>;
  const v = Math.max(0, Math.min(100, Number(value)));
  return (
    <div className={cn("flex items-center gap-1.5", className)}>
      {label && <span className="w-6 shrink-0 font-mono text-[11px] text-muted-foreground">{label}</span>}
      <div className="h-2 w-16 overflow-hidden rounded-full bg-muted">
        <div className={cn("h-full rounded-full", usageColor(v, warn, crit))} style={{ width: `${v}%` }} />
      </div>
      <span className="text-xs tabular-nums">{Number(value).toFixed(1)}%</span>
    </div>
  );
}

/** Cor do texto conforme a idade do último backup (em horas) e o limite esperado. */
export function backupAgeClass(iso: string | null | undefined, limitHours = 26): string {
  if (!iso) return "text-red-400";
  const h = (Date.now() - new Date(iso).getTime()) / 3_600_000;
  if (h > limitHours * 3) return "text-red-400";
  if (h > limitHours) return "text-amber-400";
  return "text-emerald-400";
}
