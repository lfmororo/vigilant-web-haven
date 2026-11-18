import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { RefreshCw, Mail } from "lucide-react";

interface Step {etapa: string;status: string;detalhe?: string;}

interface RequestRow {
  id: string;
  full_name: string;
  username: string;
  email: string | null;
  status: string;
  email_status: string;
  steps: Step[] | null;
  log: string | null;
  created_at: string;
}

const statusLabel: Record<string, string> = {
  pending: "Aguardando agente",
  running: "Executando",
  done: "Concluído",
  partial: "Concluído com avisos",
  error: "Erro"
};

const statusVariant = (status: string) =>
status === "done" ? "default" : status === "error" ? "destructive" : "secondary";

export interface ProvisioningRequestsListProps {
  refreshToken: number;
}

const ProvisioningRequestsList = ({ refreshToken }: ProvisioningRequestsListProps) => {
  const [rows, setRows] = useState<RequestRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const { data } = await (supabase.from("provisioning_requests" as any) as any).
    select("id, full_name, username, email, status, email_status, steps, log, created_at").
    order("created_at", { ascending: false }).
    limit(50);
    setRows((data as RequestRow[]) || []);
    setLoading(false);
  };

  useEffect(() => {
    load();
    const timer = setInterval(() => { if (!document.hidden) load(); }, 15000);
    return () => clearInterval(timer);
  }, [refreshToken]);

  const marcarEmail = async (id: string, valor: string) => {
    const { error } = await (supabase.from("provisioning_requests" as any) as any).
    update({ email_status: valor }).eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Situação do e-mail atualizada.");
    load();
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>Pedidos recentes</CardTitle>
          <CardDescription>Acompanhe a criação de cada usuário.</CardDescription>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          <RefreshCw className="w-4 h-4 mr-2" /> Atualizar
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {rows.length === 0 &&
        <p className="text-sm text-muted-foreground">Nenhum pedido registrado ainda.</p>
        }
        {rows.map((row) =>
        <div key={row.id} className="border border-border rounded-lg p-4 space-y-2">
            <div className="flex flex-wrap items-center gap-2 justify-between">
              <div>
                <p className="font-medium">{row.full_name}</p>
                <p className="text-sm text-muted-foreground">
                  {row.username}{row.email ? ` · ${row.email}` : ""}
                </p>
              </div>
              <Badge variant={statusVariant(row.status)}>
                {statusLabel[row.status] || row.status}
              </Badge>
            </div>

            {Array.isArray(row.steps) && row.steps.length > 0 &&
          <ul className="text-sm space-y-1">
                {row.steps.map((step, i) =>
            <li key={i} className="flex gap-2">
                    <span className={step.status === "erro" ? "text-destructive" : "text-muted-foreground"}>
                      {step.status === "erro" ? "✕" : "✓"}
                    </span>
                    <span>{step.etapa}{step.detalhe ? ` — ${step.detalhe}` : ""}</span>
                  </li>
            )}
              </ul>
          }

            <div className="flex items-center gap-2 pt-1">
              <Mail className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">
                E-mail Locaweb: {row.email_status === "done" ? "criado" : row.email_status === "skipped" ? "não se aplica" : "pendente"}
              </span>
              {row.email_status !== "done" &&
            <Button size="sm" variant="outline" onClick={() => marcarEmail(row.id, "done")}>
                  Marcar como criado
                </Button>
            }
            </div>
          </div>
        )}
      </CardContent>
    </Card>);

};

export default ProvisioningRequestsList;
