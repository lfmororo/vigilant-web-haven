import jsPDF from "jspdf";
import { supabase } from "@/integrations/supabase/client";

interface TicketPdfData {
  ticket: any;
  messages: any[];
  company: Record<string, string>;
  creator?: any;
}

const statusLabels: Record<string, string> = {
  open: "Aberto", in_progress: "Em Andamento", waiting_client: "Aguardando Cliente",
  resolved: "Resolvido", closed: "Fechado",
};
const priorityLabels: Record<string, string> = { low: "Baixa", medium: "Média", high: "Alta", urgent: "Urgente" };

function fmtDT(d: string | null) {
  if (!d) return "-";
  try { return new Date(d).toLocaleString("pt-BR"); } catch { return "-"; }
}

async function loadImageAsDataUrl(url: string): Promise<string | null> {
  try {
    const resp = await fetch(url);
    const blob = await resp.blob();
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch { return null; }
}

export async function generateTicketPdf(ticketId: string): Promise<{ blob: Blob; fileName: string } | null> {
  // Fetch all data
  const [ticketRes, settingsRes] = await Promise.all([
    supabase.from("tickets")
      .select("*, client:clients!tickets_client_id_fkey(full_name, email, phone, address, address_number, neighborhood, city), assigned:profiles!tickets_assigned_to_fkey(full_name, email), equipment_type:equipment_types(name)")
      .eq("id", ticketId).maybeSingle(),
    supabase.from("system_settings").select("key, value")
      .in("key", ["company_name", "company_address", "company_phone", "company_cnpj", "company_email"]),
  ]);

  const ticket = ticketRes.data;
  if (!ticket) return null;

  const company: Record<string, string> = {};
  settingsRes.data?.forEach((s: any) => { if (s.value) company[s.key] = s.value; });

  let creator = null;
  if (ticket.created_by) {
    const { data } = await supabase.from("profiles").select("full_name, email").eq("id", ticket.created_by).maybeSingle();
    creator = data;
  }

  const { data: msgs } = await supabase.from("ticket_messages")
    .select("*, sender:profiles!ticket_messages_sender_id_fkey(full_name)")
    .eq("ticket_id", ticketId).eq("is_internal", false)
    .order("created_at", { ascending: true });

  // Load logo
  const logoDataUrl = await loadImageAsDataUrl("/lovable-uploads/6a5524af-fc9f-4a85-85ec-2236896048a6.png");

  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const margin = 15;
  const contentW = pageW - margin * 2;
  let y = margin;

  const addLine = (yPos: number) => { doc.setDrawColor(0); doc.line(margin, yPos, pageW - margin, yPos); };
  const checkPage = (needed: number) => { if (y + needed > 270) { doc.addPage(); y = margin; } };

  // --- HEADER ---
  const headerY = y;
  if (logoDataUrl) {
    try { doc.addImage(logoDataUrl, "PNG", margin, y, 25, 12); } catch { /* ignore */ }
  }
  doc.setFontSize(14); doc.setFont("helvetica", "bold");
  doc.text(company.company_name || "Empresa", margin + 28, y + 5);
  doc.setFontSize(8); doc.setFont("helvetica", "normal");
  if (company.company_address) { doc.text(company.company_address, margin + 28, y + 9); }
  const contactLine = [company.company_phone, company.company_email].filter(Boolean).join(" | ");
  if (contactLine) doc.text(contactLine, margin + 28, y + 13);
  if (company.company_cnpj) doc.text(`CNPJ: ${company.company_cnpj}`, margin + 28, y + 17);

  // Right side
  doc.setFontSize(12); doc.setFont("helvetica", "bold");
  doc.text("Chamado de Suporte", pageW - margin, y + 5, { align: "right" });
  doc.setFontSize(10);
  doc.text(`#${ticket.ticket_number}`, pageW - margin, y + 10, { align: "right" });
  doc.setFontSize(7); doc.setFont("helvetica", "normal");
  doc.text(`Emitido em: ${fmtDT(new Date().toISOString())}`, pageW - margin, y + 14, { align: "right" });

  y = headerY + 22;
  addLine(y); y += 2;

  // --- STATUS BAR ---
  const statusItems = [
    { label: "Status", value: statusLabels[ticket.status] || ticket.status },
    { label: "Prioridade", value: priorityLabels[ticket.priority] || ticket.priority },
    { label: "Abertura", value: fmtDT(ticket.created_at) },
    { label: "Atualização", value: fmtDT(ticket.updated_at) },
  ];
  const colW = contentW / 4;
  doc.setFontSize(6); doc.setFont("helvetica", "bold");
  statusItems.forEach((item, i) => {
    const x = margin + i * colW + colW / 2;
    doc.setTextColor(100); doc.text(item.label.toUpperCase(), x, y + 3, { align: "center" });
    doc.setTextColor(0); doc.setFontSize(9);
    doc.text(item.value, x, y + 7, { align: "center" });
    doc.setFontSize(6);
  });
  y += 10; addLine(y); y += 3;

  // --- SECTION HELPER ---
  const sectionHeader = (title: string) => {
    checkPage(12);
    doc.setFillColor(230, 230, 230);
    doc.rect(margin, y, contentW, 6, "F");
    doc.setFontSize(9); doc.setFont("helvetica", "bold"); doc.setTextColor(0);
    doc.text(title, margin + 2, y + 4);
    y += 8;
  };

  const fieldRow = (label: string, value: string, halfWidth = false, xOffset = 0) => {
    checkPage(6);
    doc.setFontSize(8); doc.setFont("helvetica", "bold");
    doc.text(label, margin + 2 + xOffset, y);
    doc.setFont("helvetica", "normal");
    doc.text(value || "-", margin + 2 + xOffset + doc.getTextWidth(label) + 2, y);
    y += halfWidth ? 0 : 5;
  };

  // --- CLIENT ---
  sectionHeader("Dados do Cliente");
  const client: any = ticket.client || {};
  fieldRow("Nome: ", client.full_name || "-");
  fieldRow("E-mail: ", client.email || "-");
  fieldRow("Telefone: ", client.phone || "-");
  const addr = [client.address, client.address_number, client.neighborhood, client.city].filter(Boolean).join(", ");
  fieldRow("Endereço: ", addr || "-");
  y += 2; addLine(y); y += 3;

  // --- REQUESTER / TECHNICIAN ---
  sectionHeader("Responsáveis");
  fieldRow("Solicitante: ", creator ? `${creator.full_name} (${creator.email})` : "-");
  fieldRow("Técnico: ", ticket.assigned ? `${ticket.assigned.full_name} (${ticket.assigned.email})` : "Não atribuído");
  y += 2; addLine(y); y += 3;

  // --- TICKET DETAILS ---
  sectionHeader("Detalhes do Chamado");
  fieldRow("Título: ", ticket.title);
  if (ticket.equipment_type?.name) fieldRow("Tipo de Equipamento: ", ticket.equipment_type.name);
  if (ticket.equipment_info) fieldRow("Info Equipamento: ", ticket.equipment_info);

  doc.setFontSize(8); doc.setFont("helvetica", "bold");
  doc.text("Descrição:", margin + 2, y); y += 4;
  doc.setFont("helvetica", "normal");
  const descLines = doc.splitTextToSize(ticket.description || "-", contentW - 4);
  descLines.forEach((line: string) => { checkPage(5); doc.text(line, margin + 2, y); y += 4; });
  y += 2; addLine(y); y += 3;

  // --- MESSAGES ---
  const messages = msgs || [];
  if (messages.length > 0) {
    sectionHeader(`Histórico de Atendimento (${messages.length} mensagens)`);
    doc.setFontSize(7);
    messages.forEach((msg: any) => {
      checkPage(12);
      doc.setFont("helvetica", "bold");
      doc.text(`${fmtDT(msg.created_at)} — ${msg.sender?.full_name || "-"}`, margin + 2, y);
      y += 3.5;
      doc.setFont("helvetica", "normal");
      const msgLines = doc.splitTextToSize(msg.message || "", contentW - 4);
      msgLines.forEach((line: string) => { checkPage(4); doc.text(line, margin + 2, y); y += 3.5; });
      y += 2;
    });
    addLine(y); y += 3;
  }

  // --- SIGNATURES ---
  sectionHeader("Assinaturas");
  const sigW = contentW / 2 - 5;

  checkPage(35);
  // Technician signature
  if (ticket.technician_signature) {
    try { doc.addImage(ticket.technician_signature, "PNG", margin + 5, y, 40, 18); } catch { /* ignore */ }
  }
  doc.line(margin + 2, y + 22, margin + sigW - 2, y + 22);
  doc.setFontSize(8); doc.setFont("helvetica", "bold");
  doc.text("Técnico", margin + sigW / 2, y + 26, { align: "center" });
  doc.setFont("helvetica", "normal"); doc.setFontSize(7);
  doc.text(ticket.assigned?.full_name || "", margin + sigW / 2, y + 30, { align: "center" });

  // Client signature
  const sigX2 = margin + sigW + 10;
  if (ticket.client_signature) {
    try { doc.addImage(ticket.client_signature, "PNG", sigX2 + 5, y, 40, 18); } catch { /* ignore */ }
  }
  doc.line(sigX2, y + 22, sigX2 + sigW - 2, y + 22);
  doc.setFontSize(8); doc.setFont("helvetica", "bold");
  doc.text("Cliente", sigX2 + sigW / 2, y + 26, { align: "center" });
  doc.setFont("helvetica", "normal"); doc.setFontSize(7);
  doc.text(client.full_name || "", sigX2 + sigW / 2, y + 30, { align: "center" });

  y += 35;

  // Footer
  doc.setFontSize(6); doc.setTextColor(150);
  doc.text(`Documento gerado automaticamente por ${company.company_name || "Sistema"} em ${fmtDT(new Date().toISOString())}`, pageW / 2, 285, { align: "center" });

  const blob = doc.output("blob");
  const fileName = `chamado-${ticket.ticket_number}.pdf`;
  return { blob, fileName };
}

export async function generateAndUploadTicketPdf(ticketId: string): Promise<string | null> {
  const result = await generateTicketPdf(ticketId);
  if (!result) return null;

  const path = `ticket-${ticketId}-${Date.now()}.pdf`;
  const { error } = await supabase.storage.from("ticket-pdfs").upload(path, result.blob, {
    contentType: "application/pdf",
    upsert: true,
  });

  if (error) {
    console.error("PDF upload error:", error);
    return null;
  }

  const { data: urlData } = supabase.storage.from("ticket-pdfs").getPublicUrl(path);
  return urlData.publicUrl;
}
