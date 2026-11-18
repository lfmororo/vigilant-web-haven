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

/** Aba "logs" do dispositivo selecionado no Monitor MikroTik. */
export default function MikrotikLogsTab({ selectedDevice }: { interfaces?: MikrotikInterface[]; [key: string]: any }) {
  return (
    <>

                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base flex items-center gap-2">
                        Alertas nos Logs - {selectedDevice.name}
                        {selectedDevice.last_log_alerts && selectedDevice.last_log_alerts.length > 0 && (
                          <Badge variant="destructive" className="text-xs">{selectedDevice.last_log_alerts.length}</Badge>
                        )}
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      {selectedDevice.last_log_alerts && selectedDevice.last_log_alerts.length > 0 ? (() => {
                        const allLogs = selectedDevice.last_log_alerts || [];
                        const loginLogs = allLogs.filter((l: any) => l.category === 'login');
                        const ifaceLogs = allLogs.filter((l: any) => l.category === 'interface');
                        const systemLogs = allLogs.filter((l: any) => l.category === 'system');
                        const otherLogs = allLogs.filter((l: any) => !l.category);

                        const renderLogGroup = (title: string, icon: string, items: any[], color: string) => {
                          if (items.length === 0) return null;
                          return (
                            <div className="space-y-2">
                              <div className="flex items-center gap-2">
                                <span>{icon}</span>
                                <h4 className="text-sm font-semibold">{title}</h4>
                                <Badge variant="outline" className="text-xs">{items.length}</Badge>
                              </div>
                              {items.map((log: any, i: number) => (
                                <div key={i} className="flex items-start gap-2 p-2 rounded border text-sm ml-4">
                                  <AlertTriangle className={`w-4 h-4 shrink-0 mt-0.5 ${color}`} />
                                  <div className="min-w-0">
                                    <div className="flex items-center gap-2">
                                      {log.time && <span className="text-xs text-muted-foreground font-mono">{log.time}</span>}
                                      {log.topics && <Badge variant="outline" className="text-xs">{log.topics}</Badge>}
                                    </div>
                                    <p className="text-sm mt-0.5 break-words">{log.message}</p>
                                  </div>
                                </div>
                              ))}
                            </div>
                          );
                        };

                        return (
                          <div className="space-y-4 max-h-[500px] overflow-y-auto">
                            {renderLogGroup("Login Inválido / Tentativas de Invasão", "🔐", loginLogs, "text-destructive")}
                            {renderLogGroup("Interfaces Caindo", "🔌", ifaceLogs, "text-destructive")}
                            {renderLogGroup("Erros de Sistema", "⚙️", systemLogs, "text-muted-foreground")}
                            {renderLogGroup("Outros Alertas", "📋", otherLogs, "text-muted-foreground")}
                          </div>
                        );
                      })() : (
                        <p className="text-center text-muted-foreground py-4">Nenhum alerta nos logs. Execute o collector na VPS para monitorar.</p>
                      )}
                    </CardContent>
                  </Card>
    </>
  );
}
