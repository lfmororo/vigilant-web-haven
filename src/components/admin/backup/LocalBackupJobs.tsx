import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Copy, FolderSync, Pencil, Plus, Trash2 } from "lucide-react";

export interface LocalBackupAgentOption {
  id: string;
  name: string;
}

export interface LocalBackupJob {
  id: string;
  name: string;
  agent_id: string | null;
  source_path: string;
  dest_path: string;
  mirror: boolean;
  threads: number;
  schedule_cron: string | null;
  notify_phone: string | null;
  notify_on_start: boolean;
  notify_on_progress: boolean;
  notify_on_finish: boolean;
  notify_on_error: boolean;
  progress_step_pct: number;
  is_active: boolean;
}

type JobForm = Omit<LocalBackupJob, "id">;

const emptyForm: JobForm = {
  name: "",
  agent_id: null,
  source_path: "",
  dest_path: "",
  mirror: false,
  threads: 16,
  schedule_cron: "",
  notify_phone: "",
  notify_on_start: true,
  notify_on_progress: true,
  notify_on_finish: true,
  notify_on_error: true,
  progress_step_pct: 25,
  is_active: true,
};

interface LocalBackupJobsProps {
  agents: LocalBackupAgentOption[];
  endpoint: string;
}

const LocalBackupJobs = ({ agents, endpoint }: LocalBackupJobsProps) => {
  const [jobs, setJobs] = useState<LocalBackupJob[]>([]);
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<JobForm>(emptyForm);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    const { data, error } = await supabase
      .from("backup_jobs")
      .select("*")
      .eq("job_type", "local")
      .order("created_at", { ascending: false });
    if (error) {
      toast.error("Erro ao carregar tarefas de backup local.");
      return;
    }
    setJobs((data as LocalBackupJob[]) ?? []);
  };

  useEffect(() => {
    load();
  }, []);

  const openNew = () => {
    setEditingId(null);
    setForm(emptyForm);
    setOpen(true);
  };

  const openEdit = (job: LocalBackupJob) => {
    setEditingId(job.id);
    const { id: _id, ...rest } = job;
    setForm(rest);
    setOpen(true);
  };

  const save = async () => {
    if (!form.name.trim() || !form.source_path.trim() || !form.dest_path.trim()) {
      toast.error("Preencha nome, caminho de origem e caminho de destino.");
      return;
    }
    setSaving(true);
    const payload = {
      ...form,
      job_type: "local",
      name: form.name.trim(),
      source_path: form.source_path.trim(),
      dest_path: form.dest_path.trim(),
      schedule_cron: form.schedule_cron?.trim() || null,
      notify_phone: form.notify_phone?.trim() || null,
    };
    const { error } = editingId
      ? await supabase.from("backup_jobs").update(payload).eq("id", editingId)
      : await supabase.from("backup_jobs").insert(payload);
    setSaving(false);
    if (error) {
      toast.error("Não foi possível salvar a tarefa.");
      return;
    }
    toast.success(editingId ? "Tarefa atualizada." : "Tarefa criada.");
    setOpen(false);
    load();
  };

  const remove = async (id: string) => {
    const { error } = await supabase.from("backup_jobs").delete().eq("id", id);
    if (error) {
      toast.error("Não foi possível remover a tarefa.");
      return;
    }
    toast.success("Tarefa removida.");
    load();
  };

  const copyCommand = (job: LocalBackupJob) => {
    const cmd = [
      `set BACKUP_API_URL=${endpoint}`,
      `set BACKUP_API_KEY=<chave do agente>`,
      `node local-backup.js --job ${job.id}`,
    ].join("\n");
    navigator.clipboard.writeText(cmd);
    toast.success("Comando copiado!");
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div>
          <CardTitle className="flex items-center gap-2">
            <FolderSync className="w-5 h-5 text-primary" /> Backup local / rede
          </CardTitle>
          <CardDescription>
            Configure origem e destino (inclusive caminhos de rede <code>\\servidor\pasta</code>) e os alertas
            enviados por WhatsApp.
          </CardDescription>
        </div>
        <Button onClick={openNew}>
          <Plus className="w-4 h-4 mr-2" /> Nova tarefa
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tarefa</TableHead>
                <TableHead>Servidor</TableHead>
                <TableHead>Origem</TableHead>
                <TableHead>Destino</TableHead>
                <TableHead>Paralelismo</TableHead>
                <TableHead>Alertas</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {jobs.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground">
                    Nenhuma tarefa de backup local configurada.
                  </TableCell>
                </TableRow>
              )}
              {jobs.map((job) => (
                <TableRow key={job.id}>
                  <TableCell className="font-medium">
                    {job.name}
                    {!job.is_active && (
                      <Badge variant="outline" className="ml-2">
                        Pausada
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {agents.find((a) => a.id === job.agent_id)?.name ?? "—"}
                  </TableCell>
                  <TableCell className="max-w-[200px] truncate">{job.source_path}</TableCell>
                  <TableCell className="max-w-[200px] truncate">
                    {job.dest_path}
                    {job.mirror && (
                      <Badge variant="secondary" className="ml-2">
                        Espelho
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>{job.threads} cópias</TableCell>
                  <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                    {[
                      job.notify_on_start && "Início",
                      job.notify_on_progress && `${job.progress_step_pct}%`,
                      job.notify_on_finish && "Término",
                      job.notify_on_error && "Erros",
                    ]
                      .filter(Boolean)
                      .join(" · ") || "Sem alertas"}
                  </TableCell>
                  <TableCell className="text-right whitespace-nowrap">
                    <Button variant="ghost" size="icon" title="Copiar comando" onClick={() => copyCommand(job)}>
                      <Copy className="w-4 h-4" />
                    </Button>
                    <Button variant="ghost" size="icon" title="Editar" onClick={() => openEdit(job)}>
                      <Pencil className="w-4 h-4" />
                    </Button>
                    <Button variant="ghost" size="icon" title="Remover" onClick={() => remove(job.id)}>
                      <Trash2 className="w-4 h-4 text-destructive" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        <div className="rounded-lg bg-muted p-4 text-sm space-y-2">
          <p className="font-medium text-foreground">Como executar no servidor</p>
          <pre className="overflow-x-auto text-xs text-muted-foreground whitespace-pre-wrap">
{`# Windows (PowerShell)
$env:BACKUP_API_URL="${endpoint}"
$env:BACKUP_API_KEY="<chave do agente>"
node local-backup.js --job <id da tarefa>

# Linux / macOS
export BACKUP_API_URL="${endpoint}"
export BACKUP_API_KEY="<chave do agente>"
node local-backup.js --source /dados --dest /mnt/nas/backup --threads 16

# Monitoramento contínuo (copia na hora todo arquivo novo ou alterado)
node local-backup.js "C:\\dados" --destino "\\\\servidor\\backup" --vigiar`}
          </pre>
          <p className="text-xs text-muted-foreground">
            Agende no Agendador de Tarefas do Windows ou no cron. Para destinos de rede, monte o compartilhamento
            com o usuário que tem permissão de escrita e use o caminho UNC completo. Com <code>--vigiar</code>, o
            agente faz a cópia inicial e depois fica monitorando a origem, copiando imediatamente arquivos novos ou
            alterados. Arquivos apagados na origem são sempre preservados no destino.
          </p>

        </div>
      </CardContent>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? "Editar tarefa" : "Nova tarefa de backup local"}</DialogTitle>
            <DialogDescription>Defina os caminhos, o paralelismo e os alertas via WhatsApp.</DialogDescription>
          </DialogHeader>

          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="job-name">Nome da tarefa</Label>
              <Input
                id="job-name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Ex.: Backup Financeiro → NAS"
              />
            </div>

            <div className="grid gap-2">
              <Label>Servidor / agente</Label>
              <Select
                value={form.agent_id ?? "none"}
                onValueChange={(v) => setForm({ ...form, agent_id: v === "none" ? null : v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o agente" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Não vinculado</SelectItem>
                  {agents.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="job-source">Caminho de origem</Label>
              <Input
                id="job-source"
                value={form.source_path}
                onChange={(e) => setForm({ ...form, source_path: e.target.value })}
                placeholder="D:\Dados"
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="job-dest">Caminho de destino (aceita rede)</Label>
              <Input
                id="job-dest"
                value={form.dest_path}
                onChange={(e) => setForm({ ...form, dest_path: e.target.value })}
                placeholder="\\NAS\backup\Dados"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="job-threads">Cópias simultâneas</Label>
                <Input
                  id="job-threads"
                  type="number"
                  min={1}
                  max={64}
                  value={form.threads}
                  onChange={(e) => setForm({ ...form, threads: Number(e.target.value) || 1 })}
                />
                <p className="text-xs text-muted-foreground">16–32 aproveita melhor links de 1Gb+.</p>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="job-cron">Agendamento (informativo)</Label>
                <Input
                  id="job-cron"
                  value={form.schedule_cron ?? ""}
                  onChange={(e) => setForm({ ...form, schedule_cron: e.target.value })}
                  placeholder="0 2 * * *"
                />
              </div>
            </div>

            <div className="flex items-center justify-between rounded-lg border border-border p-3">
              <div>
                <Label>Modo espelho</Label>
                <p className="text-xs text-muted-foreground">Apaga no destino o que não existe mais na origem.</p>
              </div>
              <Switch checked={form.mirror} onCheckedChange={(v) => setForm({ ...form, mirror: v })} />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="job-phone">WhatsApp para alertas</Label>
              <Input
                id="job-phone"
                value={form.notify_phone ?? ""}
                onChange={(e) => setForm({ ...form, notify_phone: e.target.value })}
                placeholder="5585999999999"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {(
                [
                  ["notify_on_start", "Alerta de início"],
                  ["notify_on_progress", "Alerta de progresso"],
                  ["notify_on_finish", "Alerta de término"],
                  ["notify_on_error", "Alerta de erros"],
                ] as const
              ).map(([key, label]) => (
                <div key={key} className="flex items-center justify-between rounded-lg border border-border p-3">
                  <Label htmlFor={key}>{label}</Label>
                  <Switch
                    id={key}
                    checked={form[key]}
                    onCheckedChange={(v) => setForm({ ...form, [key]: v })}
                  />
                </div>
              ))}
            </div>

            {form.notify_on_progress && (
              <div className="grid gap-2">
                <Label htmlFor="job-step">Enviar progresso a cada (%)</Label>
                <Input
                  id="job-step"
                  type="number"
                  min={5}
                  max={50}
                  value={form.progress_step_pct}
                  onChange={(e) => setForm({ ...form, progress_step_pct: Number(e.target.value) || 25 })}
                />
              </div>
            )}

            <div className="flex items-center justify-between rounded-lg border border-border p-3">
              <Label htmlFor="job-active">Tarefa ativa</Label>
              <Switch
                id="job-active"
                checked={form.is_active}
                onCheckedChange={(v) => setForm({ ...form, is_active: v })}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={save} disabled={saving}>
              {saving ? "Salvando..." : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
};

export default LocalBackupJobs;
