import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, FileText, Printer, Building2 } from "lucide-react";
import { toast } from "sonner";

const monthNames = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

const MonthlyAiReport = () => {
  const now = new Date();
  const [clientId, setClientId] = useState<string>("");
  const [month, setMonth] = useState<string>(String(now.getMonth()));
  const [year, setYear] = useState<string>(String(now.getFullYear()));
  const [sectorIds, setSectorIds] = useState<string[]>([]);
  const [report, setReport] = useState<string | null>(null);
  const [ticketCount, setTicketCount] = useState<number>(0);
  const [loading, setLoading] = useState(false);

  const { data: clients } = useQuery({
    queryKey: ["monthly-report-clients"],
    queryFn: async () => {
      const { data } = await supabase.from("clients").select("id, full_name").order("full_name");
      return data || [];
    },
  });

  const { data: sectors } = useQuery({
    queryKey: ["monthly-report-sectors", clientId],
    queryFn: async () => {
      if (!clientId) return [];
      const { data } = await supabase
        .from("client_sectors")
        .select("id, name")
        .eq("client_id", clientId)
        .order("name");
      return data || [];
    },
    enabled: !!clientId,
  });

  const years = [];
  for (let y = now.getFullYear(); y >= now.getFullYear() - 3; y--) {
    years.push(y);
  }

  const toggleSector = (id: string) => {
    setSectorIds((prev) =>
      prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]
    );
  };

  const sectorLabel = useMemo(() => {
    if (!sectorIds.length) return "Todos os setores";
    if (sectorIds.length === 1) {
      const s = sectors?.find((s) => s.id === sectorIds[0]);
      return s?.name || "1 setor";
    }
    return `${sectorIds.length} setores`;
  }, [sectorIds, sectors]);

  const handleClientChange = (value: string) => {
    setClientId(value);
    setSectorIds([]);
    setReport(null);
  };

  const generateReport = async () => {
    if (!clientId) {
      toast.error("Selecione um cliente.");
      return;
    }
    setLoading(true);
    setReport(null);
    try {
      const { data, error } = await supabase.functions.invoke("ai-monthly-report", {
        body: {
          client_id: clientId,
          month: parseInt(month) + 1,
          year: parseInt(year),
          sector_ids: sectorIds.length > 0 ? sectorIds : undefined,
        },
      });
      if (error) throw error;
      if (data?.error) {
        toast.error(data.error);
        return;
      }
      setReport(data.summary);
      setTicketCount(data.ticketCount || 0);
    } catch (e: any) {
      toast.error("Erro ao gerar relatório: " + (e.message || "Tente novamente"));
    } finally {
      setLoading(false);
    }
  };

  const handlePrint = () => {
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;
    const clientName = clients?.find(c => c.id === clientId)?.full_name || "";
    const monthLabel = monthNames[parseInt(month)];
    const selectedSectorNames = sectorIds.length > 0
      ? sectors?.filter(s => sectorIds.includes(s.id)).map(s => s.name).join(", ") || ""
      : "";
    const logoUrl = `${window.location.origin}/mororo-tech-logo.png`;

    const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Relatório Mensal - ${clientName}</title>
<style>
  @page { size: landscape; margin: 15mm; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Segoe UI', Arial, sans-serif; color: #1e293b; padding: 0; font-size: 13px; line-height: 1.6; }

  .header { display: flex; align-items: center; justify-content: space-between; border-bottom: 3px solid #1a1a2e; padding-bottom: 16px; margin-bottom: 24px; }
  .header-logo img { height: 50px; }
  .header-info { text-align: right; }
  .header-info .company { font-size: 18px; font-weight: 700; color: #1a1a2e; }
  .header-info .contact { font-size: 11px; color: #64748b; margin-top: 2px; }

  .report-title { text-align: center; margin-bottom: 20px; }
  .report-title h1 { font-size: 20px; color: #1a1a2e; margin-bottom: 4px; }
  .report-title .subtitle { font-size: 13px; color: #64748b; }
  .report-title .filters { font-size: 12px; color: #0f3460; margin-top: 4px; font-style: italic; }

  .meta-bar { display: flex; gap: 24px; justify-content: center; background: #f1f5f9; border-radius: 8px; padding: 10px 20px; margin-bottom: 24px; font-size: 13px; }
  .meta-bar .meta-item { display: flex; align-items: center; gap: 6px; }
  .meta-bar .meta-label { font-weight: 600; color: #475569; }
  .meta-bar .meta-value { color: #1a1a2e; font-weight: 700; }

  .content { columns: 2; column-gap: 32px; }
  .content > * { break-inside: avoid; }

  h1 { font-size: 18px; color: #1a1a2e; border-bottom: 2px solid #e2e8f0; padding-bottom: 6px; margin: 20px 0 10px 0; }
  h2 { font-size: 15px; color: #0f3460; margin: 16px 0 8px 0; padding-left: 8px; border-left: 3px solid #3b82f6; }
  h3 { font-size: 13px; color: #334155; margin: 12px 0 6px 0; }
  p { margin-bottom: 8px; text-align: justify; }
  strong { color: #1a1a2e; }
  em { color: #475569; }

  ul, ol { padding-left: 18px; margin-bottom: 8px; }
  li { margin-bottom: 3px; }

  .footer { margin-top: 30px; border-top: 2px solid #e2e8f0; padding-top: 12px; text-align: center; font-size: 10px; color: #94a3b8; }
  .footer .brand { font-weight: 600; color: #1a1a2e; }

  @media print {
    body { margin: 0; }
    .content { columns: 2; }
  }
</style></head>
<body>
  <div class="header">
    <div class="header-logo"><img src="${logoUrl}" alt="Mororo.tech" /></div>
    <div class="header-info">
      <div class="company">Mororo.tech</div>
      <div class="contact">contato@mororo.tech</div>
    </div>
  </div>

  <div class="report-title">
    <h1>Relatório Mensal de Atendimentos</h1>
    <div class="subtitle">${clientName} — ${monthLabel} de ${year}</div>
    ${selectedSectorNames ? `<div class="filters">Setores: ${selectedSectorNames}</div>` : ""}
  </div>

  <div class="meta-bar">
    <div class="meta-item"><span class="meta-label">Total de Chamados:</span><span class="meta-value">${ticketCount}</span></div>
    <div class="meta-item"><span class="meta-label">Período:</span><span class="meta-value">${monthLabel}/${year}</span></div>
  </div>

  <div class="content">${markdownToHtml(report || "")}</div>

  <div class="footer">
    Documento gerado automaticamente por <span class="brand">Mororo.tech</span> em ${new Date().toLocaleDateString("pt-BR")} às ${new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
  </div>
</body></html>`;
    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.onload = () => printWindow.print();
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Relatório Mensal com IA
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4 items-end">
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Cliente</label>
              <Select value={clientId} onValueChange={handleClientChange}>
                <SelectTrigger><SelectValue placeholder="Selecione o cliente" /></SelectTrigger>
                <SelectContent>
                  {clients?.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.full_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {clientId && sectors && sectors.length > 0 && (
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Setores</label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="w-full justify-start gap-2 font-normal">
                      <Building2 className="h-4 w-4" />
                      {sectorLabel}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-64 p-2" align="start">
                    <div className="space-y-1 max-h-48 overflow-y-auto">
                      {sectors.map((s) => (
                        <label
                          key={s.id}
                          className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-accent cursor-pointer text-sm"
                        >
                          <Checkbox
                            checked={sectorIds.includes(s.id)}
                            onCheckedChange={() => toggleSector(s.id)}
                          />
                          {s.name}
                        </label>
                      ))}
                    </div>
                    {sectorIds.length > 0 && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="w-full mt-2"
                        onClick={() => setSectorIds([])}
                      >
                        Limpar seleção
                      </Button>
                    )}
                  </PopoverContent>
                </Popover>
              </div>
            )}

            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Mês</label>
              <Select value={month} onValueChange={setMonth}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {monthNames.map((m, i) => (
                    <SelectItem key={i} value={String(i)}>{m}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Ano</label>
              <Select value={year} onValueChange={setYear}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {years.map((y) => (
                    <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button onClick={generateReport} disabled={loading || !clientId} className="gap-2">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
              {loading ? "Gerando..." : "Gerar Relatório"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {report && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>
              Relatório - {clients?.find(c => c.id === clientId)?.full_name} - {monthNames[parseInt(month)]} {year}
              <span className="text-sm font-normal text-muted-foreground ml-2">({ticketCount} chamados)</span>
            </CardTitle>
            <Button variant="outline" size="sm" onClick={handlePrint} className="gap-2">
              <Printer className="h-4 w-4" /> Imprimir
            </Button>
          </CardHeader>
          <CardContent>
            <div
              className="prose prose-sm max-w-none dark:prose-invert"
              dangerouslySetInnerHTML={{ __html: markdownToHtml(report) }}
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
};

function markdownToHtml(md: string): string {
  let html = md
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  html = html.replace(/^### (.+)$/gm, "<h3>$1</h3>");
  html = html.replace(/^## (.+)$/gm, "<h2>$1</h2>");
  html = html.replace(/^# (.+)$/gm, "<h1>$1</h1>");

  html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/\*(.+?)\*/g, "<em>$1</em>");

  html = html.replace(/^- (.+)$/gm, "<li>$1</li>");
  html = html.replace(/(<li>.*<\/li>\n?)+/g, (match) => `<ul>${match}</ul>`);

  html = html.replace(/\n\n/g, "</p><p>");
  html = `<p>${html}</p>`;
  html = html.replace(/<p><h/g, "<h").replace(/<\/h(\d)><\/p>/g, "</h$1>");
  html = html.replace(/<p><ul>/g, "<ul>").replace(/<\/ul><\/p>/g, "</ul>");

  return html;
}

export default MonthlyAiReport;
