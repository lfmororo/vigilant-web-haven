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

/** Aba "traffic" do dispositivo selecionado no Monitor MikroTik. */
export default function MikrotikTrafficTab({ interfaces, selectedTrafficIface, setSelectedTrafficIface, trafficHistory }: { interfaces?: MikrotikInterface[]; [key: string]: any }) {
  return (
    <>

                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base">Tráfego e Erros</CardTitle>
                    </CardHeader>
                    <CardContent>
                      {interfaces.length === 0 ? (
                        <p className="text-center text-muted-foreground py-4">Nenhuma interface coletada.</p>
                      ) : (
                        <div className="overflow-x-auto">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>Interface</TableHead>
                                <TableHead>TX Bytes</TableHead>
                                <TableHead>RX Bytes</TableHead>
                                <TableHead>TX Pkts</TableHead>
                                <TableHead>RX Pkts</TableHead>
                                <TableHead>TX Erros</TableHead>
                                <TableHead>RX Erros</TableHead>
                                <TableHead>TX Drops</TableHead>
                                <TableHead>RX Drops</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {interfaces.filter(i => !i.disabled && !/^(lo|null|dummy)$/i.test(i.interface_name) && i.interface_type !== 'loopback' && i.interface_type !== 'snmp-type-24' && i.interface_type !== 'snmp-type-1').map((iface) => (
                                <TableRow key={iface.id}>
                                  <TableCell className="font-medium text-sm">{iface.interface_name}</TableCell>
                                  <TableCell className="text-xs">{formatBytes(iface.tx_bytes)}</TableCell>
                                  <TableCell className="text-xs">{formatBytes(iface.rx_bytes)}</TableCell>
                                  <TableCell className="text-xs">{iface.tx_packets.toLocaleString()}</TableCell>
                                  <TableCell className="text-xs">{iface.rx_packets.toLocaleString()}</TableCell>
                                  <TableCell className={`text-xs ${iface.tx_errors > 0 ? "text-destructive font-bold" : ""}`}>{iface.tx_errors}</TableCell>
                                  <TableCell className={`text-xs ${iface.rx_errors > 0 ? "text-destructive font-bold" : ""}`}>{iface.rx_errors}</TableCell>
                                  <TableCell className={`text-xs ${iface.tx_drops > 0 ? "text-destructive font-bold" : ""}`}>{iface.tx_drops}</TableCell>
                                  <TableCell className={`text-xs ${iface.rx_drops > 0 ? "text-destructive font-bold" : ""}`}>{iface.rx_drops}</TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  {/* Gráfico de histórico de tráfego */}
                  {trafficHistory.length > 1 && (() => {
                    const ifaceNames = [...new Set<string>(trafficHistory.map((r: any) => r.interface_name))];
                    const activeIface = selectedTrafficIface || ifaceNames[0] || "";
                    const filtered = trafficHistory.filter(r => r.interface_name === activeIface);
                    return (
                      <Card className="mt-4">
                        <CardHeader className="pb-3">
                          <div className="flex items-center justify-between">
                            <CardTitle className="text-base flex items-center gap-2">
                              <TrendingUp className="w-4 h-4" />
                              Histórico de Tráfego
                            </CardTitle>
                            <Select value={activeIface} onValueChange={setSelectedTrafficIface}>
                              <SelectTrigger className="w-48">
                                <SelectValue placeholder="Interface" />
                              </SelectTrigger>
                              <SelectContent>
                                {ifaceNames.map(name => (
                                  <SelectItem key={name} value={name}>{name}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        </CardHeader>
                        <CardContent>
                          <ResponsiveContainer width="100%" height={300}>
                            <LineChart data={filtered}>
                              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                              <XAxis dataKey="time" tick={{ fontSize: 11 }} />
                              <YAxis tick={{ fontSize: 11 }} unit=" MB" />
                              <RechartsTooltip formatter={(value: number) => `${value} MB`} />
                              <Legend />
                              <Line type="monotone" dataKey="tx_mb" name="TX (MB)" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
                              <Line type="monotone" dataKey="rx_mb" name="RX (MB)" stroke="hsl(var(--chart-2))" strokeWidth={2} dot={false} />
                            </LineChart>
                          </ResponsiveContainer>
                        </CardContent>
                      </Card>
                    );
                  })()}
    </>
  );
}
