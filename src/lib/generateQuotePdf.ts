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
const MARGIN_LEFT = 30;
const MARGIN_RIGHT = 30;
const CONTENT_W = PAGE_W - MARGIN_LEFT - MARGIN_RIGHT;
const DARK_BLUE = [0, 51, 102] as const;
const TEXT_COLOR = [40, 40, 40] as const;
const MUTED_COLOR = [110, 110, 110] as const;
const LINE_H = 5.5; // consistent line height for body text

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
  const baseY = PAGE_H - 32;

  // Subtle top line
  doc.setDrawColor(200, 200, 200);
  doc.setLineWidth(0.3);
  doc.line(MARGIN_LEFT + 20, baseY - 4, PAGE_W - MARGIN_LEFT - 20, baseY - 4);

  doc.setFontSize(8.5);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...DARK_BLUE);
  doc.text(sender?.trade_name || "", PAGE_W / 2, baseY, { align: "center" });

  doc.setFont("helvetica", "normal");
  doc.setTextColor(...MUTED_COLOR);
  doc.setFontSize(7.5);
  let fY = baseY + 4;
  if (sender?.address) { doc.text(sender.address, PAGE_W / 2, fY, { align: "center" }); fY += 3.5; }
  if (sender?.email) { doc.text(sender.email, PAGE_W / 2, fY, { align: "center" }); fY += 3.5; }
  doc.text("Fortaleza CE – Brasil", PAGE_W / 2, fY, { align: "center" });

  // Proposal number bottom-right
  doc.setFontSize(7.5);
  doc.setTextColor(140, 140, 140);
  doc.text(proposalLabel, PAGE_W - MARGIN_RIGHT, PAGE_H - 14, { align: "right" });
}

function addLogo(doc: jsPDF, logoBase64: string | null) {
  if (logoBase64) {
    try {
      doc.addImage(logoBase64, "PNG", MARGIN_LEFT, 18, 65, 22);
    } catch {
      addTextLogo(doc);
    }
  } else {
    addTextLogo(doc);
  }
}

function addTextLogo(doc: jsPDF) {
  doc.setFontSize(26);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...DARK_BLUE);
  doc.text("FC.TECH", MARGIN_LEFT, 34);
}

function addSectionTitle(doc: jsPDF, title: string, y: number): number {
  doc.setFontSize(13);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...DARK_BLUE);
  doc.text(title, MARGIN_LEFT, y);

  // Horizontal rule
  doc.setDrawColor(...DARK_BLUE);
  doc.setLineWidth(0.7);
  doc.line(MARGIN_LEFT, y + 4, PAGE_W - MARGIN_RIGHT, y + 4);
  return y + 14;
}

function setBodyText(doc: jsPDF) {
  doc.setFontSize(10.5);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...TEXT_COLOR);
}

function printParagraph(doc: jsPDF, text: string, x: number, y: number, maxW: number, indent = 0): number {
  setBodyText(doc);
  const lines = doc.splitTextToSize(text, maxW);
  doc.text(lines, x + indent, y, { lineHeightFactor: 1.5 });
  return y + lines.length * LINE_H;
}

export async function generateQuotePdf(data: QuotePdfData): Promise<jsPDF> {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const proposalLabel = formatProposalNumber(data.quoteNumber, data.createdAt);
  const dateLabel = formatDatePtBr(data.createdAt);

  let logoBase64: string | null = null;
  if (data.sender?.logo_url) {
    logoBase64 = await loadImageAsBase64(data.sender.logo_url);
  }

  // =============================================
  // PAGE 1: Cover Letter
  // =============================================
  addLogo(doc, logoBase64);

  // Date + proposal number (right aligned)
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...MUTED_COLOR);
  doc.text(dateLabel, PAGE_W - MARGIN_RIGHT, 58, { align: "right" });
  doc.text(proposalLabel, PAGE_W - MARGIN_RIGHT, 64, { align: "right" });

  // Recipient
  let y = 82;
  doc.setFontSize(11);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...TEXT_COLOR);
  doc.text(`A ${data.client?.full_name || "Cliente"}`, MARGIN_LEFT + 10, y);

  y += 16;
  doc.text("Nesta,", MARGIN_LEFT, y);

  y += 14;
  y = printParagraph(doc,
    "Conforme contato comercial, estamos enviando nosso descritivo de serviço.",
    MARGIN_LEFT, y, CONTENT_W, 10);

  y += 8;
  y = printParagraph(doc,
    "Acreditamos, com isto, estarmos contribuindo para melhor funcionamento na área de Tecnologia de vossa empresa.",
    MARGIN_LEFT, y, CONTENT_W);

  y += 8;
  y = printParagraph(doc,
    "Assim, ficamos a disposição para maiores esclarecimentos, visando o melhor entendimento de nossos serviços e proposta comercial. E ainda aguardamos seu retorno para darmos continuidade a este projeto.",
    MARGIN_LEFT, y, CONTENT_W);

  y += 24;
  doc.setFontSize(10.5);
  doc.text("Atenciosamente,", PAGE_W / 2, y, { align: "center" });

  y += 30;
  doc.setDrawColor(60, 60, 60);
  doc.setLineWidth(0.3);
  doc.line(PAGE_W / 2 - 35, y, PAGE_W / 2 + 35, y);
  y += 5;
  doc.setFontSize(9);
  doc.setTextColor(...MUTED_COLOR);
  doc.text("Gerencia de Projetos", PAGE_W / 2, y, { align: "center" });
  y += 4;
  doc.text(data.sender?.email || "", PAGE_W / 2, y, { align: "center" });

  addFooter(doc, data.sender, proposalLabel);

  // =============================================
  // PAGE 2: Company Description
  // =============================================
  doc.addPage();
  addLogo(doc, logoBase64);

  y = addSectionTitle(doc, "A EMPRESA", 58);

  y = printParagraph(doc,
    `Com uma equipe composta por engenheiros e técnicos certificados e qualificados com cursos de fabricantes, a ${data.sender?.trade_name || "empresa"} desenvolve e executa hoje projetos de instalações elétricas, cabeamento estruturado, conectividade e segurança de dados, além de oferecer treinamentos especializados para parceiros e clientes.`,
    MARGIN_LEFT, y, CONTENT_W);

  y += 10;
  setBodyText(doc);
  doc.text("Dentre o portfólio de produtos e serviços, destacam-se:", MARGIN_LEFT, y);
  y += 10;

  const services = [
    "Soluções em conectividade LAN/WAN",
    "Configuração de switches Layer 2 / Layer 3",
    "Configuração de roteadores",
    "Soluções Linux: VPN, Firewall, Proxy, DNS, Servidor Web e E-mail",
    "Projetos e execução de cabeamento estruturado metálico e óptico",
  ];
  services.forEach((s) => {
    doc.setFontSize(10.5);
    doc.setTextColor(...TEXT_COLOR);
    doc.text(`–   ${s}`, MARGIN_LEFT + 8, y);
    y += 7;
  });

  y += 10;
  y = addSectionTitle(doc, "OBJETIVO", y);

  y = printParagraph(doc,
    `Fornecimento de serviço conforme necessidade descrita: ${data.title || "Proposta Comercial"}.`,
    MARGIN_LEFT, y, CONTENT_W);

  y += 8;
  y = printParagraph(doc,
    "A implementação de uma arquitetura de segurança possibilita às empresas melhorarem os seus níveis de proteção que, associados aos processos bem estruturados e a profissionais treinados, são peças fundamentais para a preservação do ambiente de redes, garantindo a continuidade dos negócios.",
    MARGIN_LEFT, y, CONTENT_W);

  y += 8;
  y = printParagraph(doc,
    `A ${data.sender?.trade_name || "empresa"}, em todos seus projetos e implementações tem como foco principal a segurança da informação, agregando assim, valores ao negócio de seus parceiros e clientes.`,
    MARGIN_LEFT, y, CONTENT_W);

  addFooter(doc, data.sender, proposalLabel);

  // =============================================
  // PAGE 3: Proposal Items
  // =============================================
  doc.addPage();
  addLogo(doc, logoBase64);

  y = addSectionTitle(doc, "Proposta", 58);
  y += 4;

  const total = data.items.reduce((sum, i) => sum + i.quantity * i.unit_price, 0);

  data.items.forEach((item) => {
    const itemTotal = item.quantity * item.unit_price;
    const priceStr = `R$ ${itemTotal.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`;
    const itemText = item.quantity > 1
      ? `${item.description} (${item.quantity}x) – ${priceStr}`
      : `${item.description} – ${priceStr}`;

    doc.setFontSize(10.5);
    const itemLines = doc.splitTextToSize(itemText, CONTENT_W - 18);

    // Page overflow check
    if (y + itemLines.length * LINE_H + 4 > PAGE_H - 50) {
      addFooter(doc, data.sender, proposalLabel);
      doc.addPage();
      addLogo(doc, logoBase64);
      y = addSectionTitle(doc, "Proposta (continuação)", 58);
      y += 4;
    }

    // Bullet point
    doc.setFillColor(...DARK_BLUE);
    doc.circle(MARGIN_LEFT + 4, y - 1.3, 1.5, "F");

    doc.setFont("helvetica", "bold");
    doc.setTextColor(...TEXT_COLOR);
    doc.text(itemLines, MARGIN_LEFT + 12, y, { lineHeightFactor: 1.5 });
    y += itemLines.length * LINE_H + 6;
  });

  // Total line
  y += 8;
  doc.setDrawColor(200, 200, 200);
  doc.setLineWidth(0.3);
  doc.line(MARGIN_LEFT + 12, y - 4, PAGE_W - MARGIN_RIGHT, y - 4);

  doc.setFontSize(13);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...DARK_BLUE);
  doc.text(`Total: R$ ${total.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`, PAGE_W - MARGIN_RIGHT, y, { align: "right" });

  addFooter(doc, data.sender, proposalLabel);

  // =============================================
  // PAGE 4: Payment Terms & Validity
  // =============================================
  doc.addPage();
  addLogo(doc, logoBase64);

  y = addSectionTitle(doc, "FORMAS DE PAGAMENTO E ENTREGA", 58);

  if (data.notes) {
    y = printParagraph(doc, data.notes, MARGIN_LEFT, y, CONTENT_W);
    y += 10;
  } else {
    y = printParagraph(doc, "Pagamento: A combinar.", MARGIN_LEFT, y, CONTENT_W);
    y += 10;
  }

  y += 12;
  y = addSectionTitle(doc, "VALIDADE DA PROPOSTA", y);

  setBodyText(doc);
  doc.text(`•   Esta proposta tem validade por ${data.validityDays} dias corridos a partir da data de envio.`, MARGIN_LEFT, y, { maxWidth: CONTENT_W });

  addFooter(doc, data.sender, proposalLabel);

  // =============================================
  // PAGE 5: Acceptance Term
  // =============================================
  doc.addPage();
  addLogo(doc, logoBase64);

  y = 68;
  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...DARK_BLUE);
  const termTitle = "TERMO DE ACEITE DE PROPOSTA";
  doc.text(termTitle, PAGE_W / 2, y, { align: "center" });

  // Underline
  const titleW = doc.getTextWidth(termTitle);
  doc.setDrawColor(...DARK_BLUE);
  doc.setLineWidth(0.6);
  doc.line(PAGE_W / 2 - titleW / 2, y + 3, PAGE_W / 2 + titleW / 2, y + 3);

  y += 40;

  // Signature lines
  const leftX = MARGIN_LEFT + 5;
  const rightX = PAGE_W / 2 + 12;
  const lineW = 60;

  doc.setDrawColor(80, 80, 80);
  doc.setLineWidth(0.3);
  doc.line(leftX, y, leftX + lineW, y);
  doc.line(rightX, y, rightX + lineW, y);

  y += 6;
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...MUTED_COLOR);
  doc.text("Cliente (assinatura + carimbo)", leftX + lineW / 2, y, { align: "center" });
  doc.text(data.sender?.trade_name || "", rightX + lineW / 2, y, { align: "center" });

  y += 28;
  doc.setFontSize(10);
  doc.setTextColor(...TEXT_COLOR);
  doc.text(dateLabel, PAGE_W - MARGIN_RIGHT, y, { align: "right" });

  addFooter(doc, data.sender, proposalLabel);

  return doc;
}
