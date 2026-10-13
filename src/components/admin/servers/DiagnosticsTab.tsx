import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import { Download, Printer, Stethoscope, Trash2 } from "lucide-react";

interface Finding { check: string; status: string; detail: string; solution: string }

const STATUS_LABEL: Record<string, { label: string; cls: string }> = {
  error: { label: "Problema", cls: "bg-red-500/20 text-red-400 border-red-500/30" },
  warning: { label: "Atenção", cls: "bg-amber-500/20 text-amber-400 border-amber-500/30" },
  fixed: { label: "Corrigido", cls: "bg-cyan-500/20 text-cyan-400 border-cyan-500/30" },
  ok: { label: "OK", cls: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30" },
};
const ORDER = ["error", "warning", "fixed", "ok"];

/** Baixa o script já configurado com o endereço do painel e a empresa. */
async function downloadScript(file: string, clientId: string) {
  const res = await fetch(`/${file}`);
  if (!res.ok) throw new Error("Script não encontrado");
  const text = (await res.text())
    .replace("__SUPABASE_URL__", import.meta.env.VITE_SUPABASE_URL)
    .replace("__SUPABASE_ANON_KEY__", import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY)
    .replace("__CLIENT_ID__", clientId);
  // BOM UTF-8 para o PowerShell 5 ler corretamente.
  const blob = new Blob(["\ufeff", text.replace(/\r?\n/g, "\r\n")], { type: "text/plain" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = file;
  a.click();
  URL.revokeObjectURL(a.href);
}

const DiagnosticsTab = ({ clients }: { clients: { id: string; full_name: string }[] }) => {
  const qc = useQueryClient();
  const [clientId, setClientId] = useState("");
  const [filter, setFilter] = useState("all");
  const [open, setOpen] = useState<any>(null);

  const { data: reports } = useQuery({
    queryKey: ["ad-diagnostics"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ad_diagnostic_reports").select("*, clients(full_name)")
        .order("created_at", { ascending: false }).limit(200);
      if (error) throw error;
      return data || [];
    },
    refetchInterval: 30000,
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("ad_diagnostic_reports").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["ad-diagnostics"] }); setOpen(null); },
  });

  const dl = async (file: string) => {
    try { await downloadScript(file, clientId); toast({ title: "Script baixado" }); }
    catch (e) { toast({ title: "Erro", description: (e as Error).message, variant: "destructive" }); }
  };

  const list = (reports || []).filter((r: any) => filter === "all" || r.client_id === filter);
  const sorted = (f: Finding[]) => [...f].sort((a, b) => ORDER.indexOf(a.status) - ORDER.indexOf(b.status));

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><Stethoscope className="w-5 h-5" /> Scripts de diagnóstico</CardTitle></CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="max-w-sm">
            <Select value={clientId} onValueChange={setClientId}>
              <SelectTrigger><SelectValue placeholder="Empresa (opcional)" /></SelectTrigger>
              <SelectContent>{clients.map((c) => <SelectItem key={c.id} value={c.id}>{c.full_name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => dl("diagnostico-servidor-ad.ps1")}><Download className="w-4 h-4 mr-1" /> Servidor / Active Directory</Button>
            <Button variant="outline" onClick={() => dl("diagnostico-estacao-ad.ps1")}><Download className="w-4 h-4 mr-1" /> Estações do domínio</Button>
          </div>
          <ul className="text-muted-foreground list-disc pl-5 space-y-1">
            <li><b>Servidor:</b> execute no controlador de domínio como admin do domínio. Verifica serviços, DCDIAG, replicação, SYSVOL, horário/NTP, DNS, FSMO, contas de máquina antigas, discos, compartilhamentos e eventos.</li>
            <li><b>Estação:</b> execute como administrador local com <code>-Corrigir</code>. Trata "falha na relação de confiança", "diferença de horário" e "unidade de rede não acessível".</li>
            <li>Comando: <code>powershell -ExecutionPolicy Bypass -File &lt;script&gt;.ps1 -Corrigir</code> (sem <code>-Corrigir</code> apenas diagnostica).</li>
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Relatórios recebidos</CardTitle>
          <div className="w-56">
            <Select value={filter} onValueChange={setFilter}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as empresas</SelectItem>
                {clients.map((c) => <SelectItem key={c.id} value={c.id}>{c.full_name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent className="overflow-x-auto space-y-2">
          {list.length === 0 && <p className="text-muted-foreground text-sm">Nenhum diagnóstico recebido ainda.</p>}
          {list.map((r: any) => (
            <button key={r.id} onClick={() => setOpen(r)} className="w-full text-left flex flex-wrap items-center gap-2 rounded-lg border border-border p-3 hover:bg-muted">
              <span className="font-medium">{r.hostname}</span>
              <Badge variant="secondary">{r.scope === "server" ? "Servidor" : "Estação"}</Badge>
              <span className="text-xs text-muted-foreground">{r.clients?.full_name || r.domain}</span>
              <span className="ml-auto flex gap-1">
                {r.error_count > 0 && <Badge className={STATUS_LABEL.error.cls}>{r.error_count} problemas</Badge>}
                {r.warning_count > 0 && <Badge className={STATUS_LABEL.warning.cls}>{r.warning_count} atenção</Badge>}
                {r.fixed_count > 0 && <Badge className={STATUS_LABEL.fixed.cls}>{r.fixed_count} corrigidos</Badge>}
                <span className="text-xs text-muted-foreground ml-2">{new Date(r.created_at).toLocaleString("pt-BR")}</span>
              </span>
            </button>
          ))}
        </CardContent>
      </Card>

      <Dialog open={!!open} onOpenChange={(v) => !v && setOpen(null)}>
        <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto print:max-h-none">
          {open && (
            <>
              <DialogHeader>
                <DialogTitle>Relatório de diagnóstico — {open.hostname}</DialogTitle>
                <p className="text-sm text-muted-foreground">
                  {open.scope === "server" ? "Servidor" : "Estação"} · {open.domain} · {open.clients?.full_name || "Sem empresa"} · {new Date(open.created_at).toLocaleString("pt-BR")}
                </p>
              </DialogHeader>
              <div className="flex gap-2 print:hidden">
                <Button size="sm" variant="outline" onClick={() => window.print()}><Printer className="w-4 h-4 mr-1" /> Imprimir / PDF</Button>
                <Button size="sm" variant="ghost" onClick={() => del.mutate(open.id)}><Trash2 className="w-4 h-4 mr-1" /> Excluir</Button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="text-left text-muted-foreground border-b border-border">
                    <th className="p-2">Verificação</th><th className="p-2">Situação</th><th className="p-2">Problema encontrado</th><th className="p-2">Solução sugerida</th>
                  </tr></thead>
                  <tbody>
                    {sorted(open.findings as Finding[]).map((f, i) => (
                      <tr key={i} className="border-b border-border align-top">
                        <td className="p-2 font-medium">{f.check}</td>
                        <td className="p-2"><Badge className={(STATUS_LABEL[f.status] || STATUS_LABEL.warning).cls}>{(STATUS_LABEL[f.status] || STATUS_LABEL.warning).label}</Badge></td>
                        <td className="p-2">{f.detail}</td>
                        <td className="p-2 text-muted-foreground whitespace-pre-wrap">{f.solution || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default DiagnosticsTab;
