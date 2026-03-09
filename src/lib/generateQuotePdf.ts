import jsPDF from "jspdf";

interface QuotePdfData {
  quoteNumber: number;
  title: string;
  notes: string | null;
  validityDays: number;
  createdAt: string;
  sender: {
    trade_name: string;
    logo_url: string | null;
    cnpj: string | null;
    address: string | null;
    email: string | null;
  } | null;
  client: {
    full_name: string;
    email: string | null;
    phone: string | null;
    address: string | null;
    city: string | null;
  } | null;
  items: {
    description: string;
    quantity: number;
    unit_price: number;
  }[];
}

const PAGE_W = 210;
const PAGE_H = 297;
const MARGIN_LEFT = 25;
const MARGIN_RIGHT = 25;
const CONTENT_W = PAGE_W - MARGIN_LEFT - MARGIN_RIGHT;
const DARK_BLUE = [0, 51, 102] as const;

async function loadImageAsBase64(url: string): Promise<string | null> {
  try {
    const res = await fetch(url);
    const blob = await res.blob();
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

function formatDatePtBr(dateStr: string): string {
  const months = [
    "janeiro", "fevereiro", "março", "abril", "maio", "junho",
    "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
  ];
  const d = new Date(dateStr);
  return `Fortaleza, ${d.getDate()} de ${months[d.getMonth()]} de ${d.getFullYear()}.`;
}

function formatProposalNumber(num: number, dateStr: string): string {
  const d = new Date(dateStr);
  const months = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
  return `Propos. ${String(num).padStart(4, "0")}/${months[d.getMonth()]}${d.getFullYear()}`;
}

function addFooter(doc: jsPDF, sender: QuotePdfData["sender"], proposalLabel: string) {
  const y = PAGE_H - 30;
  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...DARK_BLUE);
  doc.text(sender?.trade_name || "", PAGE_W / 2, y, { align: "center" });

  doc.setFont("helvetica", "normal");
  doc.setTextColor(100, 100, 100);
  doc.setFontSize(8);
  if (sender?.address) doc.text(sender.address, PAGE_W / 2, y + 4, { align: "center" });
  if (sender?.email) doc.text(sender.email, PAGE_W / 2, y + 8, { align: "center" });
  doc.text("Fortaleza CE – Brasil", PAGE_W / 2, y + 12, { align: "center" });

  // Proposal number bottom-right
  doc.setFontSize(8);
  doc.setTextColor(80, 80, 80);
  doc.text(proposalLabel, PAGE_W - MARGIN_RIGHT, PAGE_H - 12, { align: "right" });
}

function addLogo(doc: jsPDF, logoBase64: string | null) {
  if (logoBase64) {
    try {
      doc.addImage(logoBase64, "PNG", MARGIN_LEFT, 15, 70, 25);
    } catch {
      doc.setFontSize(24);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...DARK_BLUE);
      doc.text("FC.TECH", MARGIN_LEFT, 32);
    }
  } else {
    doc.setFontSize(24);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...DARK_BLUE);
    doc.text("FC.TECH", MARGIN_LEFT, 32);
  }
}

function addSectionTitle(doc: jsPDF, title: string, y: number): number {
  doc.setFontSize(13);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...DARK_BLUE);
  doc.text(title, MARGIN_LEFT, y);
  // Horizontal line
  doc.setDrawColor(...DARK_BLUE);
  doc.setLineWidth(0.8);
  doc.line(MARGIN_LEFT, y + 3, PAGE_W - MARGIN_RIGHT, y + 3);
  return y + 10;
}

export async function generateQuotePdf(data: QuotePdfData): Promise<jsPDF> {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const proposalLabel = formatProposalNumber(data.quoteNumber, data.createdAt);
  const dateLabel = formatDatePtBr(data.createdAt);

  let logoBase64: string | null = null;
  if (data.sender?.logo_url) {
    logoBase64 = await loadImageAsBase64(data.sender.logo_url);
  }

  // ============ PAGE 1: Cover Letter ============
  addLogo(doc, logoBase64);

  // Date + proposal number (right aligned)
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(60, 60, 60);
  doc.text(dateLabel, PAGE_W - MARGIN_RIGHT, 55, { align: "right" });
  doc.text(proposalLabel, PAGE_W - MARGIN_RIGHT, 60, { align: "right" });

  // Recipient
  let y = 80;
  doc.setFontSize(11);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(30, 30, 30);
  doc.text(`A ${data.client?.full_name || "Cliente"}`, MARGIN_LEFT + 10, y);

  y += 12;
  doc.text("Nesta,", MARGIN_LEFT, y);

  y += 12;
  doc.setFontSize(10);
  const introText = "Conforme contato comercial, estamos enviando nosso descritivo de serviço.";
  doc.text(introText, MARGIN_LEFT + 10, y, { maxWidth: CONTENT_W - 10 });

  y += 12;
  const bodyText = "Acreditamos, com isto, estarmos contribuindo para melhor funcionamento na área de Tecnologia de vossa empresa.";
  const bodyLines = doc.splitTextToSize(bodyText, CONTENT_W);
  doc.text(bodyLines, MARGIN_LEFT, y);
  y += bodyLines.length * 5;

  y += 6;
  const closingText = "Assim, ficamos a disposição para maiores esclarecimentos, visando o melhor entendimento de nossos serviços e proposta comercial. E ainda aguardamos seu retorno para darmos continuidade a este projeto.";
  const closingLines = doc.splitTextToSize(closingText, CONTENT_W);
  doc.text(closingLines, MARGIN_LEFT, y);
  y += closingLines.length * 5;

  y += 20;
  doc.text("Atenciosamente,", PAGE_W / 2, y, { align: "center" });

  y += 25;
  doc.setDrawColor(30, 30, 30);
  doc.setLineWidth(0.3);
  doc.line(PAGE_W / 2 - 35, y, PAGE_W / 2 + 35, y);
  y += 5;
  doc.setFontSize(9);
  doc.text("Gerencia de Projetos", PAGE_W / 2, y, { align: "center" });
  y += 4;
  doc.text(data.sender?.email || "", PAGE_W / 2, y, { align: "center" });

  addFooter(doc, data.sender, proposalLabel);

  // ============ PAGE 2: Company ============
  doc.addPage();
  addLogo(doc, logoBase64);

  y = addSectionTitle(doc, "A EMPRESA", 55);

  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(30, 30, 30);

  const companyDesc = `Com uma equipe composta por engenheiros e técnicos certificados e qualificados com cursos de fabricantes, a ${data.sender?.trade_name || "empresa"} desenvolve e executa hoje projetos de instalações elétricas, cabeamento estruturado, conectividade e segurança de dados, além de oferecer treinamentos especializados para parceiros e clientes.`;
  const companyLines = doc.splitTextToSize(companyDesc, CONTENT_W);
  doc.text(companyLines, MARGIN_LEFT, y);
  y += companyLines.length * 4.5 + 6;

  doc.text("Dentre o portfólio de produtos e serviços, destacam-se:", MARGIN_LEFT, y);
  y += 8;

  const services = [
    "Soluções em conectividade LAN/WAN",
    "Configuração de switches Layer 2 / Layer 3",
    "Configuração de roteadores",
    "Soluções Linux: VPN, Firewall, Proxy, DNS, Servidor Web e E-mail",
    "Projetos e execução de cabeamento estruturado metálico e óptico",
  ];
  services.forEach((s) => {
    doc.text(`-   ${s}`, MARGIN_LEFT + 5, y);
    y += 5;
  });

  y += 6;
  y = addSectionTitle(doc, "OBJETIVO", y);

  const objText = `Fornecimento de serviço conforme necessidade descrita: ${data.title || "Proposta Comercial"}.`;
  const objLines = doc.splitTextToSize(objText, CONTENT_W);
  doc.text(objLines, MARGIN_LEFT, y);
  y += objLines.length * 4.5 + 6;

  const secText = `A implementação de uma arquitetura de segurança possibilita às empresas melhorarem os seus níveis de proteção que, associados aos processos bem estruturados e a profissionais treinados, são peças fundamentais para a preservação do ambiente de redes, garantindo a continuidade dos negócios.`;
  const secLines = doc.splitTextToSize(secText, CONTENT_W);
  doc.text(secLines, MARGIN_LEFT, y);
  y += secLines.length * 4.5 + 6;

  const focusText = `A ${data.sender?.trade_name || "empresa"}, em todos seus projetos e implementações tem como foco principal a segurança da informação, agregando assim, valores ao negócio de seus parceiros e clientes.`;
  const focusLines = doc.splitTextToSize(focusText, CONTENT_W);
  doc.setFont("helvetica", "normal");
  doc.text(focusLines, MARGIN_LEFT, y);

  addFooter(doc, data.sender, proposalLabel);

  // ============ PAGE 3: Proposal Items ============
  doc.addPage();
  addLogo(doc, logoBase64);

  y = addSectionTitle(doc, "Proposta", 55);
  y += 5;

  const total = data.items.reduce((sum, i) => sum + i.quantity * i.unit_price, 0);

  data.items.forEach((item) => {
    const itemTotal = item.quantity * item.unit_price;
    const itemText = `${item.description} – R$ ${itemTotal.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`;
    const itemLines = doc.splitTextToSize(itemText, CONTENT_W - 15);

    // Check if we need a new page
    if (y + itemLines.length * 5 > PAGE_H - 45) {
      addFooter(doc, data.sender, proposalLabel);
      doc.addPage();
      addLogo(doc, logoBase64);
      y = addSectionTitle(doc, "Proposta (continuação)", 55);
      y += 5;
    }

    // Bullet
    doc.setFillColor(30, 30, 30);
    doc.circle(MARGIN_LEFT + 3, y - 1.2, 1.5, "F");

    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(30, 30, 30);
    doc.text(itemLines, MARGIN_LEFT + 10, y);
    y += itemLines.length * 5 + 4;
  });

  // Total
  y += 6;
  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...DARK_BLUE);
  doc.text(`Total: R$ ${total.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`, MARGIN_LEFT + 10, y);

  addFooter(doc, data.sender, proposalLabel);

  // ============ PAGE 4: Payment & Validity ============
  doc.addPage();
  addLogo(doc, logoBase64);

  y = addSectionTitle(doc, "FORMAS DE PAGAMENTO E ENTREGA", 55);
  y += 3;

  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(30, 30, 30);

  if (data.notes) {
    const notesLines = doc.splitTextToSize(data.notes, CONTENT_W);
    doc.text(notesLines, MARGIN_LEFT, y);
    y += notesLines.length * 4.5 + 8;
  } else {
    doc.text("Pagamento: A combinar.", MARGIN_LEFT, y);
    y += 12;
  }

  y += 8;
  y = addSectionTitle(doc, "VALIDADE DA PROPOSTA", y);
  y += 3;

  doc.text(`•   Esta proposta tem validade por ${data.validityDays} dias corridos a partir da data de envio.`, MARGIN_LEFT, y, { maxWidth: CONTENT_W });

  addFooter(doc, data.sender, proposalLabel);

  // ============ PAGE 5: Acceptance Term ============
  doc.addPage();
  addLogo(doc, logoBase64);

  y = 60;
  doc.setFontSize(15);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...DARK_BLUE);
  doc.text("TERMO DE ACEITE DE PROPOSTA", PAGE_W / 2, y, { align: "center" });

  // Underline
  const titleW = doc.getTextWidth("TERMO DE ACEITE DE PROPOSTA");
  doc.setDrawColor(...DARK_BLUE);
  doc.setLineWidth(0.5);
  doc.line(PAGE_W / 2 - titleW / 2, y + 2, PAGE_W / 2 + titleW / 2, y + 2);

  y += 30;

  // Signature lines
  const leftX = MARGIN_LEFT + 10;
  const rightX = PAGE_W / 2 + 15;
  const lineW = 55;

  doc.setDrawColor(30, 30, 30);
  doc.setLineWidth(0.3);
  doc.line(leftX, y, leftX + lineW, y);
  doc.line(rightX, y, rightX + lineW, y);

  y += 5;
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(60, 60, 60);
  doc.text("Cliente (assinatura + carimbo)", leftX, y);
  doc.text(data.sender?.trade_name || "", rightX, y);

  y += 20;
  doc.setFontSize(10);
  doc.setTextColor(30, 30, 30);
  doc.text(dateLabel, PAGE_W - MARGIN_RIGHT, y, { align: "right" });

  addFooter(doc, data.sender, proposalLabel);

  return doc;
}
