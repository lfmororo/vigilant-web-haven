import { Suspense, useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { Loader2, Plus, RefreshCw, Trash2, Edit, Wifi, WifiOff, Activity, ArrowUpDown, Network, Target, AlertTriangle, Download, Server, ScrollText, Globe, TrendingUp, Thermometer, Cpu, CalendarDays, Clock, MoreHorizontal, Zap, MemoryStick, BookOpen, Copy, Check, Info } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, Legend, PieChart, Pie, Cell } from "recharts";

import { formatBytes, formatBitsPerSec, type MikrotikInterface } from "./types";

/** Aba "interfaces" do dispositivo selecionado no Monitor MikroTik. */
export default function MikrotikInterfacesTab({ interfaceEvents, interfaces, selectedDevice }: { interfaces?: MikrotikInterface[]; [key: string]: any }) {
  return (
    <>

                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base">Interfaces</CardTitle>
                    </CardHeader>
                    <CardContent>
                      {interfaces.length === 0 ? (
                        <p className="text-center text-muted-foreground py-4">Nenhuma interface. Clique em Atualizar para coletar.</p>
                      ) : (
                         <div className="overflow-x-auto">
                          <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Interface</TableHead>
                              <TableHead>Tipo</TableHead>
                              <TableHead>Status</TableHead>
                              <TableHead>IP</TableHead>
                              <TableHead>MAC</TableHead>
                              <TableHead>Velocidade</TableHead>
                              {selectedDevice.device_type !== 'snmp' && selectedDevice.device_type !== 'grandstream' && <TableHead>PPPoE</TableHead>}
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {interfaces
                              .filter(iface => {
                                // Filtrar interfaces fantasma/irrelevantes no display
                                const name = (iface.interface_name || '').toLowerCase();
                                if (/^(lo|null|dummy|sit\d|virbr|docker|veth|br-)/.test(name)) return false;
                                // Filtrar tipos irrelevantes
                                const type = (iface.interface_type || '').toLowerCase();
                                if (type === 'loopback' || type === 'snmp-type-24' || type === 'snmp-type-1') return false;
                                return true;
                              })
                              .map((iface) => {
                                // Formatar tipo para exibição
                                const formatType = (t: string | null) => {
                                  if (!t) return '-';
                                  const typeMap: Record<string, string> = {
                                    'ether': 'Ethernet', 'vlan': 'VLAN', 'lag': 'LAG/Bond', 'wifi': 'Wi-Fi',
                                    'tunnel': 'Túnel', 'loopback': 'Loopback', 'bridge': 'Bridge', 'pppoe-out': 'PPPoE',
                                  };
                                  if (typeMap[t]) return typeMap[t];
                                  if (t.startsWith('snmp-type-')) {
                                    const typeNum = t.replace('snmp-type-', '');
                                    const snmpTypes: Record<string, string> = {
                                      '6': 'Ethernet', '53': 'VLAN', '131': 'Túnel', '161': 'LAG/Bond',
                                      '71': 'Wi-Fi', '22': 'Prop P2P', '23': 'PPP', '117': 'GigEth',
                                    };
                                    return snmpTypes[typeNum] || `Tipo ${typeNum}`;
                                  }
                                  return t;
                                };
                                // Formatar velocidade
                                const formatSpeed = (s: string | null) => {
                                  if (!s) return '-';
                                  const bps = Number(s);
                                  if (isNaN(bps) || bps === 0) return s;
                                  if (bps >= 1000000000) return `${(bps / 1000000000).toFixed(0)} Gbps`;
                                  if (bps >= 1000000) return `${(bps / 1000000).toFixed(0)} Mbps`;
                                  if (bps >= 1000) return `${(bps / 1000).toFixed(0)} Kbps`;
                                  return `${bps} bps`;
                                };

                                return (
                                  <TableRow key={iface.id} className={iface.disabled ? "opacity-50" : ""}>
                                    <TableCell className="font-medium text-sm">{iface.interface_name}</TableCell>
                                    <TableCell className="text-xs">{formatType(iface.interface_type)}</TableCell>
                                    <TableCell>
                                      <Badge variant={iface.running ? "default" : "destructive"} className="text-xs">
                                        {iface.disabled ? "DISABLED" : iface.running ? "UP" : "DOWN"}
                                      </Badge>
                                    </TableCell>
                                    <TableCell className="text-xs">{iface.ip_address || "-"}</TableCell>
                                    <TableCell className="text-xs font-mono">{iface.mac_address || "-"}</TableCell>
                                    <TableCell className="text-xs">{formatSpeed(iface.speed)}</TableCell>
                                    {selectedDevice.device_type !== 'snmp' && selectedDevice.device_type !== 'grandstream' && (
                                      <TableCell className="text-xs">
                                        {iface.pppoe_user ? (
                                          <span>{iface.pppoe_user}{iface.uptime ? ` (${iface.uptime})` : ""}</span>
                                        ) : "-"}
                                      </TableCell>
                                    )}
                                  </TableRow>
                                );
                              })}
                          </TableBody>
                        </Table>
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  {/* Timeline de eventos de interface */}
                  {interfaceEvents.length > 0 && (
                    <Card className="mt-4">
                      <CardHeader className="pb-3">
                        <CardTitle className="text-base flex items-center gap-2">
                          <Clock className="w-4 h-4" />
                          Histórico de Eventos (últimos 7 dias)
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        {(() => {
                          const groupedByIface: Record<string, any[]> = {};
                          for (const evt of interfaceEvents) {
                            if (!groupedByIface[evt.interface_name]) groupedByIface[evt.interface_name] = [];
                            groupedByIface[evt.interface_name].push(evt);
                          }
                          return (
                            <div className="space-y-4">
                              {Object.entries(groupedByIface).map(([ifaceName, events]) => (
                                <div key={ifaceName}>
                                  <h4 className="text-sm font-semibold mb-2 flex items-center gap-2">
                                    <Activity className="w-3.5 h-3.5" />
                                    {ifaceName}
                                    <Badge variant="outline" className="text-xs">{events.length} eventos</Badge>
                                  </h4>
                                  <div className="relative border-l-2 border-border ml-2 pl-4 space-y-2">
                                    {events.slice(0, 20).map((evt: any) => {
                                      const isDown = evt.event_type === "down";
                                      const time = new Date(evt.recorded_at);
                                      const timeStr = time.toLocaleString("pt-BR", {
                                        day: "2-digit", month: "2-digit",
                                        hour: "2-digit", minute: "2-digit", second: "2-digit",
                                        timeZone: "America/Sao_Paulo",
                                      });
                                      return (
                                        <div key={evt.id} className="relative flex items-start gap-3">
                                          <div className={`absolute -left-[1.35rem] top-1 w-3 h-3 rounded-full border-2 border-background ${isDown ? "bg-destructive" : "bg-green-500"}`} />
                                          <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2">
                                              <Badge variant={isDown ? "destructive" : "default"} className="text-xs">
                                                {isDown ? (
                                                  <><WifiOff className="w-3 h-3 mr-1" /> DOWN</>
                                                ) : (
                                                  <><Wifi className="w-3 h-3 mr-1" /> UP</>
                                                )}
                                              </Badge>
                                              <span className="text-xs text-muted-foreground">{timeStr}</span>
                                            </div>
                                          </div>
                                        </div>
                                      );
                                    })}
                                    {events.length > 20 && (
                                      <p className="text-xs text-muted-foreground">... e mais {events.length - 20} eventos</p>
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>
                          );
                        })()}
                      </CardContent>
                    </Card>
                  )}
    </>
  );
}
