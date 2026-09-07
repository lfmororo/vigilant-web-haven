import { useEffect, useMemo, useState } from "react";
import AdminLayout from "@/components/admin/AdminLayout";
import { AgentVersionAlert } from "@/components/admin/AgentVersionAlert";
import { AgentDownloadButton } from "@/components/admin/AgentDownloadButton";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import LocalBackupJobs from "@/components/admin/backup/LocalBackupJobs";
import { toast } from "sonner";
import { Copy, Download, HardDriveDownload, Plus, RefreshCw, Trash2 } from "lucide-react";

interface BackupAgent {
  id: string;
  name: string;
  hostname: string | null;
  api_key: string;
  active: boolean;
  last_seen_at: string | null;
}

interface BackupRun {
  id: string;
  agent_id: string | null;
  status: string;
  source_dir: string | null;
  providers: string | null;
  total_files: number;
  processed_files: number;
  uploaded: number;
  updated: number;
  skipped: number;
  failed: number;
  bytes: number;
  current_file: string | null;
  error_message: string | null;
  started_at: string;
  finished_at: string | null;
  backup_type?: string | null;
  dest_dir?: string | null;
  speed_bps?: number | null;
  eta_seconds?: number | null;
}

const FUNCTIONS_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/backup-report`;

const formatBytes = (bytes: number): string => {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
};

const formatDuration = (seconds?: number | null): string => {
  if (seconds === null || seconds === undefined || !isFinite(seconds) || seconds < 0) return "—";
  const s = Math.round(seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return `${h}h ${m}min`;
  if (m > 0) return `${m}min ${s % 60}s`;
  return `${s}s`;
};

const statusBadge = (status: string) => {
  switch (status) {
    case "running":
      return <Badge className="bg-primary text-primary-foreground">Em andamento</Badge>;
    case "success":
      return <Badge className="bg-emerald-600 text-white">Concluído</Badge>;
    case "partial":
      return <Badge className="bg-amber-500 text-white">Parcial</Badge>;
    default:
      return <Badge variant="destructive">Falhou</Badge>;
  }
};

const AdminBackup = () => {
  // Parâmetros usados para pré-configurar os pacotes ZIP dos agentes.
  const bundleOptions = {
    url: import.meta.env.VITE_SUPABASE_URL,
    key: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
    interval: 300,
  };
  const [agents, setAgents] = useState<BackupAgent[]>([]);
  const [runs, setRuns] = useState<BackupRun[]>([]);
  const [newAgentName, setNewAgentName] = useState("");
  const [loading, setLoading] = useState(true);

  const loadData = async () => {
    setLoading(true);
    const [agentsRes, runsRes] = await Promise.all([
      supabase.from("backup_agents").select("*").order("created_at", { ascending: false }),
      supabase.from("backup_runs").select("*").order("started_at", { ascending: false }).limit(50),
    ]);
    if (agentsRes.error) toast.error("Erro ao carregar agentes de backup");
    if (runsRes.error) toast.error("Erro ao carregar execuções de backup");
    setAgents((agentsRes.data as BackupAgent[]) ?? []);
    setRuns((runsRes.data as BackupRun[]) ?? []);
    setLoading(false);
  };

  useEffect(() => {
    loadData();
    const channel = supabase
      .channel("backup-runs-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "backup_runs" }, () => {
        supabase
          .from("backup_runs")
          .select("*")
          .order("started_at", { ascending: false })
          .limit(50)
          .then(({ data }) => setRuns((data as BackupRun[]) ?? []));
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const activeRuns = useMemo(() => runs.filter((r) => r.status === "running"), [runs]);

  const createAgent = async () => {
    const name = newAgentName.trim();
    if (!name) {
      toast.error("Informe um nome para o servidor/agente.");
      return;
    }
    const apiKey = crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "");
    const { error } = await supabase.from("backup_agents").insert({ name, api_key: apiKey });
    if (error) {
      toast.error("Não foi possível criar o agente.");
      return;
    }
    setNewAgentName("");
    toast.success("Agente criado. Copie a chave e configure no servidor.");
    loadData();
  };

  const removeAgent = async (id: string) => {
    const { error } = await supabase.from("backup_agents").delete().eq("id", id);
    if (error) {
      toast.error("Não foi possível remover o agente.");
      return;
    }
    toast.success("Agente removido.");
    loadData();
  };

  const copy = (value: string, label: string) => {
    navigator.clipboard.writeText(value);
    toast.success(`${label} copiado!`);
  };

  return (
    <AdminLayout>
      <AgentVersionAlert types={["backup-nuvem", "backup-local"]} className="mb-4" />
      <div className="p-4 md:p-8 space-y-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-foreground flex items-center gap-2">
              <HardDriveDownload className="w-7 h-7 text-primary" />
              Backup
            </h1>
            <p className="text-muted-foreground">
              use esse modelo de script para script de baclup local
            </p>
          </div>
          <Button variant="outline" onClick={loadData} disabled={loading}>
            <RefreshCw className="w-4 h-4 mr-2" /> Atualizar
          </Button>
        </div>

        <Tabs defaultValue="local">
          <TabsList>
            <TabsTrigger value="local">Backup local / rede</TabsTrigger>
            <TabsTrigger value="cloud">Backup em nuvem</TabsTrigger>
          </TabsList>

          <TabsContent value="local" className="mt-4">
            <LocalBackupJobs agents={agents.map((a) => ({ id: a.id, name: a.name }))} endpoint={FUNCTIONS_URL} />
          </TabsContent>

          <TabsContent value="cloud" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle>Scripts</CardTitle>
                <CardDescription>Baixe e execute no servidor que possui a pasta a ser copiada.</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-3">
                <AgentDownloadButton
                  agent="cloudBackup"
                  label="Baixar Agente de Backup em Nuvem (.zip)"
                  variant="default"
                  options={bundleOptions}
                />
                <Button variant="outline" asChild>
                  <a href="/instalar-agente-servico.ps1" download>
                    <Download className="w-4 h-4 mr-2" /> Somente o instalador (.ps1)
                  </a>
                </Button>
                <Button variant="ghost" asChild>
                  <a href="/cloud-backup-README.md" target="_blank" rel="noreferrer">
                    Ver documentação
                  </a>
                </Button>

              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Download do script local */}
        <Card>
          <CardHeader>
            <CardTitle>Script de backup local</CardTitle>
            <CardDescription>
              Copia para disco ou rede usando várias cópias simultâneas e reporta o progresso em tempo real.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap gap-3">
              <AgentDownloadButton
                agent="localBackup"
                label="Baixar Agente de Backup Local (.zip)"
                variant="default"
                options={bundleOptions}
              />
              <Button variant="outline" asChild>
                <a href="/instalar-agente-servico.ps1" download>
                  <Download className="w-4 h-4 mr-2" /> Somente o instalador (.ps1)
                </a>
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Coloque o instalador na mesma pasta do script e execute no PowerShell como Administrador:{" "}
              <code>.\instalar-agente-servico.ps1 -Script local-backup.js</code>. O agente passa a rodar como
              serviço do Windows a partir dessa pasta, com reinício automático e logs em <code>.\logs\</code>.
            </p>
          </CardContent>

        </Card>


        {/* Agentes */}
        <Card>
          <CardHeader>
            <CardTitle>Agentes / Servidores</CardTitle>
            <CardDescription>
              Cada agente possui uma chave usada pelo script para reportar o progresso.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-col sm:flex-row gap-2">
              <div className="flex-1">
                <Label htmlFor="agent-name" className="sr-only">
                  Nome do agente
                </Label>
                <Input
                  id="agent-name"
                  placeholder="Ex.: Servidor Arquivos - Matriz"
                  value={newAgentName}
                  onChange={(e) => setNewAgentName(e.target.value)}
                />
              </div>
              <Button onClick={createAgent}>
                <Plus className="w-4 h-4 mr-2" /> Novo agente
              </Button>
            </div>

            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead>Host</TableHead>
                    <TableHead>Último contato</TableHead>
                    <TableHead>Chave</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {agents.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-muted-foreground">
                        Nenhum agente cadastrado.
                      </TableCell>
                    </TableRow>
                  )}
                  {agents.map((agent) => (
                    <TableRow key={agent.id}>
                      <TableCell className="font-medium">{agent.name}</TableCell>
                      <TableCell className="text-muted-foreground">{agent.hostname ?? "—"}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {agent.last_seen_at
                          ? new Date(agent.last_seen_at).toLocaleString("pt-BR")
                          : "Nunca"}
                      </TableCell>
                      <TableCell>
                        <code className="text-xs">{agent.api_key.slice(0, 10)}•••</code>
                      </TableCell>
                      <TableCell className="text-right whitespace-nowrap">
                        <Button
                          variant="ghost"
                          size="icon"
                          title="Copiar chave"
                          onClick={() => copy(agent.api_key, "Chave")}
                        >
                          <Copy className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          title="Remover agente"
                          onClick={() => removeAgent(agent.id)}
                        >
                          <Trash2 className="w-4 h-4 text-destructive" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <div className="rounded-lg bg-muted p-4 text-sm space-y-2">
              <p className="font-medium text-foreground">Configuração no servidor</p>
              <pre className="overflow-x-auto text-xs text-muted-foreground whitespace-pre-wrap">
{`export BACKUP_API_URL="${FUNCTIONS_URL}"
export BACKUP_API_KEY="<chave do agente>"
node cloud-backup.js run --dir /caminho/da/pasta --provider both`}
              </pre>
              <Button variant="outline" size="sm" onClick={() => copy(FUNCTIONS_URL, "Endpoint")}>
                <Copy className="w-4 h-4 mr-2" /> Copiar endpoint
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Em andamento */}
        {activeRuns.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Backups em andamento</CardTitle>
              <CardDescription>Atualização em tempo real.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {activeRuns.map((run) => {
                const pct = run.total_files
                  ? Math.min(100, Math.round((run.processed_files / run.total_files) * 100))
                  : 0;
                return (
                  <div key={run.id} className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-foreground font-medium">
                        {agents.find((a) => a.id === run.agent_id)?.name ?? "Agente"} · {run.source_dir}
                      </span>
                      <span className="text-muted-foreground">
                        {run.processed_files}/{run.total_files} ({pct}%)
                      </span>
                    </div>
                    <Progress value={pct} />
                    <div className="flex flex-wrap justify-between gap-2 text-xs text-muted-foreground">
                      <span className="truncate">
                        {run.current_file ? `Copiando: ${run.current_file}` : "Preparando..."}
                      </span>
                      <span className="whitespace-nowrap">
                        {formatBytes(run.bytes)}
                        {run.speed_bps ? ` · ${formatBytes(run.speed_bps)}/s` : ""} · restam{" "}
                        {formatDuration(run.eta_seconds)}
                      </span>
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        )}

        {/* Histórico */}
        <Card>
          <CardHeader>
            <CardTitle>Histórico de execuções</CardTitle>
            <CardDescription>Últimas 50 execuções reportadas pelos agentes.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Início</TableHead>
                    <TableHead>Agente</TableHead>
                    <TableHead>Origem</TableHead>
                    <TableHead>Destinos</TableHead>
                    <TableHead>Arquivos</TableHead>
                    <TableHead>Volume</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {runs.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center text-muted-foreground">
                        Nenhuma execução registrada ainda.
                      </TableCell>
                    </TableRow>
                  )}
                  {runs.map((run) => (
                    <TableRow key={run.id}>
                      <TableCell className="whitespace-nowrap">
                        {new Date(run.started_at).toLocaleString("pt-BR")}
                      </TableCell>
                      <TableCell>{agents.find((a) => a.id === run.agent_id)?.name ?? "—"}</TableCell>
                      <TableCell className="max-w-[220px] truncate">{run.source_dir ?? "—"}</TableCell>
                      <TableCell>{run.providers ?? "—"}</TableCell>
                      <TableCell className="whitespace-nowrap">
                        {run.uploaded + run.updated} enviados · {run.skipped} pulados · {run.failed} falhas
                      </TableCell>
                      <TableCell>{formatBytes(run.bytes)}</TableCell>
                      <TableCell>{statusBadge(run.status)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
};

export default AdminBackup;
