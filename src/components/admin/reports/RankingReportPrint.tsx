import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface RankingItem {
  name: string;
  count: number;
}

interface Filters {
  clientName: string;
  startDate?: Date;
  endDate?: Date;
}

interface RankingReportPrintProps {
  title: string;
  columnLabel: string;
  ranking: RankingItem[];
  filters: Filters;
  onClose: () => void;
}

const RankingReportPrint = ({ title, columnLabel, ranking, filters, onClose }: RankingReportPrintProps) => {
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
  if (filters.startDate) activeFilters.push(`De: ${format(filters.startDate, "dd/MM/yyyy")}`);
  if (filters.endDate) activeFilters.push(`Até: ${format(filters.endDate, "dd/MM/yyyy")}`);

  const total = ranking.reduce((s, r) => s + r.count, 0);

  return (
    <>
      <style>{`@media print { @page { size: landscape; margin: 8mm; } }`}</style>
      <div className="fixed inset-0 z-[9999] bg-white text-black overflow-auto print:static">
      <div className="print:hidden fixed top-4 right-4 z-50 flex gap-2">
        <button onClick={() => window.print()} className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">Imprimir</button>
        <button onClick={onClose} className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700">Voltar</button>
      </div>

      <div className="p-8 mx-auto">
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
              <h2 className="text-base font-bold">{title}</h2>
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

          {/* Summary */}
          <div className="border-b-2 border-black">
            <div className="bg-gray-200 px-3 py-1 font-bold text-sm border-b border-black">Resumo</div>
            <div className="grid grid-cols-2 text-xs">
              <div className="border-r border-black px-3 py-2 text-center">
                <div className="font-bold text-sm">{ranking.length}</div>
                <div>Itens no Ranking</div>
              </div>
              <div className="px-3 py-2 text-center">
                <div className="font-bold text-sm">{total}</div>
                <div>Total de Chamados</div>
              </div>
            </div>
          </div>

          {/* Table */}
          <div>
            <div className="bg-gray-200 px-3 py-1 font-bold text-sm border-b border-black">
              Ranking ({ranking.length} {ranking.length === 1 ? "item" : "itens"})
            </div>
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-black bg-gray-100">
                  <th className="border-r border-black px-2 py-1 text-left w-12">#</th>
                  <th className="border-r border-black px-2 py-1 text-left">{columnLabel}</th>
                  <th className="border-r border-black px-2 py-1 text-right w-20">Chamados</th>
                  <th className="px-2 py-1 text-right w-16">%</th>
                </tr>
              </thead>
              <tbody>
                {ranking.map((r, i) => (
                  <tr key={i} className="border-b border-black">
                    <td className="border-r border-black px-2 py-1 font-mono">{i + 1}</td>
                    <td className="border-r border-black px-2 py-1">{r.name}</td>
                    <td className="border-r border-black px-2 py-1 text-right font-bold">{r.count}</td>
                    <td className="px-2 py-1 text-right">{total > 0 ? ((r.count / total) * 100).toFixed(1) : 0}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
    </>
  );
};

export default RankingReportPrint;
