import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface Part {
  name: string;
  qty: number;
  cost: number;
}

interface ServiceOrderPrintProps {
  order: any;
  form: {
    status: string;
    diagnosis: string;
    solution: string;
    labor_cost: number;
    travel_cost: number;
    notes: string;
    technician_id: string;
    parts_used: Part[];
    service_description: string;
    equipment_removed: string;
    material_used: string;
    checked_by: string;
    technician_signature: string;
    arrival_date: string;
    departure_date: string;
  };
  partsCost: number;
  totalCost: number;
  onClose: () => void;
}

const fmt = (d: string | null | undefined) => {
  if (!d) return "-";
  try { return format(new Date(d), "dd/MM/yyyy", { locale: ptBR }); } catch { return "-"; }
};
const fmtTime = (d: string | null | undefined) => {
  if (!d) return "-";
  try { return format(new Date(d), "HH:mm", { locale: ptBR }); } catch { return "-"; }
};
const fmtDateTime = (d: string | null | undefined) => {
  if (!d) return "-";
  try { return format(new Date(d), "dd/MM/yyyy HH:mm", { locale: ptBR }); } catch { return "-"; }
};

const ServiceOrderPrint = ({ order, form, partsCost, totalCost, onClose }: ServiceOrderPrintProps) => {
  const [company, setCompany] = useState<Record<string, string>>({});
  const [ticket, setTicket] = useState<any>(null);
  const [messages, setMessages] = useState<any[]>([]);

  useEffect(() => {
    // Fetch company settings
    supabase.from("system_settings").select("key, value")
      .in("key", ["company_name", "company_address", "company_phone", "company_cnpj", "company_email"])
      .then(({ data }) => {
        const map: Record<string, string> = {};
        data?.forEach(s => { if (s.value) map[s.key] = s.value; });
        setCompany(map);
      });

    // Fetch ticket + messages if linked
    if (order.ticket_id) {
      supabase.from("tickets")
        .select("*, equipment_type:equipment_types(name)")
        .eq("id", order.ticket_id).single()
        .then(({ data }) => setTicket(data));

      supabase.from("ticket_messages")
        .select("*, sender:profiles!ticket_messages_sender_id_fkey(full_name)")
        .eq("ticket_id", order.ticket_id)
        .order("created_at", { ascending: true })
        .then(({ data }) => setMessages(data || []));
    }

    const handleAfterPrint = () => onClose();
    window.addEventListener("afterprint", handleAfterPrint);
    return () => window.removeEventListener("afterprint", handleAfterPrint);
  }, []);

  const client = order.client || {};

  return (
    <div className="print-container bg-white text-black min-h-screen">
      {/* Close button - hidden on print */}
      <div className="print:hidden fixed top-4 right-4 z-50 flex gap-2">
        <button onClick={() => window.print()} className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">Imprimir</button>
        <button onClick={onClose} className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700">Voltar</button>
      </div>

      {/* PAGE 1 */}
      <div className="print-page p-8 max-w-[210mm] mx-auto">
        {/* Header */}
        <div className="border-2 border-black">
          <div className="flex items-center border-b-2 border-black p-3 gap-3">
            <img src="/lovable-uploads/6a5524af-fc9f-4a85-85ec-2236896048a6.png" alt="Logo" className="h-12 w-auto object-contain" />
            <div className="flex-1">
              <h1 className="text-lg font-bold">{company.company_name || "Empresa"}</h1>
              <p className="text-xs">{company.company_address || ""}</p>
              <p className="text-xs">{company.company_phone || ""} {company.company_email ? `| ${company.company_email}` : ""}</p>
              {company.company_cnpj && <p className="text-xs">CNPJ: {company.company_cnpj}</p>}
            </div>
            <div className="text-right">
              <h2 className="text-base font-bold">Ordem de Serviço</h2>
              <p className="text-sm font-bold">ID: #{order.order_number}</p>
            </div>
          </div>

          {/* Client Info */}
          <div className="border-b-2 border-black">
            <div className="bg-gray-200 px-3 py-1 font-bold text-sm border-b border-black">Dados do Cliente</div>
            <div className="grid grid-cols-2 text-xs">
              <div className="border-r border-b border-black px-2 py-1"><span className="font-bold">Nome:</span> {client.full_name || "-"}</div>
              <div className="border-b border-black px-2 py-1"><span className="font-bold">Contato:</span> {client.email || "-"}</div>
              <div className="border-r border-b border-black px-2 py-1"><span className="font-bold">Endereço:</span> {client.address || "-"}</div>
              <div className="border-b border-black px-2 py-1"><span className="font-bold">Nº:</span> {client.address_number || "-"}</div>
              <div className="border-r border-b border-black px-2 py-1"><span className="font-bold">Complemento:</span> {client.address_complement || "-"}</div>
              <div className="border-b border-black px-2 py-1"><span className="font-bold">Bairro:</span> {client.neighborhood || "-"}</div>
              <div className="border-r border-black px-2 py-1"><span className="font-bold">Cidade:</span> {client.city || "-"}</div>
              <div className="px-2 py-1"><span className="font-bold">Telefone:</span> {client.phone || "-"}</div>
            </div>
          </div>

          {/* Ticket Info */}
          {ticket && (
            <div className="border-b-2 border-black">
              <div className="bg-gray-200 px-3 py-1 font-bold text-sm border-b border-black">Informações do Chamado</div>
              <div className="text-xs">
                <div className="grid grid-cols-2">
                  <div className="border-r border-b border-black px-2 py-1"><span className="font-bold">Categoria:</span> {ticket.equipment_type?.name || "-"}</div>
                  <div className="border-b border-black px-2 py-1"><span className="font-bold">Chamado Nº:</span> {ticket.ticket_number}</div>
                </div>
                <div className="border-b border-black px-2 py-1"><span className="font-bold">Assunto:</span> {ticket.title}</div>
                <div className="px-2 py-1"><span className="font-bold">Descrição:</span> {ticket.description}</div>
              </div>
            </div>
          )}

          {/* Messages / Tracking */}
          {messages.length > 0 && (
            <div>
              <div className="bg-gray-200 px-3 py-1 font-bold text-sm border-b border-black">Acompanhamentos</div>
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-black bg-gray-100">
                    <th className="border-r border-black px-2 py-1 text-left w-20">Data</th>
                    <th className="border-r border-black px-2 py-1 text-left w-14">Hora</th>
                    <th className="border-r border-black px-2 py-1 text-left w-32">Responsável</th>
                    <th className="px-2 py-1 text-left">Descrição</th>
                  </tr>
                </thead>
                <tbody>
                  {messages.map((msg) => (
                    <tr key={msg.id} className="border-b border-black">
                      <td className="border-r border-black px-2 py-1">{fmt(msg.created_at)}</td>
                      <td className="border-r border-black px-2 py-1">{fmtTime(msg.created_at)}</td>
                      <td className="border-r border-black px-2 py-1">{msg.sender?.full_name || "-"}</td>
                      <td className="px-2 py-1">{msg.message}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* PAGE 2 */}
      <div className="print-page p-8 max-w-[210mm] mx-auto print-page-break">
        <div className="border-2 border-black">
          {/* Header repeated */}
          <div className="flex items-center border-b-2 border-black p-3 gap-3">
            <img src="/lovable-uploads/6a5524af-fc9f-4a85-85ec-2236896048a6.png" alt="Logo" className="h-10 w-auto object-contain" />
            <div className="flex-1">
              <h1 className="text-lg font-bold">{company.company_name || "Empresa"}</h1>
            </div>
            <div className="text-right">
              <h2 className="text-base font-bold">OS #{order.order_number} - Resumo</h2>
            </div>
          </div>

          {/* Service Description */}
          <div className="border-b-2 border-black">
            <div className="bg-gray-200 px-3 py-1 font-bold text-sm border-b border-black">Descrição do Serviço Realizado</div>
            <div className="px-3 py-2 text-xs min-h-[60px]">{form.service_description || "-"}</div>
          </div>

          {/* Equipment Removed */}
          <div className="border-b-2 border-black">
            <div className="bg-gray-200 px-3 py-1 font-bold text-sm border-b border-black">Equipamento Retirado</div>
            <div className="px-3 py-2 text-xs min-h-[40px]">{form.equipment_removed || "-"}</div>
          </div>

          {/* Material Used */}
          <div className="border-b-2 border-black">
            <div className="bg-gray-200 px-3 py-1 font-bold text-sm border-b border-black">Material Utilizado</div>
            <div className="px-3 py-2 text-xs min-h-[40px]">{form.material_used || "-"}</div>
          </div>

          {/* Info Grid */}
          <div className="border-b-2 border-black grid grid-cols-2 text-xs">
            <div className="border-r border-b border-black px-2 py-1"><span className="font-bold">Técnico:</span> {order.technician?.full_name || form.technician_signature || "-"}</div>
            <div className="border-b border-black px-2 py-1"><span className="font-bold">Conferido por:</span> {form.checked_by || "-"}</div>
            <div className="border-r border-b border-black px-2 py-1"><span className="font-bold">Data Chegada:</span> {fmtDateTime(form.arrival_date || null)}</div>
            <div className="border-b border-black px-2 py-1"><span className="font-bold">Data Saída:</span> {fmtDateTime(form.departure_date || null)}</div>
            <div className="border-r border-black px-2 py-1"><span className="font-bold">Data Criação:</span> {fmtDateTime(order.created_at)}</div>
            <div className="px-2 py-1"><span className="font-bold">Última Atualização:</span> {fmtDateTime(order.updated_at)}</div>
          </div>

          {/* Costs */}
          <div className="border-b-2 border-black">
            <div className="bg-gray-200 px-3 py-1 font-bold text-sm border-b border-black">Custos</div>
            <div className="grid grid-cols-4 text-xs">
              <div className="border-r border-black px-2 py-2 text-center">
                <p className="font-bold">Peças</p>
                <p>R$ {partsCost.toFixed(2)}</p>
              </div>
              <div className="border-r border-black px-2 py-2 text-center">
                <p className="font-bold">Mão de Obra</p>
                <p>R$ {form.labor_cost.toFixed(2)}</p>
              </div>
              <div className="border-r border-black px-2 py-2 text-center">
                <p className="font-bold">Deslocamento</p>
                <p>R$ {form.travel_cost.toFixed(2)}</p>
              </div>
              <div className="px-2 py-2 text-center">
                <p className="font-bold">Valor Total</p>
                <p className="font-bold text-sm">R$ {totalCost.toFixed(2)}</p>
              </div>
            </div>
          </div>

          {/* Parts list if any */}
          {form.parts_used.length > 0 && (
            <div className="border-b-2 border-black">
              <div className="bg-gray-200 px-3 py-1 font-bold text-sm border-b border-black">Peças Utilizadas</div>
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-black bg-gray-100">
                    <th className="border-r border-black px-2 py-1 text-left">Peça</th>
                    <th className="border-r border-black px-2 py-1 text-center w-16">Qtd</th>
                    <th className="border-r border-black px-2 py-1 text-right w-24">Custo Unit.</th>
                    <th className="px-2 py-1 text-right w-24">Subtotal</th>
                  </tr>
                </thead>
                <tbody>
                  {form.parts_used.map((p, i) => (
                    <tr key={i} className="border-b border-black">
                      <td className="border-r border-black px-2 py-1">{p.name}</td>
                      <td className="border-r border-black px-2 py-1 text-center">{p.qty}</td>
                      <td className="border-r border-black px-2 py-1 text-right">R$ {p.cost.toFixed(2)}</td>
                      <td className="px-2 py-1 text-right">R$ {(p.qty * p.cost).toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Signatures */}
          <div className="grid grid-cols-2 text-xs">
            <div className="border-r border-black px-4 py-6 text-center">
              <div className="border-t border-black mt-12 pt-2 mx-8">
                <p className="font-bold">Assinatura do Técnico</p>
                <p>{form.technician_signature || order.technician?.full_name || ""}</p>
              </div>
            </div>
            <div className="px-4 py-6 text-center">
              <div className="border-t border-black mt-12 pt-2 mx-8">
                <p className="font-bold">Assinatura do Cliente</p>
                <p>{client.full_name || ""}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ServiceOrderPrint;
