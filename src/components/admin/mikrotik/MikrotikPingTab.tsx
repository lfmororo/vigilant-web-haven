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

/** Aba "ping" do dispositivo selecionado no Monitor MikroTik. */
export default function MikrotikPingTab({ pingTargets, setPingForm, setShowPingDialog, handleDeletePingTarget }: { interfaces?: MikrotikInterface[]; [key: string]: any }) {
  return (
    <>

                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base flex items-center justify-between">
                        Alvos de Ping
                        <Button size="sm" onClick={() => { setPingForm({ target_ip: "", label: "" }); setShowPingDialog(true); }}>
                          <Plus className="w-4 h-4 mr-1" /> Adicionar
                        </Button>
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      {pingTargets.length === 0 ? (
                        <p className="text-center text-muted-foreground py-4">Nenhum alvo de ping configurado.</p>
                      ) : (
                        <div className="space-y-3">
                          {pingTargets.map((t) => (
                            <div key={t.id} className="flex items-center justify-between p-3 border rounded-lg">
                              <div>
                                <p className="font-medium text-sm">{t.label || t.target_ip}</p>
                                <p className="text-xs text-muted-foreground">{t.target_ip}</p>
                              </div>
                              <div className="flex items-center gap-4">
                                {t.latency_ms !== null && (
                                  <div className="text-right">
                                    <p className="text-sm font-mono">{t.latency_ms}ms</p>
                                    <p className={`text-xs ${(t.packet_loss_pct || 0) > 0 ? "text-destructive" : "text-primary"}`}>
                                      {t.packet_loss_pct}% perda
                                    </p>
                                  </div>
                                )}
                                <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => handleDeletePingTarget(t.id)}>
                                  <Trash2 className="w-3 h-3" />
                                </Button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </CardContent>
                  </Card>
    </>
  );
}
