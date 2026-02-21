import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface TicketPrintProps {
  ticketId: string;
  onClose: () => void;
}

const statusLabels: Record<string, string> = {
  open: "Aberto", in_progress: "Em Andamento", waiting_client: "Aguardando Cliente",
  resolved: "Resolvido", closed: "Fechado",
};
const priorityLabels: Record<string, string> = { low: "Baixa", medium: "Média", high: "Alta", urgent: "Urgente" };

const fmtDT = (d: string | null | undefined) => {
  if (!d) return "-";
  try { return format(new Date(d), "dd/MM/yyyy HH:mm", { locale: ptBR }); } catch { return "-"; }
};
const fmtDate = (d: string | null | undefined) => {
  if (!d) return "-";
  try { return format(new Date(d), "dd/MM/yyyy", { locale: ptBR }); } catch { return "-"; }
};
const fmtTime = (d: string | null | undefined) => {
  if (!d) return "-";
  try { return format(new Date(d), "HH:mm", { locale: ptBR }); } catch { return "-"; }
};

const TicketPrint = ({ ticketId, onClose }: TicketPrintProps) => {
  const [company, setCompany] = useState<Record<string, string>>({});
  const [ticket, setTicket] = useState<any>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [creator, setCreator] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      // Company settings
      const { data: settings } = await supabase.from("system_settings").select("key, value")
        .in("key", ["company_name", "company_address", "company_phone", "company_cnpj", "company_email"]);
      const map: Record<string, string> = {};
      settings?.forEach(s => { if (s.value) map[s.key] = s.value; });
      setCompany(map);

      // Ticket with joins
      const { data: t } = await supabase.from("tickets")
        .select("*, client:clients!tickets_client_id_fkey(full_name, email, phone, address, address_number, address_complement, neighborhood, city), assigned:profiles!tickets_assigned_to_fkey(full_name, email), equipment_type:equipment_types(name)")
        .eq("id", ticketId).maybeSingle();
      setTicket(t);

      if (t?.created_by) {
        const { data: c } = await supabase.from("profiles").select("full_name, email").eq("id", t.created_by).maybeSingle();
        setCreator(c);
      }

      // Messages
      const { data: msgs } = await supabase.from("ticket_messages")
        .select("*, sender:profiles!ticket_messages_sender_id_fkey(full_name)")
        .eq("ticket_id", ticketId)
        .eq("is_internal", false)
        .order("created_at", { ascending: true });
      setMessages(msgs || []);

      setLoading(false);
    };
    load();

    const handleAfterPrint = () => onClose();
    window.addEventListener("afterprint", handleAfterPrint);
    return () => window.removeEventListener("afterprint", handleAfterPrint);
  }, [ticketId]);

  if (loading || !ticket) {
    return (
      <div className="fixed inset-0 z-[9999] bg-white flex items-center justify-center">
        <p className="text-black">Carregando...</p>
      </div>
    );
  }

  const client = ticket.client || {};

  return (
    <div className="fixed inset-0 z-[9999] bg-white text-black overflow-auto print:static">
      {/* Action buttons */}
      <div className="print:hidden fixed top-4 right-4 z-50 flex gap-2">
        <button onClick={() => window.print()} className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm font-medium">Imprimir / Salvar PDF</button>
        <button onClick={onClose} className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700 text-sm font-medium">Voltar</button>
      </div>

      {/* PAGE 1 */}
      <div className="p-8 max-w-[210mm] mx-auto">
        <div className="border-2 border-black">
          {/* Header */}
          <div className="flex items-center border-b-2 border-black p-4 gap-4">
            <img src="/lovable-uploads/6a5524af-fc9f-4a85-85ec-2236896048a6.png" alt="Logo" className="h-14 w-auto object-contain" />
            <div className="flex-1">
              <h1 className="text-xl font-bold tracking-tight">{company.company_name || "Empresa"}</h1>
              {company.company_address && <p className="text-xs mt-0.5">{company.company_address}</p>}
              <p className="text-xs">
                {company.company_phone || ""}
                {company.company_email ? ` | ${company.company_email}` : ""}
              </p>
              {company.company_cnpj && <p className="text-xs">CNPJ: {company.company_cnpj}</p>}
            </div>
            <div className="text-right">
              <h2 className="text-lg font-bold">Chamado de Suporte</h2>
              <p className="text-sm font-bold font-mono">#{ticket.ticket_number}</p>
              <p className="text-xs text-gray-500 mt-1">Emitido em: {fmtDT(new Date().toISOString())}</p>
            </div>
          </div>

          {/* Status Bar */}
          <div className="border-b-2 border-black grid grid-cols-4 text-xs">
            <div className="border-r border-black px-3 py-2 text-center">
              <p className="font-bold text-[10px] uppercase text-gray-500">Status</p>
              <p className="font-bold text-sm">{statusLabels[ticket.status] || ticket.status}</p>
            </div>
            <div className="border-r border-black px-3 py-2 text-center">
              <p className="font-bold text-[10px] uppercase text-gray-500">Prioridade</p>
              <p className="font-bold text-sm">{priorityLabels[ticket.priority] || ticket.priority}</p>
            </div>
            <div className="border-r border-black px-3 py-2 text-center">
              <p className="font-bold text-[10px] uppercase text-gray-500">Abertura</p>
              <p className="font-bold text-sm">{fmtDate(ticket.created_at)}</p>
            </div>
            <div className="px-3 py-2 text-center">
              <p className="font-bold text-[10px] uppercase text-gray-500">Atualização</p>
              <p className="font-bold text-sm">{fmtDate(ticket.updated_at)}</p>
            </div>
          </div>

          {/* Client Info */}
          <div className="border-b-2 border-black">
            <div className="bg-gray-200 px-3 py-1.5 font-bold text-sm border-b border-black">Dados do Cliente</div>
            <div className="grid grid-cols-2 text-xs">
              <div className="border-r border-b border-black px-2 py-1.5"><span className="font-bold">Nome:</span> {client.full_name || "-"}</div>
              <div className="border-b border-black px-2 py-1.5"><span className="font-bold">E-mail:</span> {client.email || "-"}</div>
              <div className="border-r border-b border-black px-2 py-1.5"><span className="font-bold">Telefone:</span> {client.phone || "-"}</div>
              <div className="border-b border-black px-2 py-1.5">
                <span className="font-bold">Endereço:</span> {client.address || "-"}
                {client.address_number ? `, ${client.address_number}` : ""}
                {client.address_complement ? ` - ${client.address_complement}` : ""}
              </div>
              <div className="border-r border-black px-2 py-1.5"><span className="font-bold">Bairro:</span> {client.neighborhood || "-"}</div>
              <div className="px-2 py-1.5"><span className="font-bold">Cidade:</span> {client.city || "-"}</div>
            </div>
          </div>

          {/* Requester + Technician */}
          <div className="border-b-2 border-black grid grid-cols-2 text-xs">
            <div className="border-r border-black px-3 py-2">
              <p className="font-bold text-[10px] uppercase text-gray-500 mb-0.5">Solicitante</p>
              <p>{creator?.full_name || "-"}{creator?.email ? ` (${creator.email})` : ""}</p>
            </div>
            <div className="px-3 py-2">
              <p className="font-bold text-[10px] uppercase text-gray-500 mb-0.5">Técnico Responsável</p>
              <p>{ticket.assigned?.full_name || "Não atribuído"}{ticket.assigned?.email ? ` (${ticket.assigned.email})` : ""}</p>
            </div>
          </div>

          {/* Ticket Details */}
          <div className="border-b-2 border-black">
            <div className="bg-gray-200 px-3 py-1.5 font-bold text-sm border-b border-black">Detalhes do Chamado</div>
            <div className="text-xs">
              <div className="border-b border-black px-3 py-2">
                <span className="font-bold">Título:</span> {ticket.title}
              </div>
              {ticket.equipment_type?.name && (
                <div className="border-b border-black px-3 py-1.5">
                  <span className="font-bold">Tipo de Equipamento:</span> {ticket.equipment_type.name}
                </div>
              )}
              {ticket.equipment_info && (
                <div className="border-b border-black px-3 py-1.5">
                  <span className="font-bold">Informações do Equipamento:</span> {ticket.equipment_info}
                </div>
              )}
              <div className="px-3 py-2">
                <p className="font-bold mb-1">Descrição:</p>
                <p className="whitespace-pre-wrap leading-relaxed">{ticket.description}</p>
              </div>
            </div>
          </div>

          {/* Messages */}
          {messages.length > 0 && (
            <div className="border-b-2 border-black">
              <div className="bg-gray-200 px-3 py-1.5 font-bold text-sm border-b border-black">
                Histórico de Atendimento ({messages.length} {messages.length === 1 ? "mensagem" : "mensagens"})
              </div>
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-black bg-gray-100">
                    <th className="border-r border-black px-2 py-1 text-left w-20">Data</th>
                    <th className="border-r border-black px-2 py-1 text-left w-14">Hora</th>
                    <th className="border-r border-black px-2 py-1 text-left w-32">Responsável</th>
                    <th className="px-2 py-1 text-left">Mensagem</th>
                  </tr>
                </thead>
                <tbody>
                  {messages.map((msg) => (
                    <tr key={msg.id} className="border-b border-black">
                      <td className="border-r border-black px-2 py-1 align-top">{fmtDate(msg.created_at)}</td>
                      <td className="border-r border-black px-2 py-1 align-top">{fmtTime(msg.created_at)}</td>
                      <td className="border-r border-black px-2 py-1 align-top">{msg.sender?.full_name || "-"}</td>
                      <td className="px-2 py-1 whitespace-pre-wrap">{msg.message}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Signatures */}
          <div>
            <div className="bg-gray-200 px-3 py-1.5 font-bold text-sm border-b border-black">Assinaturas</div>
            <div className="grid grid-cols-2 text-xs">
              <div className="border-r border-black px-4 py-4 text-center">
                {ticket.technician_signature ? (
                  <div>
                    <img src={ticket.technician_signature} alt="Assinatura do Técnico" className="max-h-16 mx-auto mb-2" />
                    <div className="border-t border-black pt-1 mx-6">
                      <p className="font-bold">Técnico</p>
                      <p>{ticket.assigned?.full_name || ""}</p>
                    </div>
                  </div>
                ) : (
                  <div>
                    <div className="h-16" />
                    <div className="border-t border-black pt-1 mx-6">
                      <p className="font-bold">Assinatura do Técnico</p>
                      <p className="text-gray-400 italic">Pendente</p>
                    </div>
                  </div>
                )}
              </div>
              <div className="px-4 py-4 text-center">
                {ticket.client_signature ? (
                  <div>
                    <img src={ticket.client_signature} alt="Assinatura do Cliente" className="max-h-16 mx-auto mb-2" />
                    <div className="border-t border-black pt-1 mx-6">
                      <p className="font-bold">Cliente</p>
                      <p>{client.full_name || ""}</p>
                    </div>
                  </div>
                ) : (
                  <div>
                    <div className="h-16" />
                    <div className="border-t border-black pt-1 mx-6">
                      <p className="font-bold">Assinatura do Cliente</p>
                      <p className="text-gray-400 italic">Pendente</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="text-center text-[10px] text-gray-400 mt-3">
          Documento gerado automaticamente pelo sistema {company.company_name || ""} em {fmtDT(new Date().toISOString())}
        </div>
      </div>
    </div>
  );
};

export default TicketPrint;
