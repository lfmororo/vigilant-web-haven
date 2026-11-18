import { useState, useEffect, useCallback } from "react";
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


interface Props { open: boolean; onOpenChange: (o: boolean) => void }

/** Testa as credenciais da API GDMS (Grandstream) antes de cadastrar o dispositivo. */
export default function GdmsTestDialog({ open, onOpenChange }: Props) {
  const [gdmsTestForm, setGdmsTestForm] = useState({ username: "", password: "", client_id: "", client_secret: "", region: "us" as "us" | "eu" });
  const [gdmsTesting, setGdmsTesting] = useState(false);
  const [gdmsTestResult, setGdmsTestResult] = useState<{ success: boolean; message: string; details?: any } | null>(null);

  const testGdmsConnection = async () => {
    setGdmsTesting(true);
    setGdmsTestResult(null);
    try {
      const { data, error } = await supabase.functions.invoke("grandstream-test-connection", {
        body: gdmsTestForm,
      });
      if (error) throw error;
      if (data?.success) {
        setGdmsTestResult({ success: true, message: data.message || "Conexão OK", details: data });
        toast.success(`Conexão GDMS bem-sucedida (${data.latency_ms}ms)`);
      } else {
        setGdmsTestResult({ success: false, message: data?.error || "Falha na conexão", details: data });
        toast.error(data?.error || "Falha na conexão GDMS");
      }
    } catch (err: any) {
      setGdmsTestResult({ success: false, message: err?.message || "Erro" });
      toast.error(err?.message || "Erro ao testar conexão");
    } finally {
      setGdmsTesting(false);
    }
  };

  const showGdmsTest = open;
  const setShowGdmsTest = onOpenChange;
  return (
      <Dialog open={showGdmsTest} onOpenChange={(o) => { setShowGdmsTest(o); if (!o) setGdmsTestResult(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Testar Conexão com API Grandstream (GDMS)</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Informe as credenciais da sua conta GDMS e do API Developer aprovado para validar a conexão com a API.
            </p>
            <div>
              <Label>Região</Label>
              <select
                className="w-full mt-1 rounded-md border bg-background px-3 py-2 text-sm"
                value={gdmsTestForm.region}
                onChange={(e) => setGdmsTestForm({ ...gdmsTestForm, region: e.target.value as "us" | "eu" })}
              >
                <option value="us">Global (www.gdms.cloud)</option>
                <option value="eu">Europa (eu.gdms.cloud)</option>
              </select>
            </div>
            <div>
              <Label>Usuário da conta GDMS *</Label>
              <Input value={gdmsTestForm.username} onChange={(e) => setGdmsTestForm({ ...gdmsTestForm, username: e.target.value })} placeholder="seu_login_gdms" />
            </div>
            <div>
              <Label>Senha da conta GDMS *</Label>
              <Input type="password" value={gdmsTestForm.password} onChange={(e) => setGdmsTestForm({ ...gdmsTestForm, password: e.target.value })} />
            </div>
            <div>
              <Label>Client ID (API Developer) *</Label>
              <Input value={gdmsTestForm.client_id} onChange={(e) => setGdmsTestForm({ ...gdmsTestForm, client_id: e.target.value })} placeholder="App Key gerado no GDMS" />
            </div>
            <div>
              <Label>Client Secret *</Label>
              <Input type="password" value={gdmsTestForm.client_secret} onChange={(e) => setGdmsTestForm({ ...gdmsTestForm, client_secret: e.target.value })} />
            </div>

            {gdmsTestResult && (
              <div className={`p-3 rounded-md text-sm ${gdmsTestResult.success ? "bg-green-500/10 text-green-600 border border-green-500/30" : "bg-destructive/10 text-destructive border border-destructive/30"}`}>
                <p className="font-medium">{gdmsTestResult.success ? "✅ Conexão OK" : "❌ Falha na conexão"}</p>
                <p className="text-xs mt-1 break-words">{gdmsTestResult.message}</p>
                {gdmsTestResult.details?.http_status && (
                  <p className="text-[10px] mt-1 opacity-70">HTTP {gdmsTestResult.details.http_status}</p>
                )}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowGdmsTest(false)}>Fechar</Button>
            <Button onClick={testGdmsConnection} disabled={gdmsTesting}>
              {gdmsTesting ? "Testando..." : "Testar Conexão"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
  );
}
