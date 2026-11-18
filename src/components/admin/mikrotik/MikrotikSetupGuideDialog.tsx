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

/** Passo a passo para configurar o coletor MikroTik/SNMP numa VPS. */
export default function MikrotikSetupGuideDialog({ open, onOpenChange }: Props) {
  const [copiedBlock, setCopiedBlock] = useState<string | null>(null);
  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedBlock(id);
    setTimeout(() => setCopiedBlock(null), 2000);
  };
  const showSetupGuide = open;
  const setShowSetupGuide = onOpenChange;
  return (
      <Dialog open={showSetupGuide} onOpenChange={setShowSetupGuide}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <BookOpen className="w-5 h-5" /> Guia de Configuração — VPS Windows
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-6 text-sm">
            <div className="space-y-2">
              <h3 className="font-semibold text-base flex items-center gap-2">
                <span className="flex items-center justify-center w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs font-bold">1</span>
                Instalar Node.js
              </h3>
              <p className="text-muted-foreground">Baixe e instale o Node.js LTS em <code className="bg-muted px-1 rounded">https://nodejs.org</code>. Após instalar, abra o <strong>PowerShell</strong> e verifique:</p>
              <div className="relative">
                <pre className="bg-muted p-3 rounded-lg text-xs overflow-x-auto">{"node --version\nnpm --version"}</pre>
                <Button size="icon" variant="ghost" className="absolute top-1 right-1 h-6 w-6" onClick={() => copyToClipboard("node --version\nnpm --version", "s1")}>
                  {copiedBlock === "s1" ? <Check className="w-3 h-3 text-green-500" /> : <Copy className="w-3 h-3" />}
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <h3 className="font-semibold text-base flex items-center gap-2">
                <span className="flex items-center justify-center w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs font-bold">2</span>
                Criar pasta do projeto
              </h3>
              <div className="relative">
                <pre className="bg-muted p-3 rounded-lg text-xs overflow-x-auto">{"mkdir C:\\mikrotik-collector\ncd C:\\mikrotik-collector\nnpm init -y"}</pre>
                <Button size="icon" variant="ghost" className="absolute top-1 right-1 h-6 w-6" onClick={() => copyToClipboard("mkdir C:\\mikrotik-collector\ncd C:\\mikrotik-collector\nnpm init -y", "s2")}>
                  {copiedBlock === "s2" ? <Check className="w-3 h-3 text-green-500" /> : <Copy className="w-3 h-3" />}
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <h3 className="font-semibold text-base flex items-center gap-2">
                <span className="flex items-center justify-center w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs font-bold">3</span>
                Instalar dependências
              </h3>
              <div className="relative">
                <pre className="bg-muted p-3 rounded-lg text-xs overflow-x-auto">npm install routeros-client net-snmp</pre>
                <Button size="icon" variant="ghost" className="absolute top-1 right-1 h-6 w-6" onClick={() => copyToClipboard("npm install routeros-client net-snmp", "s3")}>
                  {copiedBlock === "s3" ? <Check className="w-3 h-3 text-green-500" /> : <Copy className="w-3 h-3" />}
                </Button>
              </div>
              <p className="text-muted-foreground text-xs">A lib <code className="bg-muted px-1 rounded">net-snmp</code> é necessária para dispositivos SNMP (ex: Grandstream, TP-Link, Ubiquiti).</p>
            </div>

            <div className="space-y-2">
              <h3 className="font-semibold text-base flex items-center gap-2">
                <span className="flex items-center justify-center w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs font-bold">4</span>
                Baixar o script do coletor
              </h3>
              <p className="text-muted-foreground">Clique no botão <Download className="inline w-3.5 h-3.5" /> ao lado do dispositivo desejado na lista. Salve o arquivo <code className="bg-muted px-1 rounded">.js</code> na pasta <code className="bg-muted px-1 rounded">C:\mikrotik-collector\</code>.</p>
              <p className="text-muted-foreground text-xs">Ou use o <code className="bg-muted px-1 rounded">mikrotik-vps-collector.js</code> genérico com <code className="bg-muted px-1 rounded">collector-config.json</code>.</p>
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <Button size="sm" variant="outline" asChild>
                  <a href="/instalar-agente-servico.ps1" download>
                    <Download className="w-4 h-4 mr-1" /> Baixar instalador de serviço (.ps1)
                  </a>
                </Button>
                <span className="text-muted-foreground text-xs">
                  O botão de download de cada dispositivo já entrega um .zip com coletor + instalador + LEIA-ME.
                </span>
                <span className="text-muted-foreground text-xs">
                  Salve na mesma pasta do coletor e rode como Administrador: <code className="bg-muted px-1 rounded">.\instalar-agente-servico.ps1 -Script mikrotik-vps-collector.js</code>
                </span>
              </div>
            </div>


            <div className="space-y-2">
              <h3 className="font-semibold text-base flex items-center gap-2">
                <span className="flex items-center justify-center w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs font-bold">5</span>
                Testar execução
              </h3>
              <div className="relative">
                <pre className="bg-muted p-3 rounded-lg text-xs overflow-x-auto">{"cd C:\\mikrotik-collector\nnode mikrotik-collector.js"}</pre>
                <Button size="icon" variant="ghost" className="absolute top-1 right-1 h-6 w-6" onClick={() => copyToClipboard("cd C:\\mikrotik-collector\nnode mikrotik-collector.js", "s5")}>
                  {copiedBlock === "s5" ? <Check className="w-3 h-3 text-green-500" /> : <Copy className="w-3 h-3" />}
                </Button>
              </div>
              <p className="text-muted-foreground">Você deve ver <code className="bg-muted px-1 rounded">✅ Conectado</code> e <code className="bg-muted px-1 rounded">📤 Dados enviados</code>.</p>
            </div>

            <div className="space-y-2">
              <h3 className="font-semibold text-base flex items-center gap-2">
                <span className="flex items-center justify-center w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs font-bold">6</span>
                Executar como Serviço Windows
              </h3>
              <p className="text-muted-foreground">Instale <code className="bg-muted px-1 rounded">node-windows</code> para rodar automaticamente:</p>
              <div className="relative">
                <pre className="bg-muted p-3 rounded-lg text-xs overflow-x-auto">{"npm install -g node-windows\nnpm link node-windows"}</pre>
                <Button size="icon" variant="ghost" className="absolute top-1 right-1 h-6 w-6" onClick={() => copyToClipboard("npm install -g node-windows\nnpm link node-windows", "s6a")}>
                  {copiedBlock === "s6a" ? <Check className="w-3 h-3 text-green-500" /> : <Copy className="w-3 h-3" />}
                </Button>
              </div>
              <p className="text-muted-foreground mt-2">Crie o arquivo <code className="bg-muted px-1 rounded">install-service.js</code>:</p>
              <div className="relative">
                <pre className="bg-muted p-3 rounded-lg text-xs overflow-x-auto whitespace-pre">{`const Service = require('node-windows').Service;

const svc = new Service({
  name: 'MikroTik Collector',
  description: 'Coleta dados de dispositivos de rede',
  script: 'C:\\\\mikrotik-collector\\\\mikrotik-collector.js',
  nodeOptions: ['--harmony', '--max_old_space_size=4096']
});

svc.on('install', () => {
  svc.start();
  console.log('Servico instalado e iniciado!');
});

svc.install();`}</pre>
                <Button size="icon" variant="ghost" className="absolute top-1 right-1 h-6 w-6" onClick={() => copyToClipboard("const Service = require('node-windows').Service;\n\nconst svc = new Service({\n  name: 'MikroTik Collector',\n  description: 'Coleta dados de dispositivos de rede',\n  script: 'C:\\\\mikrotik-collector\\\\mikrotik-collector.js',\n  nodeOptions: ['--harmony', '--max_old_space_size=4096']\n});\n\nsvc.on('install', () => {\n  svc.start();\n  console.log('Servico instalado e iniciado!');\n});\n\nsvc.install();", "s6b")}>
                  {copiedBlock === "s6b" ? <Check className="w-3 h-3 text-green-500" /> : <Copy className="w-3 h-3" />}
                </Button>
              </div>
              <p className="text-muted-foreground mt-2">Execute como <strong>Administrador</strong>:</p>
              <div className="relative">
                <pre className="bg-muted p-3 rounded-lg text-xs overflow-x-auto">node install-service.js</pre>
                <Button size="icon" variant="ghost" className="absolute top-1 right-1 h-6 w-6" onClick={() => copyToClipboard("node install-service.js", "s6c")}>
                  {copiedBlock === "s6c" ? <Check className="w-3 h-3 text-green-500" /> : <Copy className="w-3 h-3" />}
                </Button>
              </div>
              <p className="text-muted-foreground text-xs">O serviço aparecerá em <code className="bg-muted px-1 rounded">services.msc</code> com reinício automático.</p>
            </div>

            <div className="space-y-2">
              <h3 className="font-semibold text-base flex items-center gap-2">
                <span className="flex items-center justify-center w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs font-bold">7</span>
                Desinstalar serviço (opcional)
              </h3>
              <p className="text-muted-foreground">Crie <code className="bg-muted px-1 rounded">uninstall-service.js</code>:</p>
              <div className="relative">
                <pre className="bg-muted p-3 rounded-lg text-xs overflow-x-auto whitespace-pre">{`const Service = require('node-windows').Service;
const svc = new Service({
  name: 'MikroTik Collector',
  script: 'C:\\\\mikrotik-collector\\\\mikrotik-collector.js'
});
svc.on('uninstall', () => console.log('Servico removido.'));
svc.uninstall();`}</pre>
                <Button size="icon" variant="ghost" className="absolute top-1 right-1 h-6 w-6" onClick={() => copyToClipboard("const Service = require('node-windows').Service;\nconst svc = new Service({\n  name: 'MikroTik Collector',\n  script: 'C:\\\\mikrotik-collector\\\\mikrotik-collector.js'\n});\nsvc.on('uninstall', () => console.log('Servico removido.'));\nsvc.uninstall();", "s7")}>
                  {copiedBlock === "s7" ? <Check className="w-3 h-3 text-green-500" /> : <Copy className="w-3 h-3" />}
                </Button>
              </div>
            </div>

            <div className="space-y-2 border-t pt-4">
              <h3 className="font-semibold text-base flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-yellow-500" /> Troubleshooting
              </h3>
              <div className="space-y-3">
                <div className="bg-muted/50 p-3 rounded-lg">
                  <p className="font-medium text-xs">❌ ECONNREFUSED na porta 8728</p>
                  <p className="text-muted-foreground text-xs mt-1">Verifique se a API está habilitada: <code className="bg-muted px-1 rounded">/ip service enable api</code>. Confirme que o firewall permite a porta.</p>
                </div>
                <div className="bg-muted/50 p-3 rounded-lg">
                  <p className="font-medium text-xs">❌ SNMP timeout</p>
                  <p className="text-muted-foreground text-xs mt-1">Confirme que SNMP está habilitado, a comunidade/usuário está correto e a porta 161/UDP está liberada no Firewall do Windows.</p>
                </div>
                <div className="bg-muted/50 p-3 rounded-lg">
                  <p className="font-medium text-xs">❌ Firewall do Windows bloqueando</p>
                  <p className="text-muted-foreground text-xs mt-1">PowerShell como Admin:</p>
                  <pre className="bg-muted p-2 rounded text-xs mt-1">{'New-NetFirewallRule -DisplayName "MikroTik Collector" -Direction Outbound -Action Allow -Program "C:\\Program Files\\nodejs\\node.exe"'}</pre>
                </div>
                <div className="bg-muted/50 p-3 rounded-lg">
                  <p className="font-medium text-xs">❌ Erro 401/403 ao enviar dados</p>
                  <p className="text-muted-foreground text-xs mt-1">Verifique se <code className="bg-muted px-1 rounded">supabase_url</code> e <code className="bg-muted px-1 rounded">supabase_anon_key</code> estão corretos no script.</p>
                </div>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
  );
}
