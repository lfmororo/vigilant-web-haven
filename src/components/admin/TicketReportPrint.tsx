import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface Ticket {
  id: string;
  ticket_number: number;
  title: string;
  status: string;
  priority: string;
  created_at: string;
  updated_at: string;
  client: { full_name: string } | null;
  technician: { full_name: string } | null;
  equipment_types: { name: string } | null;
}

interface Filters {
  clientName: string;
  status: string;
  startDate?: Date;
  endDate?: Date;
}

interface Metrics {
  total: number;
  open: number;
  resolved: number;
  avgHours: number;
}

interface TicketReportPrintProps {
  tickets: Ticket[];
  filters: Filters;
  metrics: Metrics;
  onClose: () => void;
}

const statusLabels: Record<string, string> = {
  open: "Aberto",
  in_progress: "Em Andamento",
  waiting_client: "Aguardando Cliente",
  resolved: "Resolvido",
  closed: "Fechado",
};

const priorityLabels: Record<string, string> = {
  low: "Baixa",
  medium: "Média",
  high: "Alta",
  urgent: "Urgente",
};

const formatAvgTime = (hours: number) => {
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  const rem = hours % 24;
  return rem > 0 ? `${days}d ${rem}h` : `${days}d`;
};

const TicketReportPrint = ({ tickets, filters, metrics, onClose }: TicketReportPrintProps) => {
  const [company, setCompany] = useState<Record<string, string>>({});

  useEffect(() => {
    supabase.from("system_settings").select("key, value")
      .in("key", ["company_name", "company_address", "company_phone", "company_cnpj", "company_email"])
      .then(({ data }) => {
        const map: Record<string, string> = {};
        data?.forEach(s => { if (s.value) map[s.key] = s.value; });
        setCompany(map);
      });

    const handleAfterPrint = () => onClose();
    window.addEventListener("afterprint", handleAfterPrint);
    return () => window.removeEventListener("afterprint", handleAfterPrint);
  }, []);

  const activeFilters: string[] = [];
  if (filters.clientName !== "Todos") activeFilters.push(`Cliente: ${filters.clientName}`);
  if (filters.status !== "all") activeFilters.push(`Status: ${statusLabels[filters.status] || filters.status}`);
  if (filters.startDate) activeFilters.push(`De: ${format(filters.startDate, "dd/MM/yyyy")}`);
  if (filters.endDate) activeFilters.push(`Até: ${format(filters.endDate, "dd/MM/yyyy")}`);

  return (
    <div className="fixed inset-0 z-[9999] bg-white text-black overflow-auto print:static">
      <div className="print:hidden fixed top-4 right-4 z-50 flex gap-2">
        <button onClick={() => window.print()} className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">Imprimir</button>
        <button onClick={onClose} className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700">Voltar</button>
      </div>

      <div className="p-8 max-w-[210mm] mx-auto">
        <div className="border-2 border-black">
          {/* Header */}
          <div className="flex items-center border-b-2 border-black p-3 gap-3">
            <img src="/lovable-uploads/6a5524af-fc9f-4a85-85ec-2236896048a6.png" alt="Logo" className="h-12 w-auto object-contain" />
            <div className="flex-1">
              <h1 className="text-lg font-bold">{company.company_name || "Empresa"}</h1>
              <p className="text-xs">{company.company_address || ""}</p>
              <p className="text-xs">{company.company_phone || ""} {company.company_email ? `| ${company.company_email}` : ""}</p>
              {company.company_cnpj && <p className="text-xs">CNPJ: {company.company_cnpj}</p>}
            </div>
            <div className="text-right">
              <h2 className="text-base font-bold">Relatório de Chamados</h2>
              <p className="text-xs">Gerado em: {format(new Date(), "dd/MM/yyyy HH:mm", { locale: ptBR })}</p>
            </div>
          </div>

          {/* Filters */}
          {activeFilters.length > 0 && (
            <div className="border-b-2 border-black">
              <div className="bg-gray-200 px-3 py-1 font-bold text-sm border-b border-black">Filtros Aplicados</div>
              <div className="px-3 py-2 text-xs">{activeFilters.join(" | ")}</div>
            </div>
          )}

          {/* Metrics */}
          <div className="border-b-2 border-black">
            <div className="bg-gray-200 px-3 py-1 font-bold text-sm border-b border-black">Resumo</div>
            <div className="grid grid-cols-4 text-xs">
              <div className="border-r border-black px-3 py-2 text-center">
                <div className="font-bold text-sm">{metrics.total}</div>
                <div>Total</div>
              </div>
              <div className="border-r border-black px-3 py-2 text-center">
                <div className="font-bold text-sm">{metrics.open}</div>
                <div>Em Aberto</div>
              </div>
              <div className="border-r border-black px-3 py-2 text-center">
                <div className="font-bold text-sm">{metrics.resolved}</div>
                <div>Resolvidos</div>
              </div>
              <div className="px-3 py-2 text-center">
                <div className="font-bold text-sm">{formatAvgTime(metrics.avgHours)}</div>
                <div>Tempo Médio</div>
              </div>
            </div>
          </div>

          {/* Table */}
          <div>
            <div className="bg-gray-200 px-3 py-1 font-bold text-sm border-b border-black">
              Chamados ({tickets.length} {tickets.length === 1 ? "registro" : "registros"})
            </div>
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-black bg-gray-100">
                  <th className="border-r border-black px-2 py-1 text-left w-12">#</th>
                  <th className="border-r border-black px-2 py-1 text-left">Título</th>
                  <th className="border-r border-black px-2 py-1 text-left w-28">Cliente</th>
                  <th className="border-r border-black px-2 py-1 text-left w-20">Equipamento</th>
                  <th className="border-r border-black px-2 py-1 text-left w-24">Técnico</th>
                  <th className="border-r border-black px-2 py-1 text-left w-16">Prioridade</th>
                  <th className="border-r border-black px-2 py-1 text-left w-20">Status</th>
                  <th className="border-r border-black px-2 py-1 text-left w-20">Abertura</th>
                  <th className="px-2 py-1 text-left w-20">Atualização</th>
                </tr>
              </thead>
              <tbody>
                {tickets.map((t) => (
                  <tr key={t.id} className="border-b border-black">
                    <td className="border-r border-black px-2 py-1 font-mono">{t.ticket_number}</td>
                    <td className="border-r border-black px-2 py-1">{t.title}</td>
                    <td className="border-r border-black px-2 py-1">{(t.client as any)?.full_name || "-"}</td>
                    <td className="border-r border-black px-2 py-1">{(t.equipment_types as any)?.name || "-"}</td>
                    <td className="border-r border-black px-2 py-1">{(t.technician as any)?.full_name || "-"}</td>
                    <td className="border-r border-black px-2 py-1">{priorityLabels[t.priority] || t.priority}</td>
                    <td className="border-r border-black px-2 py-1">{statusLabels[t.status] || t.status}</td>
                    <td className="border-r border-black px-2 py-1">{format(new Date(t.created_at), "dd/MM/yy HH:mm")}</td>
                    <td className="px-2 py-1">{format(new Date(t.updated_at), "dd/MM/yy HH:mm")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TicketReportPrint;
