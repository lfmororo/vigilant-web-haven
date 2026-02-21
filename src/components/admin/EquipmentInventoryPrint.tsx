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
  asset_tag: string | null;
  logged_in_user: string | null;
  location: string | null;
  status: string;
  cpu: string | null;
  ram_total_gb: number | null;
  disk_total_gb: number | null;
  disk_used_gb: number | null;
  disk_free_gb: number | null;
  hardware_updated_at: string | null;
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
    <>
      <style>{`@media print { @page { size: landscape; margin: 8mm; } .print-container { font-size: 10px; } }`}</style>
      <div className="print-container bg-white text-black min-h-screen">
      <div className="print:hidden fixed top-4 right-4 z-50 flex gap-2">
        <button onClick={() => window.print()} className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">Imprimir</button>
        <button onClick={onClose} className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700">Voltar</button>
      </div>

      <div className="print-page p-4 mx-auto">
        <div className="border-2 border-black">
          {/* Header */}
          <div className="flex items-center border-b-2 border-black p-3 gap-3">
            <img src="/lovable-uploads/6a5524af-fc9f-4a85-85ec-2236896048a6.png" alt="Logo" className="h-10 w-auto object-contain" />
            <div className="flex-1">
              <h1 className="text-sm font-bold">{company.company_name || "Empresa"}</h1>
              <p className="text-[10px]">{company.company_address || ""}</p>
              <p className="text-[10px]">{company.company_phone || ""} {company.company_email ? `| ${company.company_email}` : ""}</p>
              {company.company_cnpj && <p className="text-[10px]">CNPJ: {company.company_cnpj}</p>}
            </div>
            <div className="text-right">
              <h2 className="text-sm font-bold">Relatório de Inventário</h2>
              <p className="text-[10px]">Gerado em: {format(new Date(), "dd/MM/yyyy HH:mm", { locale: ptBR })}</p>
            </div>
          </div>

          {/* Filters applied */}
          {activeFilters.length > 0 && (
            <div className="border-b-2 border-black">
              <div className="bg-gray-200 px-3 py-1 font-bold text-[11px] border-b border-black">Filtros Aplicados</div>
              <div className="px-3 py-1 text-[10px]">{activeFilters.join(" | ")}</div>
            </div>
          )}

          {/* Equipment Table */}
          <div>
            <div className="bg-gray-200 px-3 py-1 font-bold text-[11px] border-b border-black">
              Equipamentos ({equipment.length} {equipment.length === 1 ? "item" : "itens"})
            </div>
            <table className="w-full text-[10px] table-fixed">
              <thead>
                <tr className="border-b border-black bg-gray-100">
                  <th className="border-r border-black px-1 py-1 text-left" style={{width:'18%'}}>Nome</th>
                  <th className="border-r border-black px-1 py-1 text-left" style={{width:'8%'}}>Tomb.</th>
                  <th className="border-r border-black px-1 py-1 text-left" style={{width:'12%'}}>Marca/Modelo</th>
                  <th className="border-r border-black px-1 py-1 text-left" style={{width:'10%'}}>Usuário</th>
                  <th className="border-r border-black px-1 py-1 text-left" style={{width:'12%'}}>Cliente</th>
                  <th className="border-r border-black px-1 py-1 text-left" style={{width:'16%'}}>CPU</th>
                  <th className="border-r border-black px-1 py-1 text-center" style={{width:'5%'}}>RAM</th>
                  <th className="border-r border-black px-1 py-1 text-center" style={{width:'8%'}}>Disco</th>
                  <th className="border-r border-black px-1 py-1 text-left" style={{width:'7%'}}>Atualiz.</th>
                  <th className="px-1 py-1 text-left" style={{width:'4%'}}>Status</th>
                </tr>
              </thead>
              <tbody>
                {equipment.map((item) => (
                  <tr key={item.id} className="border-b border-black">
                    <td className="border-r border-black px-1 py-1 truncate">{item.name}</td>
                    <td className="border-r border-black px-1 py-1 truncate">{item.asset_tag || "-"}</td>
                    <td className="border-r border-black px-1 py-1 truncate">{[item.brand, item.model].filter(Boolean).join(" ") || "-"}</td>
                    <td className="border-r border-black px-1 py-1 truncate">{item.logged_in_user || "-"}</td>
                    <td className="border-r border-black px-1 py-1 truncate">{item.client?.full_name || "-"}</td>
                    <td className="border-r border-black px-1 py-1 truncate">{item.cpu || "-"}</td>
                    <td className="border-r border-black px-1 py-1 text-center">{item.ram_total_gb ?? "-"}</td>
                    <td className="border-r border-black px-1 py-1 text-center">
                      {item.disk_used_gb != null && item.disk_total_gb != null ? `${item.disk_used_gb}/${item.disk_total_gb}` : "-"}
                    </td>
                    <td className="border-r border-black px-1 py-1 truncate">
                      {item.hardware_updated_at ? format(new Date(item.hardware_updated_at), "dd/MM/yy", { locale: ptBR }) : "-"}
                    </td>
                    <td className="px-1 py-1 truncate">{statusLabels[item.status] || item.status}</td>
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

export default EquipmentInventoryPrint;
