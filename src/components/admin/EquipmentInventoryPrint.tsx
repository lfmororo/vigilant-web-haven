import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface Equipment {
  id: string;
  name: string;
  brand: string | null;
  model: string | null;
  serial_number: string | null;
  location: string | null;
  status: string;
  client?: { full_name: string } | null;
  equipment_type?: { name: string } | null;
}

interface Filters {
  status: string;
  type: string;
  client: string;
}

interface EquipmentInventoryPrintProps {
  equipment: Equipment[];
  filters: Filters;
  onClose: () => void;
}

const statusLabels: Record<string, string> = {
  active: "Ativo",
  inactive: "Inativo",
  maintenance: "Em Manutenção",
  retired: "Aposentado",
};

const EquipmentInventoryPrint = ({ equipment, filters, onClose }: EquipmentInventoryPrintProps) => {
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
  if (filters.status !== "all") activeFilters.push(`Status: ${statusLabels[filters.status] || filters.status}`);
  if (filters.type !== "all") activeFilters.push(`Tipo: ${filters.type}`);
  if (filters.client !== "all") activeFilters.push(`Cliente: ${filters.client}`);

  return (
    <div className="print-container bg-white text-black min-h-screen">
      <div className="print:hidden fixed top-4 right-4 z-50 flex gap-2">
        <button onClick={() => window.print()} className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">Imprimir</button>
        <button onClick={onClose} className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700">Voltar</button>
      </div>

      <div className="print-page p-8 max-w-[210mm] mx-auto">
        <div className="border-2 border-black">
          {/* Header */}
          <div className="flex items-center border-b-2 border-black p-3">
            <div className="flex-1">
              <h1 className="text-lg font-bold">{company.company_name || "Empresa"}</h1>
              <p className="text-xs">{company.company_address || ""}</p>
              <p className="text-xs">{company.company_phone || ""} {company.company_email ? `| ${company.company_email}` : ""}</p>
              {company.company_cnpj && <p className="text-xs">CNPJ: {company.company_cnpj}</p>}
            </div>
            <div className="text-right">
              <h2 className="text-base font-bold">Relatório de Inventário</h2>
              <p className="text-xs">Gerado em: {format(new Date(), "dd/MM/yyyy HH:mm", { locale: ptBR })}</p>
            </div>
          </div>

          {/* Filters applied */}
          {activeFilters.length > 0 && (
            <div className="border-b-2 border-black">
              <div className="bg-gray-200 px-3 py-1 font-bold text-sm border-b border-black">Filtros Aplicados</div>
              <div className="px-3 py-2 text-xs">{activeFilters.join(" | ")}</div>
            </div>
          )}

          {/* Equipment Table */}
          <div>
            <div className="bg-gray-200 px-3 py-1 font-bold text-sm border-b border-black">
              Equipamentos ({equipment.length} {equipment.length === 1 ? "item" : "itens"})
            </div>
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-black bg-gray-100">
                  <th className="border-r border-black px-2 py-1 text-left">Nome</th>
                  <th className="border-r border-black px-2 py-1 text-left w-24">Tipo</th>
                  <th className="border-r border-black px-2 py-1 text-left w-28">Marca/Modelo</th>
                  <th className="border-r border-black px-2 py-1 text-left w-24">Série</th>
                  <th className="border-r border-black px-2 py-1 text-left w-28">Cliente</th>
                  <th className="border-r border-black px-2 py-1 text-left w-24">Localização</th>
                  <th className="px-2 py-1 text-left w-20">Status</th>
                </tr>
              </thead>
              <tbody>
                {equipment.map((item) => (
                  <tr key={item.id} className="border-b border-black">
                    <td className="border-r border-black px-2 py-1">{item.name}</td>
                    <td className="border-r border-black px-2 py-1">{item.equipment_type?.name || "-"}</td>
                    <td className="border-r border-black px-2 py-1">{[item.brand, item.model].filter(Boolean).join(" ") || "-"}</td>
                    <td className="border-r border-black px-2 py-1 font-mono">{item.serial_number || "-"}</td>
                    <td className="border-r border-black px-2 py-1">{item.client?.full_name || "-"}</td>
                    <td className="border-r border-black px-2 py-1">{item.location || "-"}</td>
                    <td className="px-2 py-1">{statusLabels[item.status] || item.status}</td>
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

export default EquipmentInventoryPrint;
