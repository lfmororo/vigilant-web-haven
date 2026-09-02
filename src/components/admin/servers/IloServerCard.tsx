import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatTimeAgo } from "@/lib/formatTimeAgo";
import {
  ChevronDown, ChevronRight, Edit, Trash2, Thermometer, Fan, Zap,
  HardDrive, ScrollText, Cpu,
} from "lucide-react";
import type { IloEvent, IloSensor, IloServer } from "./iloTypes";
import { statusDotClass } from "./iloTypes";
import { healthBadge, iloStatusBadge } from "./iloBadges";


export interface IloServerCardProps {
  server: IloServer;
  sensors: IloSensor[];
  events: IloEvent[];
  expanded: boolean;
  onToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

const SENSOR_ICONS = {
  temperature: Thermometer,
  fan: Fan,
  power_supply: Zap,
  voltage: Zap,
  disk: HardDrive,
  logical_drive: HardDrive,
  controller: Cpu,
} as const;

const SENSOR_TITLES: Record<string, string> = {
  temperature: "Temperaturas",
  fan: "Ventiladores",
  power_supply: "Fontes de Alimentação",
  voltage: "Voltagens",
  disk: "Discos Físicos (SMART)",
  logical_drive: "Volumes Lógicos (RAID)",
  controller: "Controladoras",
};

const SensorGroup = ({ type, items }: { type: string; items: IloSensor[] }) => {
  if (items.length === 0) return null;
  const Icon = SENSOR_ICONS[type as keyof typeof SENSOR_ICONS] ?? Thermometer;

  return (
    <div>
      <h4 className="text-sm font-medium mb-2 flex items-center gap-1">
        <Icon className="w-4 h-4" /> {SENSOR_TITLES[type] ?? type} ({items.length})
      </h4>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
        {items.map((s) => {
          const critical = s.upper_critical != null && s.reading != null && s.reading >= s.upper_critical;
          const bad = s.health === "Critical" || critical;
          const warn = s.health === "Warning";
          return (
            <div key={s.id} className="bg-muted/50 rounded-lg p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate" title={s.name}>{s.name}</p>
                  {s.location && <p className="text-xs text-muted-foreground truncate">{s.location}</p>}
                </div>
                <span
                  className={`text-sm font-semibold shrink-0 ${
                    bad ? "text-destructive" : warn ? "text-amber-400" : "text-foreground"
                  }`}
                >
                  {s.reading != null ? `${s.reading}${s.unit ? ` ${s.unit}` : ""}` : s.status || "—"}
                </span>
              </div>
              <div className="mt-1 flex items-center gap-2">
                {healthBadge(s.health)}
                {s.upper_critical != null && (
                  <span className="text-[11px] text-muted-foreground">crítico ≥ {s.upper_critical}</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

const IloServerCard = ({ server, sensors, events, expanded, onToggle, onEdit, onDelete }: IloServerCardProps) => {
  const byType = (t: string) => sensors.filter((s) => s.sensor_type === t);
  const temps = byType("temperature");
  const hottest = temps.reduce<number | null>(
    (max, s) => (s.reading != null && (max == null || s.reading > max) ? s.reading : max),
    null,
  );

  return (
    <Card>
      <CardHeader className="py-3 px-4 cursor-pointer" onClick={onToggle}>
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
            <div className={`w-2.5 h-2.5 rounded-full ${statusDotClass(server.status)}`} />
            <div>
              <CardTitle className="text-base">{server.name}</CardTitle>
              <p className="text-xs text-muted-foreground">
                {server.clients?.full_name} · {server.host} · {server.server_model || "HP ProLiant"}
                {server.ilo_firmware ? ` · iLO ${server.ilo_firmware}` : ""}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3 text-sm">
            {hottest != null && (
              <span className="flex items-center gap-1"><Thermometer className="w-3 h-3" />{hottest} °C</span>
            )}
            {server.power_state && <Badge variant="secondary">{server.power_state}</Badge>}
            {healthBadge(server.health_summary)}
            {iloStatusBadge(server.status)}
            <div className="flex gap-1">
              <Button size="icon" variant="ghost" onClick={(e) => { e.stopPropagation(); onEdit(); }}>
                <Edit className="w-4 h-4" />
              </Button>
              <Button size="icon" variant="ghost" className="text-destructive" onClick={(e) => { e.stopPropagation(); onDelete(); }}>
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>
      </CardHeader>

      {expanded && (
        <CardContent className="pt-0 space-y-4">
          {server.last_error && (
            <div className="text-sm text-destructive bg-destructive/10 border border-destructive/30 rounded-lg px-3 py-2">
              {server.last_error}
            </div>
          )}

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="bg-muted/50 rounded-lg p-3">
              <p className="text-xs text-muted-foreground">Serial</p>
              <p className="text-sm font-bold truncate">{server.serial_number || "—"}</p>
            </div>
            <div className="bg-muted/50 rounded-lg p-3">
              <p className="text-xs text-muted-foreground">Processadores</p>
              <p className="text-sm font-bold truncate">{server.cpu_count ? `${server.cpu_count}× ${server.cpu_model || "CPU"}` : "—"}</p>
            </div>
            <div className="bg-muted/50 rounded-lg p-3">
              <p className="text-xs text-muted-foreground">Memória</p>
              <p className="text-sm font-bold">{server.ram_total_gb != null ? `${server.ram_total_gb} GB` : "—"}</p>
            </div>
            <div className="bg-muted/50 rounded-lg p-3">
              <p className="text-xs text-muted-foreground">BIOS / Últ. coleta</p>
              <p className="text-sm font-bold truncate">
                {server.bios_version || "—"} · {server.last_polled_at ? formatTimeAgo(server.last_polled_at) : "Nunca"}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {[
              ["Processador", server.health_processor],
              ["Memória", server.health_memory],
              ["Armazenamento", server.health_storage],
              ["Ventiladores", server.health_fans],
              ["Fontes", server.health_power],
              ["Temperatura", server.health_temperature],
              ["Rede", server.health_network],
            ].map(([label, value]) => (
              <div key={label as string} className="flex items-center gap-1.5 bg-muted/50 rounded-lg px-3 py-1.5 text-xs">
                <span className="text-muted-foreground">{label}:</span>
                {healthBadge(value as string | null)}
              </div>
            ))}
          </div>

          {(["temperature", "fan", "power_supply", "voltage", "logical_drive", "disk", "controller"] as const).map((t) => (
            <SensorGroup key={t} type={t} items={byType(t)} />
          ))}

          <div>
            <h4 className="text-sm font-medium mb-2 flex items-center gap-1">
              <ScrollText className="w-4 h-4" /> Eventos de Hardware (IML)
            </h4>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Gravidade</TableHead>
                    <TableHead>Data</TableHead>
                    <TableHead>Mensagem</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {events.slice(0, 25).map((e) => (
                    <TableRow key={e.id}>
                      <TableCell>
                        {e.severity === "critical" ? (
                          <Badge className="bg-red-500/20 text-red-400 border-red-500/30">Crítico</Badge>
                        ) : e.severity === "warning" ? (
                          <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30">Alerta</Badge>
                        ) : (
                          <Badge variant="secondary">Info</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-xs whitespace-nowrap">
                        {new Date(e.recorded_at).toLocaleString("pt-BR")}
                      </TableCell>
                      <TableCell className="text-sm">{e.message}</TableCell>
                    </TableRow>
                  ))}
                  {events.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={3} className="text-center py-4 text-muted-foreground">
                        Nenhum evento registrado
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        </CardContent>
      )}
    </Card>
  );
};

export default IloServerCard;
