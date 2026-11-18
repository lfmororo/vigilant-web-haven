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

/** Aba "bandwidth" do dispositivo selecionado no Monitor MikroTik. */
export default function MikrotikBandwidthTab({ interfaces, trafficHistory }: { interfaces?: MikrotikInterface[]; [key: string]: any }) {
  return (
    <>

                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base flex items-center gap-2">
                        <Zap className="w-4 h-4" />
                        Consumo de Banda em Tempo Real
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      {(() => {
                        const runningIfaces = interfaces.filter(i => i.running && !i.disabled && !/^(lo|null|dummy)$/i.test(i.interface_name) && i.interface_type !== 'loopback' && i.interface_type !== 'snmp-type-24');
                        if (runningIfaces.length === 0) return (
                          <p className="text-center text-muted-foreground py-4">Nenhuma interface ativa. Clique em Atualizar para coletar.</p>
                        );
                        return (
                          <div className="space-y-4">
                            {/* Summary cards */}
                            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                              {runningIfaces.map((iface) => (
                                <div key={iface.id} className="p-3 rounded-lg border bg-card space-y-2">
                                  <div className="flex items-center justify-between">
                                    <p className="text-sm font-semibold truncate">{iface.interface_name}</p>
                                    <Badge variant="default" className="text-[10px]">UP</Badge>
                                  </div>
                                  <div className="space-y-1">
                                    <div className="flex items-center justify-between text-xs">
                                      <span className="text-muted-foreground">↑ TX</span>
                                      <span className="font-mono font-medium text-primary">{formatBitsPerSec(iface.tx_rate)}</span>
                                    </div>
                                    <div className="flex items-center justify-between text-xs">
                                      <span className="text-muted-foreground">↓ RX</span>
                                      <span className="font-mono font-medium text-chart-2">{formatBitsPerSec(iface.rx_rate)}</span>
                                    </div>
                                  </div>
                                  {iface.speed && (
                                    <p className="text-[10px] text-muted-foreground">Link: {iface.speed}</p>
                                  )}
                                </div>
                              ))}
                            </div>

                            {/* Table view */}
                            <div className="overflow-x-auto">
                              <Table>
                                <TableHeader>
                                  <TableRow>
                                    <TableHead>Interface</TableHead>
                                    <TableHead>Tipo</TableHead>
                                    <TableHead>↑ TX Rate</TableHead>
                                    <TableHead>↓ RX Rate</TableHead>
                                    <TableHead>TX Total</TableHead>
                                    <TableHead>RX Total</TableHead>
                                    <TableHead>Velocidade</TableHead>
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {runningIfaces.map((iface) => (
                                    <TableRow key={iface.id}>
                                      <TableCell className="font-medium text-sm">{iface.interface_name}</TableCell>
                                      <TableCell className="text-xs">{iface.interface_type || "-"}</TableCell>
                                      <TableCell className="text-xs font-mono text-primary">{formatBitsPerSec(iface.tx_rate)}</TableCell>
                                      <TableCell className="text-xs font-mono text-chart-2">{formatBitsPerSec(iface.rx_rate)}</TableCell>
                                      <TableCell className="text-xs">{formatBytes(iface.tx_bytes)}</TableCell>
                                      <TableCell className="text-xs">{formatBytes(iface.rx_bytes)}</TableCell>
                                      <TableCell className="text-xs">{iface.speed || "-"}</TableCell>
                                    </TableRow>
                                  ))}
                                </TableBody>
                              </Table>
                            </div>
                          </div>
                        );
                      })()}
                    </CardContent>
                  </Card>

                  {/* Gráficos de banda por interface */}
                  {trafficHistory.length > 1 && (() => {
                    const ifaceNames = [...new Set<string>(trafficHistory.map((r: any) => r.interface_name))];
                    return (
                      <div className="space-y-4 mt-4">
                        {ifaceNames.map((ifaceName) => {
                          const filtered = trafficHistory.filter(r => r.interface_name === ifaceName);
                          if (filtered.length < 2) return null;
                          return (
                            <Card key={ifaceName}>
                              <CardHeader className="pb-3">
                                <CardTitle className="text-sm flex items-center gap-2">
                                  <TrendingUp className="w-4 h-4" />
                                  Histórico de Banda - {ifaceName}
                                </CardTitle>
                              </CardHeader>
                              <CardContent>
                                <ResponsiveContainer width="100%" height={220}>
                                  <LineChart data={filtered}>
                                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                                    <XAxis dataKey="time" tick={{ fontSize: 10 }} />
                                    <YAxis tick={{ fontSize: 10 }} unit=" MB" />
                                    <RechartsTooltip formatter={(value: number) => `${value} MB`} />
                                    <Legend />
                                    <Line type="monotone" dataKey="tx_mb" name="TX (MB)" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
                                    <Line type="monotone" dataKey="rx_mb" name="RX (MB)" stroke="hsl(var(--chart-2))" strokeWidth={2} dot={false} />
                                  </LineChart>
                                </ResponsiveContainer>
                              </CardContent>
                            </Card>
                          );
                        })}
                      </div>
                    );
                  })()}
    </>
  );
}
