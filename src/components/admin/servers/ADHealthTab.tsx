import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ShieldCheck, Server, RefreshCw, Globe, AlertTriangle } from "lucide-react";

interface Finding { check: string; status: string; detail: string; solution: string }
type Row = {
  id: string; client_id: string | null; hostname: string; domain: string | null;
  findings: Finding[]; created_at: string; clients?: { full_name: string } | null;
};

const CLS: Record<string, string> = {
  error: "bg-red-500/20 text-red-400 border-red-500/30",
  warning: "bg-amber-500/20 text-amber-400 border-amber-500/30",
  fixed: "bg-cyan-500/20 text-cyan-400 border-cyan-500/30",
  ok: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
};
const LABEL: Record<string, string> = { error: "Problema", warning: "Atenção", fixed: "Corrigido", ok: "OK" };

const GROUPS = [
  { key: "domain", title: "Domínio", icon: Globe, match: (c: string) => /DCDIAG|DNS|FSMO|horario|NTP|Senha de conta|Eventos/i.test(c) },
  { key: "services", title: "Serviços críticos", icon: Server, match: (c: string) => /^Servico|SYSVOL|Disco|Compartilhamento/i.test(c) },
  { key: "replication", title: "Replicação", icon: RefreshCw, match: (c: string) => /Replicacao/i.test(c) },
];

const worst = (fs: Finding[]) =>
  fs.some((f) => f.status === "error") ? "error" : fs.some((f) => f.status === "warning") ? "warning" : "ok";

/** Saúde do AD: último diagnóstico de cada controlador de domínio, agrupado por domínio, serviços e replicação. */
const ADHealthTab = ({ clients }: { clients: { id: string; full_name: string }[] }) => {
  const [clientId, setClientId] = useState("all");
  const { data: reports, isLoading } = useQuery({
    queryKey: ["ad-health"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ad_diagnostic_reports").select("id, client_id, hostname, domain, findings, created_at, clients(full_name)")
        .eq("scope", "server").order("created_at", { ascending: false }).limit(300);
      if (error) throw error;
      return (data || []) as unknown as Row[];
    },
    refetchInterval: 30000,
  });

  const latest = useMemo(() => {
    const seen = new Map<string, Row>();
    (reports || []).forEach((r) => {
      const k = `${r.client_id}|${r.hostname.toLowerCase()}`;
      if (!seen.has(k)) seen.set(k, r);
    });
    return [...seen.values()].filter((r) => clientId === "all" || r.client_id === clientId);
  }, [reports, clientId]);

  const alerts = latest.flatMap((r) =>
    (r.findings || []).filter((f) => f.status === "error" || f.status === "warning").map((f) => ({ r, f })));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          Baseado no último diagnóstico de cada controlador de domínio (script de servidor da aba Diagnósticos).
        </p>
        <Select value={clientId} onValueChange={setClientId}>
          <SelectTrigger className="w-64"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas as empresas</SelectItem>
            {clients.map((c) => <SelectItem key={c.id} value={c.id}>{c.full_name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Controladores</p><p className="text-2xl font-bold">{latest.length}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Saudáveis</p><p className="text-2xl font-bold text-emerald-400">{latest.filter((r) => worst(r.findings || []) === "ok").length}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Alertas graves</p><p className="text-2xl font-bold text-red-400">{alerts.filter((a) => a.f.status === "error").length}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Avisos</p><p className="text-2xl font-bold text-amber-400">{alerts.filter((a) => a.f.status === "warning").length}</p></CardContent></Card>
      </div>

      {alerts.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2 text-base"><AlertTriangle className="w-4 h-4 text-red-400" /> Alertas ativos</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {alerts.map(({ r, f }, i) => (
              <div key={i} className="rounded border border-border p-3 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline" className={CLS[f.status]}>{LABEL[f.status]}</Badge>
                  <span className="font-medium">{f.check}</span>
                  <span className="text-muted-foreground">— {r.hostname} · {r.clients?.full_name || "Sem empresa"}</span>
                </div>
                <p className="mt-1">{f.detail}</p>
                {f.solution && <p className="mt-1 text-muted-foreground">Solução: {f.solution}</p>}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {isLoading && <p className="text-sm text-muted-foreground">Carregando...</p>}
      {!isLoading && latest.length === 0 && (
        <Card><CardContent className="p-6 text-center text-muted-foreground">
          Nenhum diagnóstico de controlador de domínio recebido. Rode o script de servidor da aba Diagnósticos.
        </CardContent></Card>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {latest.map((r) => {
          const fs = r.findings || [];
          const st = worst(fs);
          return (
            <Card key={r.id}>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center justify-between gap-2 text-base">
                  <span className="flex items-center gap-2"><ShieldCheck className="w-4 h-4" /> {r.hostname}</span>
                  <Badge variant="outline" className={CLS[st]}>{st === "ok" ? "Saudável" : LABEL[st]}</Badge>
                </CardTitle>
                <p className="text-xs text-muted-foreground">
                  {r.clients?.full_name || "Sem empresa"} · {r.domain || "domínio não informado"} · {new Date(r.created_at).toLocaleString("pt-BR")}
                </p>
              </CardHeader>
              <CardContent className="space-y-3">
                {GROUPS.map((g) => {
                  const items = fs.filter((f) => g.match(f.check));
                  const gs = items.length ? worst(items) : null;
                  return (
                    <div key={g.key}>
                      <div className="flex items-center justify-between text-sm font-medium mb-1">
                        <span className="flex items-center gap-2"><g.icon className="w-4 h-4" /> {g.title}</span>
                        {gs ? <Badge variant="outline" className={CLS[gs]}>{LABEL[gs]}</Badge> : <span className="text-xs text-muted-foreground">sem dados</span>}
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {items.map((f, i) => (
                          <Badge key={i} variant="outline" className={CLS[f.status] || ""} title={f.detail}>{f.check}</Badge>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
};

export default ADHealthTab;
