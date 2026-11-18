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

/** Aba "system" do dispositivo selecionado no Monitor MikroTik. */
export default function MikrotikSystemTab({ selectedDevice, systemHistory }: { interfaces?: MikrotikInterface[]; [key: string]: any }) {
  return (
    <>

                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base">Informações do Sistema - {selectedDevice.name}</CardTitle>
                    </CardHeader>
                    <CardContent>
                      {selectedDevice.last_system_info ? (() => {
                        const info = selectedDevice.last_system_info;
                        const health = info.health || {};
                        const cpuTemp = health['cpu-temperature'] || health.temperature || health['board-temperature1'] || null;
                        const voltage = health.voltage || health['input-voltage'] || null;
                        const fanSpeed = health['fan1-speed'] || health['fan-speed'] || health.fan || null;
                        const powerConsumption = health['power-consumption'] || null;
                        const memUsedPct = info['total-memory'] && info['free-memory']
                          ? Math.round(((parseInt(info['total-memory']) - parseInt(info['free-memory'])) / parseInt(info['total-memory'])) * 100)
                          : null;

                        return (
                          <div className="space-y-6">
                            {info.reboot_detected && (
                              <div className="p-3 rounded-lg border border-destructive bg-destructive/10 flex items-center gap-3">
                                <AlertTriangle className="w-5 h-5 text-destructive" />
                                <div>
                                  <p className="text-sm font-semibold text-destructive">⚠️ Reinicialização Detectada!</p>
                                  <p className="text-xs text-muted-foreground">Uptime anterior: {info.previous_uptime} → Atual: {info.uptime}</p>
                                </div>
                              </div>
                            )}

                            {(cpuTemp || voltage || fanSpeed || powerConsumption) && (
                              <div>
                                <h4 className="text-sm font-semibold mb-3">🌡️ Temperatura & Hardware</h4>
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                                  {cpuTemp && (
                                    <div className="p-3 rounded-lg border bg-card">
                                      <p className="text-xs text-muted-foreground">Temp. CPU</p>
                                      <p className={`text-2xl font-bold ${Number(cpuTemp) > 70 ? "text-destructive" : Number(cpuTemp) > 55 ? "text-orange-500" : "text-primary"}`}>
                                        {cpuTemp}°C
                                      </p>
                                    </div>
                                  )}
                                  {voltage && (
                                    <div className="p-3 rounded-lg border bg-card">
                                      <p className="text-xs text-muted-foreground">Voltagem</p>
                                      <p className="text-2xl font-bold">{voltage}V</p>
                                    </div>
                                  )}
                                  {fanSpeed && (
                                    <div className="p-3 rounded-lg border bg-card">
                                      <p className="text-xs text-muted-foreground">Fan</p>
                                      <p className="text-2xl font-bold">{fanSpeed} RPM</p>
                                    </div>
                                  )}
                                  {powerConsumption && (
                                    <div className="p-3 rounded-lg border bg-card">
                                      <p className="text-xs text-muted-foreground">Consumo</p>
                                      <p className="text-2xl font-bold">{powerConsumption}W</p>
                                    </div>
                                  )}
                                </div>
                                {Object.keys(health).length > 0 && (
                                  <details className="mt-3">
                                    <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground">Ver todos os sensores ({Object.keys(health).length})</summary>
                                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-2">
                                      {Object.entries(health).map(([key, val]) => (
                                        <div key={key} className="p-2 rounded border text-xs">
                                          <span className="text-muted-foreground">{key}:</span> <span className="font-medium">{String(val)}</span>
                                        </div>
                                      ))}
                                    </div>
                                  </details>
                                )}
                              </div>
                            )}

                            <div>
                              <h4 className="text-sm font-semibold mb-3">⏱️ Uptime & Sistema</h4>
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                {[
                                  { label: "Identidade", value: info.identity },
                                  { label: "RouterOS", value: info.version },
                                  { label: "Uptime", value: info.uptime, highlight: true },
                                  { label: "Board", value: info['board-name'] },
                                  { label: "Arquitetura", value: info.architecture },
                                  { label: "CPU", value: info.cpu },
                                  { label: "CPU Cores", value: info['cpu-count'] },
                                  { label: "CPU Freq", value: info['cpu-frequency'] ? `${info['cpu-frequency']} MHz` : '' },
                                  { label: "Carga CPU", value: info['cpu-load'] ? `${info['cpu-load']}%` : '' },
                                  { label: "Memória Total", value: info['total-memory'] ? formatBytes(parseInt(info['total-memory']) || 0) : '' },
                                  { label: "Memória Livre", value: info['free-memory'] ? formatBytes(parseInt(info['free-memory']) || 0) : '' },
                                  { label: "Uso de Memória", value: memUsedPct !== null ? `${memUsedPct}%` : '' },
                                ].filter(item => item.value).map((item: any) => (
                                  <div key={item.label} className={`p-3 rounded-lg border bg-card ${item.highlight ? 'border-primary/30' : ''}`}>
                                    <p className="text-xs text-muted-foreground">{item.label}</p>
                                    <p className="text-sm font-medium mt-0.5">{item.value}</p>
                                  </div>
                                ))}
                              </div>
                            </div>
                          </div>
                        );
                      })() : (
                        <p className="text-center text-muted-foreground py-4">Dados do sistema não disponíveis. Execute o collector na VPS para coletar.</p>
                      )}
                    </CardContent>
                  </Card>

                  {/* Gráficos históricos de temperatura e CPU */}
                  {systemHistory.length > 1 && (
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4">
                      <Card>
                        <CardHeader className="pb-3">
                          <CardTitle className="text-base flex items-center gap-2">
                            <Thermometer className="w-4 h-4" />
                            Histórico de Temperatura
                          </CardTitle>
                        </CardHeader>
                        <CardContent>
                          <ResponsiveContainer width="100%" height={250}>
                            <LineChart data={systemHistory.filter(d => d.cpu_temp != null)}>
                              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                              <XAxis dataKey="time" tick={{ fontSize: 10 }} />
                              <YAxis tick={{ fontSize: 11 }} unit="°C" domain={['dataMin - 5', 'dataMax + 5']} />
                              <RechartsTooltip formatter={(value: number) => [`${value}°C`, 'Temperatura']} />
                              <Line type="monotone" dataKey="cpu_temp" name="Temp CPU" stroke="hsl(var(--destructive))" strokeWidth={2} dot={false} />
                              {/* Linha de referência 70°C */}
                              <Line type="monotone" dataKey={() => 70} name="Limite (70°C)" stroke="hsl(var(--muted-foreground))" strokeWidth={1} strokeDasharray="5 5" dot={false} />
                            </LineChart>
                          </ResponsiveContainer>
                        </CardContent>
                      </Card>

                      <Card>
                        <CardHeader className="pb-3">
                          <CardTitle className="text-base flex items-center gap-2">
                            <Cpu className="w-4 h-4" />
                            Histórico de CPU Load
                          </CardTitle>
                        </CardHeader>
                        <CardContent>
                          <ResponsiveContainer width="100%" height={250}>
                            <LineChart data={systemHistory.filter(d => d.cpu_load != null)}>
                              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                              <XAxis dataKey="time" tick={{ fontSize: 10 }} />
                              <YAxis tick={{ fontSize: 11 }} unit="%" domain={[0, 100]} />
                              <RechartsTooltip formatter={(value: number) => [`${value}%`, 'CPU Load']} />
                              <Legend />
                              <Line type="monotone" dataKey="cpu_load" name="CPU Load" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
                              {systemHistory.some(d => d.memory_used_pct != null) && (
                                <Line type="monotone" dataKey="memory_used_pct" name="Memória %" stroke="hsl(var(--chart-2))" strokeWidth={2} dot={false} />
                              )}
                            </LineChart>
                          </ResponsiveContainer>
                        </CardContent>
                      </Card>
                    </div>
                  )}
    </>
  );
}
