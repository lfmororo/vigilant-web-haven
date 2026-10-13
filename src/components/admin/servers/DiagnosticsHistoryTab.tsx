import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { History, TrendingDown, TrendingUp, Minus } from "lucide-react";

interface Finding { check: string; status: string; detail: string; solution: string }

const STATUS_LABEL: Record<string, { label: string; cls: string }> = {
  error: { label: "Problema", cls: "bg-red-500/20 text-red-400 border-red-500/30" },
  warning: { label: "Atenção", cls: "bg-amber-500/20 text-amber-400 border-amber-500/30" },
  fixed: { label: "Corrigido", cls: "bg-cyan-500/20 text-cyan-400 border-cyan-500/30" },
  ok: { label: "OK", cls: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30" },
};

type Row = {
  id: string; client_id: string | null; scope: string; hostname: string;
  ok_count: number; warning_count: number; error_count: number; fixed_count: number;
  findings: Finding[]; created_at: string; clients?: { full_name: string } | null;
};

/** Histórico de diagnósticos por empresa: evolução dos problemas e o que já foi corrigido. */
const DiagnosticsHistoryTab = ({ clients }: { clients: { id: string; full_name: string }[] }) => {
  const [clientId, setClientId] = useState("all");

  const { data: reports } = useQuery({
    queryKey: ["ad-diagnostics-history"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ad_diagnostic_reports").select("*, clients(full_name)")
        .order("created_at", { ascending: false }).limit(500);
      if (error) throw error;
      return (data || []) as unknown as Row[];
    },
    refetchInterval: 60000,
  });

  const list = useMemo(
    () => (reports || []).filter((r) => clientId === "all" || r.client_id === clientId),
    [reports, clientId]
  );

  // Resumo por empresa: totais acumulados e tendência entre o diagnóstico mais recente e o anterior.
  const summary = useMemo(() => {
    const byClient = new Map<string, Row[]>();
    list.forEach((r) => {
      const key = r.client_id || "sem-empresa";
      byClient.set(key, [...(byClient.get(key) || []), r]);
    });
    return [...byClient.entries()].map(([key, rows]) => {
      const latest = rows[0];
      const previous = rows[1];
      const openNow = latest.error_count + latest.warning_count;
      const openBefore = previous ? previous.error_count + previous.warning_count : null;
      const totalFixed = rows.reduce((s, r) => s + r.fixed_count, 0);
      // Problemas do diagnóstico anterior que não aparecem mais no mais recente.
      const latestChecks = new Set(
        latest.findings.filter((f) => f.status === "error" || f.status === "warning").map((f) => f.check)
      );
      const resolved = previous
        ? previous.findings.filter(
            (f) => (f.status === "error" || f.status === "warning") && !latestChecks.has(f.check)
          )
        : [];
      return {
        key,
        name: latest.clients?.full_name || "Sem empresa",
        rows,
        latest,
        openNow,
        openBefore,
        totalFixed,
        resolved,
      };
    }).sort((a, b) => b.openNow - a.openNow);
  }, [list]);

  const trend = (now: number, before: number | null) => {
    if (before === null || before === now)
      return <span className="flex items-center gap-1 text-muted-foreground"><Minus className="w-4 h-4" /> estável</span>;
    if (now < before)
      return <span className="flex items-center gap-1 text-emerald-400"><TrendingDown className="w-4 h-4" /> melhorando</span>;
    return <span className="flex items-center gap-1 text-red-400"><TrendingUp className="w-4 h-4" /> piorando</span>;
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2"><History className="w-5 h-5" /> Histórico por empresa</CardTitle>
          <div className="w-56">
            <Select value={clientId} onValueChange={setClientId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as empresas</SelectItem>
                {clients.map((c) => <SelectItem key={c.id} value={c.id}>{c.full_name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {summary.length === 0 && <p className="text-muted-foreground text-sm">Nenhum diagnóstico recebido ainda.</p>}
          {summary.map((s) => (
            <div key={s.key} className="rounded-lg border border-border p-4 space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{s.name}</span>
                <Badge variant="secondary">{s.rows.length} diagnósticos</Badge>
                {s.openNow > 0
                  ? <Badge className={STATUS_LABEL.error.cls}>{s.openNow} em aberto</Badge>
                  : <Badge className={STATUS_LABEL.ok.cls}>Sem problemas em aberto</Badge>}
                {s.totalFixed > 0 && <Badge className={STATUS_LABEL.fixed.cls}>{s.totalFixed} corrigidos no total</Badge>}
                <span className="ml-auto text-sm">{trend(s.openNow, s.openBefore)}</span>
              </div>

              {s.resolved.length > 0 && (
                <div>
                  <p className="text-sm font-medium text-emerald-400 mb-1">
                    Resolvidos desde o diagnóstico anterior ({new Date(s.rows[1].created_at).toLocaleDateString("pt-BR")}):
                  </p>
                  <ul className="text-sm text-muted-foreground list-disc pl-5 space-y-1">
                    {s.resolved.map((f, i) => <li key={i}><span className="text-foreground">{f.check}</span> — {f.detail}</li>)}
                  </ul>
                </div>
              )}

              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-muted-foreground border-b border-border">
                      <th className="p-2">Data</th><th className="p-2">Máquina</th><th className="p-2">Tipo</th>
                      <th className="p-2">Problemas</th><th className="p-2">Atenção</th><th className="p-2">Corrigidos</th><th className="p-2">OK</th>
                    </tr>
                  </thead>
                  <tbody>
                    {s.rows.map((r) => (
                      <tr key={r.id} className="border-b border-border">
                        <td className="p-2 whitespace-nowrap">{new Date(r.created_at).toLocaleString("pt-BR")}</td>
                        <td className="p-2 font-medium">{r.hostname}</td>
                        <td className="p-2">{r.scope === "server" ? "Servidor" : "Estação"}</td>
                        <td className="p-2">{r.error_count > 0 ? <Badge className={STATUS_LABEL.error.cls}>{r.error_count}</Badge> : "0"}</td>
                        <td className="p-2">{r.warning_count > 0 ? <Badge className={STATUS_LABEL.warning.cls}>{r.warning_count}</Badge> : "0"}</td>
                        <td className="p-2">{r.fixed_count > 0 ? <Badge className={STATUS_LABEL.fixed.cls}>{r.fixed_count}</Badge> : "0"}</td>
                        <td className="p-2">{r.ok_count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
};

export default DiagnosticsHistoryTab;
