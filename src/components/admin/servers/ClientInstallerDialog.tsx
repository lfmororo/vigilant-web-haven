import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import { Copy, Download } from "lucide-react";
import { generateMonitorToken, sha256Hex } from "./MonitorAgentsTab";

const db = supabase as any;
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const DOWNLOADS = typeof window !== "undefined" ? `${window.location.origin}/downloads` : "/downloads";

type Os = "windows" | "linux-amd64" | "linux-arm64";
const OS_FILE: Record<Os, string> = {
  windows: "mororo-agent.exe",
  "linux-amd64": "mororo-agent-linux-amd64",
  "linux-arm64": "mororo-agent-linux-arm64",
};

function slug(v: string) {
  return v.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "").toLowerCase().slice(0, 40) || "cliente";
}

// Mesmo formato lido por agent/embedded.go: \n#MORORO-CFG#<base64(json)>#END#\n
function trailer(cfg: Record<string, unknown>) {
  const json = new TextEncoder().encode(JSON.stringify(cfg));
  let s = "";
  json.forEach((b) => (s += String.fromCharCode(b)));
  return new TextEncoder().encode(`\n#MORORO-CFG#${btoa(s)}#END#\n`);
}

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  clients: { id: string; full_name: string }[] | undefined;
}

/**
 * Gera um executável do agente já com o endereço do painel e um token do cliente embutidos:
 * o técnico só baixa e executa na máquina (Windows: dois cliques; Linux: sudo ./arquivo).
 */
export default function ClientInstallerDialog({ open, onOpenChange, clients }: Props) {
  const qc = useQueryClient();
  const [client, setClient] = useState("");
  const [role, setRole] = useState<"workstation" | "server">("workstation");
  const [os, setOs] = useState<Os>("windows");
  const [mode, setMode] = useState<"quick" | "wizard">("quick");
  const [desktop, setDesktop] = useState(true);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ file: string; token: string } | null>(null);

  const close = () => { onOpenChange(false); setDone(null); setBusy(false); };

  const generate = async () => {
    const c = clients?.find((x) => x.id === client);
    if (!c) { toast({ title: "Escolha o cliente", variant: "destructive" }); return; }
    setBusy(true);
    try {
      // Baixa o executável antes de criar o token: se o download falhar, nenhum token sobra.
      const res = await fetch(`${DOWNLOADS}/${OS_FILE[os]}`, { cache: "no-store" });
      if (!res.ok) throw new Error(`Não encontrei ${OS_FILE[os]} em /downloads (HTTP ${res.status}). Recompile os agentes na VPS.`);
      const bin = new Uint8Array(await res.arrayBuffer());

      const token = generateMonitorToken();
      const { data: u } = await supabase.auth.getUser();
      const label = role === "server" ? "servidores" : "estações";
      const { error } = await db.from("monitor_agent_tokens").insert({
        name: `Instalador ${c.full_name} (${label})`, client_id: c.id, scopes: ["agent"],
        token_prefix: token.slice(0, 10), token_hash: await sha256Hex(token), created_by: u.user?.id ?? null,
      });
      if (error) throw error;
      qc.invalidateQueries({ queryKey: ["monitor-agent-tokens"] });

      const extra = trailer({ url: SUPABASE_URL, token, role, client: c.full_name, mode, desktop });
      const blob = new Blob([bin, extra], { type: "application/octet-stream" });
      const ext = os === "windows" ? ".exe" : "";
      const arch = os === "windows" ? "" : `-${os}`;
      const file = `mororo-agent-${slug(c.full_name)}-${role === "server" ? "servidor" : "estacao"}${arch}${ext}`;
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = file;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 30000);
      setDone({ file, token });
    } catch (e: any) {
      toast({ title: "Não foi possível gerar o instalador", description: e.message, variant: "destructive" });
    } finally { setBusy(false); }
  };

  const copy = (t: string) => { navigator.clipboard.writeText(t); toast({ title: "Copiado" }); };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && close()}>
      <DialogContent className="max-w-xl">
        <DialogHeader><DialogTitle>{done ? "Instalador gerado" : "Gerar instalador do cliente"}</DialogTitle></DialogHeader>
        {!done ? (
          <div className="space-y-3">
            <div><Label>Cliente</Label>
              <Select value={client} onValueChange={setClient}>
                <SelectTrigger><SelectValue placeholder="Escolha o cliente" /></SelectTrigger>
                <SelectContent>{clients?.map((c) => <SelectItem key={c.id} value={c.id}>{c.full_name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <div><Label>Tipo de máquina</Label>
                <Select value={role} onValueChange={(v) => setRole(v as any)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="workstation">Estação de trabalho</SelectItem>
                    <SelectItem value="server">Servidor</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div><Label>Sistema</Label>
                <Select value={os} onValueChange={(v) => setOs(v as Os)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="windows">Windows</SelectItem>
                    <SelectItem value="linux-amd64">Linux x64</SelectItem>
                    <SelectItem value="linux-arm64">Linux ARM64</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            {os === "windows" && (
              <div><Label>Ao executar</Label>
                <Select value={mode} onValueChange={(v) => setMode(v as any)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="quick">Instalar direto (só confirma)</SelectItem>
                    <SelectItem value="wizard">Abrir o assistente (escanear a rede, escolher equipamentos)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
            <label className="flex items-center justify-between rounded-md border p-2 text-sm">
              Mostrar informações de suporte no papel de parede
              <Switch checked={desktop} onCheckedChange={setDesktop} />
            </label>
            <p className="text-xs text-muted-foreground">
              Cria um token novo do cliente (escopo Agente unificado) e embute no executável junto com o endereço do painel.
              Quem tiver o arquivo consegue cadastrar máquinas nesse cliente: para invalidar, revogue o token "Instalador …" na lista.
            </p>
          </div>
        ) : (
          <div className="space-y-3 text-sm">
            <p>O download de <b>{done.file}</b> começou.</p>
            {os === "windows" ? (
              <p className="text-muted-foreground">Na máquina do cliente: dê dois cliques e confirme. O agente se instala como serviço e aparece em “Máquinas (agente)”.
                Para várias máquinas (GPO/script): <code>{done.file} install --embedded --quiet</code></p>
            ) : (
              <pre className="whitespace-pre-wrap break-all rounded bg-muted p-2 text-[11px]">{`chmod +x ${done.file} && sudo ./${done.file} install --quiet`}</pre>
            )}
            <div>
              <p className="text-xs font-medium text-muted-foreground">Token embutido (caso precise em outro instalador)</p>
              <div className="flex items-center gap-2">
                <code className="flex-1 break-all rounded bg-muted p-2 text-xs">{done.token}</code>
                <Button size="icon" variant="outline" onClick={() => copy(done.token)}><Copy className="h-4 w-4" /></Button>
              </div>
            </div>
          </div>
        )}
        <DialogFooter>
          {!done ? (
            <><Button variant="outline" onClick={close}>Cancelar</Button>
              <Button onClick={generate} disabled={busy || !client}><Download className="mr-1 h-4 w-4" />{busy ? "Gerando..." : "Gerar e baixar"}</Button></>
          ) : <Button onClick={close}>Concluir</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
