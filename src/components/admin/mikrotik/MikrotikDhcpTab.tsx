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

/** Aba "dhcp" do dispositivo selecionado no Monitor MikroTik. */
export default function MikrotikDhcpTab({ dhcpHistory, selectedDevice }: { interfaces?: MikrotikInterface[]; [key: string]: any }) {
  return (
    <>

                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base">DHCP - {selectedDevice.name}</CardTitle>
                    </CardHeader>
                    <CardContent>
                      {selectedDevice.last_dhcp_summary ? (() => {
                        const ds = selectedDevice.last_dhcp_summary;
                        const servers = ds.by_server ? Object.entries(ds.by_server) : [];
                        const overallUsagePct = ds.usage_pct !== null && ds.usage_pct !== undefined
                          ? ds.usage_pct
                          : (ds.total_leases > 0 ? Math.round((ds.active_leases / ds.total_leases) * 100) : 0);
                        const PIE_COLORS = ["hsl(var(--primary))", "hsl(var(--chart-2))", "hsl(var(--chart-4))", "hsl(var(--chart-3))", "hsl(var(--muted))"];

                        return (
                          <div className="space-y-4">
                            {/* Resumo Geral */}
                            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                              <div className="p-3 rounded-lg border bg-card">
                                <p className="text-xs text-muted-foreground">Total Leases</p>
                                <p className="text-2xl font-bold">{ds.total_leases}</p>
                              </div>
                              <div className="p-3 rounded-lg border bg-card">
                                <p className="text-xs text-muted-foreground">Ativos</p>
                                <p className="text-2xl font-bold text-primary">{ds.active_leases}</p>
                              </div>
                              <div className="p-3 rounded-lg border bg-card">
                                <p className="text-xs text-muted-foreground">Dinâmicos</p>
                                <p className="text-2xl font-bold">{ds.dynamic_leases}</p>
                              </div>
                              <div className="p-3 rounded-lg border bg-card">
                                <p className="text-xs text-muted-foreground">Estáticos</p>
                                <p className="text-2xl font-bold">{ds.static_leases}</p>
                              </div>
                              {ds.total_capacity > 0 && (
                                <div className="p-3 rounded-lg border bg-card">
                                  <p className="text-xs text-muted-foreground">Capacidade Total</p>
                                  <p className="text-2xl font-bold">{ds.total_capacity} <span className="text-sm font-normal text-muted-foreground">IPs</span></p>
                                </div>
                              )}
                            </div>

                            {/* Barra de utilização geral */}
                            <div className="p-4 rounded-lg border bg-card space-y-2">
                              <div className="flex items-center justify-between">
                                <h4 className="text-sm font-semibold">Utilização Geral</h4>
                                <span className={`text-lg font-bold ${overallUsagePct > 80 ? "text-destructive" : overallUsagePct > 60 ? "text-chart-4" : "text-primary"}`}>
                                  {overallUsagePct}%
                                </span>
                              </div>
                              <Progress value={overallUsagePct} className="h-3" />
                              <p className="text-xs text-muted-foreground">
                                {ds.active_leases} ativos {ds.total_capacity > 0 ? `de ${ds.total_capacity} IPs disponíveis` : `de ${ds.total_leases} leases`}
                              </p>
                            </div>

                            {/* Sub-abas por Pool/Servidor */}
                            {servers.length > 0 && (
                              <Tabs defaultValue={servers[0]?.[0] || "all"} className="w-full">
                                <TabsList className="flex flex-wrap h-auto gap-1">
                                  {servers.map(([serverName, info]: [string, any]) => (
                                    <TabsTrigger key={serverName} value={serverName} className="text-xs gap-1">
                                      <Server className="w-3 h-3" />
                                      {serverName}
                                      {info.usage_pct !== null && info.usage_pct !== undefined && (
                                        <Badge variant={info.usage_pct > 80 ? "destructive" : "secondary"} className="text-[10px] px-1 py-0 ml-1">
                                          {info.usage_pct}%
                                        </Badge>
                                      )}
                                    </TabsTrigger>
                                  ))}
                                </TabsList>

                                {servers.map(([serverName, info]: [string, any]) => {
                                  const srvUsagePct = info.usage_pct !== null && info.usage_pct !== undefined ? info.usage_pct : (info.total > 0 ? Math.round((info.active / info.total) * 100) : 0);
                                  const srvPieData = [
                                    { name: "Ativos", value: info.active || 0 },
                                    { name: "Inativos", value: Math.max(0, (info.total || 0) - (info.active || 0)) },
                                    ...(info.capacity > 0 ? [{ name: "Livres", value: Math.max(0, info.capacity - (info.active || 0)) }] : []),
                                  ].filter(d => d.value > 0);

                                  return (
                                    <TabsContent key={serverName} value={serverName} className="mt-3">
                                      <div className="space-y-4">
                                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                                          <div className="p-3 rounded-lg border bg-card">
                                            <p className="text-xs text-muted-foreground">Pool</p>
                                            <p className="text-sm font-bold">{info.pool || "—"}</p>
                                          </div>
                                          <div className="p-3 rounded-lg border bg-card">
                                            <p className="text-xs text-muted-foreground">Capacidade</p>
                                            <p className="text-2xl font-bold">{info.capacity > 0 ? info.capacity : "—"}</p>
                                          </div>
                                          <div className="p-3 rounded-lg border bg-card">
                                            <p className="text-xs text-muted-foreground">Leases Ativos</p>
                                            <p className="text-2xl font-bold text-primary">{info.active}</p>
                                          </div>
                                          <div className="p-3 rounded-lg border bg-card">
                                            <p className="text-xs text-muted-foreground">Leases Totais</p>
                                            <p className="text-2xl font-bold">{info.total}</p>
                                          </div>
                                        </div>

                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                          <div className="p-4 rounded-lg border bg-card space-y-3">
                                            <h4 className="text-sm font-semibold">Utilização do Pool</h4>
                                            <div className="flex items-center gap-3">
                                              <Progress value={srvUsagePct} className="h-3 flex-1" />
                                              <span className={`text-lg font-bold ${srvUsagePct > 80 ? "text-destructive" : srvUsagePct > 60 ? "text-chart-4" : "text-primary"}`}>
                                                {srvUsagePct}%
                                              </span>
                                            </div>
                                            <p className="text-xs text-muted-foreground">
                                              {info.active} ativos {info.capacity > 0 ? `de ${info.capacity} IPs` : `de ${info.total} leases`}
                                            </p>
                                            {info.capacity > 0 && (info.capacity - info.active) < 10 && (
                                              <div className="flex items-center gap-1 text-destructive text-xs font-medium mt-1">
                                                <AlertTriangle className="w-3 h-3" />
                                                Apenas {Math.max(0, info.capacity - info.active)} IPs livres!
                                              </div>
                                            )}
                                          </div>
                                          {srvPieData.length > 0 && (
                                            <div className="p-4 rounded-lg border bg-card">
                                              <h4 className="text-sm font-semibold mb-2">Distribuição</h4>
                                              <ResponsiveContainer width="100%" height={150}>
                                                <PieChart>
                                                  <Pie data={srvPieData} cx="50%" cy="50%" innerRadius={35} outerRadius={60} dataKey="value" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                                                    {srvPieData.map((_, idx) => (
                                                      <Cell key={idx} fill={PIE_COLORS[idx % PIE_COLORS.length]} />
                                                    ))}
                                                  </Pie>
                                                  <RechartsTooltip />
                                                </PieChart>
                                              </ResponsiveContainer>
                                            </div>
                                          )}
                                        </div>

                                        {/* Gráfico de histórico por pool */}
                                        {(() => {
                                          const poolHistory = dhcpHistory.map((h: any) => {
                                            const srv = h.by_server?.[serverName];
                                            return srv ? { time: h.time, total: srv.total || 0, active: srv.active || 0, capacity: srv.capacity || 0 } : null;
                                          }).filter(Boolean);
                                          if (poolHistory.length < 2) return null;
                                          return (
                                            <Card>
                                              <CardHeader className="pb-3">
                                                <CardTitle className="text-sm flex items-center gap-2">
                                                  <TrendingUp className="w-4 h-4" />
                                                  Histórico - {serverName}
                                                </CardTitle>
                                              </CardHeader>
                                              <CardContent>
                                                <ResponsiveContainer width="100%" height={220}>
                                                  <LineChart data={poolHistory}>
                                                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                                                    <XAxis dataKey="time" tick={{ fontSize: 10 }} />
                                                    <YAxis tick={{ fontSize: 10 }} />
                                                    <RechartsTooltip />
                                                    <Legend />
                                                    <Line type="monotone" dataKey="active" name="Ativos" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
                                                    <Line type="monotone" dataKey="total" name="Total Leases" stroke="hsl(var(--chart-2))" strokeWidth={2} dot={false} />
                                                    <Line type="monotone" dataKey="capacity" name="Capacidade" stroke="hsl(var(--muted-foreground))" strokeWidth={1} strokeDasharray="5 5" dot={false} />
                                                  </LineChart>
                                                </ResponsiveContainer>
                                              </CardContent>
                                            </Card>
                                          );
                                        })()}
                                      </div>
                                    </TabsContent>
                                  );
                                })}
                              </Tabs>
                            )}
                          </div>
                        );
                      })() : (
                        <p className="text-center text-muted-foreground py-4">Dados DHCP não disponíveis. Execute o collector na VPS para coletar.</p>
                      )}

                      {/* Gráfico de histórico DHCP */}
                      {dhcpHistory.length > 1 && (
                        <Card className="mt-4">
                          <CardHeader className="pb-3">
                            <CardTitle className="text-base flex items-center gap-2">
                              <TrendingUp className="w-4 h-4" />
                              Histórico DHCP
                            </CardTitle>
                          </CardHeader>
                          <CardContent>
                            <ResponsiveContainer width="100%" height={300}>
                              <LineChart data={dhcpHistory}>
                                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                                <XAxis dataKey="time" tick={{ fontSize: 11 }} />
                                <YAxis tick={{ fontSize: 11 }} />
                                <RechartsTooltip />
                                <Legend />
                                <Line type="monotone" dataKey="total_leases" name="Total" stroke="hsl(var(--muted-foreground))" strokeWidth={2} dot={false} />
                                <Line type="monotone" dataKey="active_leases" name="Ativos" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
                                <Line type="monotone" dataKey="dynamic_leases" name="Dinâmicos" stroke="hsl(var(--chart-2))" strokeWidth={2} dot={false} />
                                <Line type="monotone" dataKey="static_leases" name="Estáticos" stroke="hsl(var(--chart-4))" strokeWidth={2} dot={false} />
                              </LineChart>
                            </ResponsiveContainer>
                          </CardContent>
                        </Card>
                      )}
                    </CardContent>
                  </Card>
    </>
  );
}
