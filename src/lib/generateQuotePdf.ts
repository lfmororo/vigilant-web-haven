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

const PW = 210;
const PH = 297;
const ML = 20;
const MR = 20;
const CW = PW - ML - MR;
const DARK_BLUE = [0, 51, 102] as const;
const TEXT = [40, 40, 40] as const;
const MUTED = [110, 110, 110] as const;
const HEADER_BG = [245, 245, 245] as const;

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

function fmtDate(dateStr: string): string {
  const months = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
  const d = new Date(dateStr);
  return `${d.getDate()} de ${months[d.getMonth()]} de ${d.getFullYear()}`;
}

function fmtCurrency(v: number): string {
  return `R$${v.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`;
}

export async function generateQuotePdf(data: QuotePdfData): Promise<jsPDF> {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

  let logoBase64: string | null = null;
  if (data.sender?.logo_url) {
    logoBase64 = await loadImageAsBase64(data.sender.logo_url);
  }

  // === TOP ACCENT BAR ===
  doc.setFillColor(...DARK_BLUE);
  doc.rect(0, 0, PW, 4, "F");

  // === LOGO (top-left) ===
  let logoBottomY = 30;
  if (logoBase64) {
    try {
      doc.addImage(logoBase64, "PNG", ML, 10, 50, 18);
      logoBottomY = 32;
    } catch {
      doc.setFontSize(20);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...DARK_BLUE);
      doc.text(data.sender?.trade_name || "Empresa", ML, 24);
    }
  } else {
    doc.setFontSize(20);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...DARK_BLUE);
    doc.text(data.sender?.trade_name || "Empresa", ML, 24);
  }

  // === COMPANY INFO (top-right) ===
  const rightX = PW - MR;
  let ry = 14;
  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...DARK_BLUE);
  doc.text(data.sender?.trade_name || "", rightX, ry, { align: "right" });
  ry += 5;
  doc.setFontSize(8.5);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...MUTED);
  if (data.sender?.address) { doc.text(data.sender.address, rightX, ry, { align: "right" }); ry += 4; }
  if (data.sender?.cnpj) { doc.text(`CNPJ: ${data.sender.cnpj}`, rightX, ry, { align: "right" }); ry += 4; }
  if (data.sender?.email) { doc.text(data.sender.email, rightX, ry, { align: "right" }); ry += 4; }

  // === CLIENT + PROPOSAL NUMBER ===
  let y = Math.max(logoBottomY, ry) + 8;

  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...TEXT);
  doc.text(data.client?.full_name || "Cliente", ML, y);

  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...TEXT);
  doc.text("Proposta Nº", rightX - 20, y - 5, { align: "right" });
  doc.setFontSize(22);
  doc.text(String(data.quoteNumber), rightX, y - 4, { align: "right" });

  doc.setFontSize(8.5);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...MUTED);
  doc.text(`Fortaleza, ${fmtDate(data.createdAt)}`, rightX, y + 2, { align: "right" });

  y += 8;

  // Intro text
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...TEXT);
  doc.text(`Apresentamos nossa proposta comercial: ${data.title || "Proposta Comercial"}.`, ML, y);
  y += 8;

  // === DIVIDER ===
  doc.setDrawColor(...DARK_BLUE);
  doc.setLineWidth(0.6);
  doc.line(ML, y, PW - MR, y);
  y += 6;

  // === ITEMS TABLE ===
  const colX = {
    desc: ML + 2,
    qty: ML + CW * 0.55,
    price: ML + CW * 0.70,
    total: ML + CW * 0.87,
  };

  // Table header
  doc.setFillColor(...HEADER_BG);
  doc.rect(ML, y - 4, CW, 7, "F");
  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...TEXT);
  doc.text("Descrição", colX.desc, y);
  doc.text("Qtd", colX.qty, y, { align: "center" });
  doc.text("Preço unitário", colX.price, y, { align: "right" });
  doc.text("Preço total", PW - MR - 2, y, { align: "right" });
  y += 6;

  // Table rows
  const total = data.items.reduce((sum, i) => sum + i.quantity * i.unit_price, 0);

  data.items.forEach((item) => {
    const itemTotal = item.quantity * item.unit_price;

    // Check page overflow
    if (y > PH - 100) {
      doc.addPage();
      doc.setFillColor(...DARK_BLUE);
      doc.rect(0, 0, PW, 4, "F");
      y = 20;
    }

    // Light row line
    doc.setDrawColor(220, 220, 220);
    doc.setLineWidth(0.2);
    doc.line(ML, y + 2, PW - MR, y + 2);

    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...TEXT);

    // Description (may wrap)
    const descLines = doc.splitTextToSize(item.description, CW * 0.50);
    doc.text(descLines, colX.desc, y);

    doc.text(String(item.quantity), colX.qty, y, { align: "center" });
    doc.text(fmtCurrency(item.unit_price), colX.price, y, { align: "right" });
    doc.setFont("helvetica", "bold");
    doc.text(fmtCurrency(itemTotal), PW - MR - 2, y, { align: "right" });

    y += Math.max(descLines.length * 5, 7);
  });

  // Bottom table line
  doc.setDrawColor(...DARK_BLUE);
  doc.setLineWidth(0.4);
  doc.line(ML, y, PW - MR, y);
  y += 6;

  // Subtotal + Total
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...MUTED);
  doc.text("Subtotal", colX.price, y, { align: "right" });
  doc.setTextColor(...TEXT);
  doc.text(fmtCurrency(total), PW - MR - 2, y, { align: "right" });
  y += 10;

  // Grand total
  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...DARK_BLUE);
  doc.text(fmtCurrency(total), PW - MR - 2, y, { align: "right" });
  y += 14;

  // === OBSERVAÇÕES ===
  if (data.notes) {
    doc.setDrawColor(180, 180, 180);
    doc.setLineWidth(0.3);
    doc.roundedRect(ML, y - 4, CW, 6 + Math.ceil(data.notes.length / 80) * 5 + 4, 2, 2, "S");

    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...TEXT);
    doc.text("Observações da Proposta", ML + 4, y + 1);
    y += 7;

    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...MUTED);
    const noteLines = doc.splitTextToSize(data.notes, CW - 8);
    doc.text(noteLines, ML + 4, y);
    y += noteLines.length * 4.5 + 8;
  }

  // === INFO TABLE (Vendedor, Validade, etc.) ===
  y += 4;
  const infoW = CW / 4;
  const infoY = y;
  
  // Row 1
  doc.setFillColor(...HEADER_BG);
  doc.rect(ML, infoY - 4, infoW, 8, "F");
  doc.rect(ML + infoW * 2, infoY - 4, infoW, 8, "F");
  
  doc.setFontSize(8.5);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...TEXT);
  doc.text("Empresa", ML + 2, infoY);
  doc.text("Validade da Proposta", ML + infoW * 2 + 2, infoY);
  
  doc.setFont("helvetica", "normal");
  doc.text(data.sender?.trade_name || "—", ML + infoW + 2, infoY);
  doc.text(`${data.validityDays} dias`, ML + infoW * 3 + 2, infoY);
  
  // Row 2
  const infoY2 = infoY + 8;
  doc.setFillColor(...HEADER_BG);
  doc.rect(ML, infoY2 - 4, infoW, 8, "F");
  doc.rect(ML + infoW * 2, infoY2 - 4, infoW, 8, "F");
  
  doc.setFont("helvetica", "bold");
  doc.text("Prazo de Entrega", ML + 2, infoY2);
  doc.text("Cond. Pagamento", ML + infoW * 2 + 2, infoY2);
  
  doc.setFont("helvetica", "normal");
  doc.text("A combinar", ML + infoW + 2, infoY2);
  doc.text("A combinar", ML + infoW * 3 + 2, infoY2);

  // Info table border
  doc.setDrawColor(180, 180, 180);
  doc.setLineWidth(0.3);
  doc.rect(ML, infoY - 4, CW, 16, "S");
  doc.line(ML, infoY + 4, ML + CW, infoY + 4);
  doc.line(ML + infoW, infoY - 4, ML + infoW, infoY + 12);
  doc.line(ML + infoW * 2, infoY - 4, ML + infoW * 2, infoY + 12);
  doc.line(ML + infoW * 3, infoY - 4, ML + infoW * 3, infoY + 12);

  y = infoY2 + 14;

  // === SIGNATURE LINES ===
  const sigY = Math.max(y + 20, PH - 40);
  const sig1X = ML + 10;
  const sig2X = PW / 2 + 5;
  const sig3X = PW - MR - 30;
  const sigW = 50;

  doc.setDrawColor(80, 80, 80);
  doc.setLineWidth(0.3);
  doc.line(sig1X, sigY, sig1X + sigW, sigY);
  doc.line(sig2X, sigY, sig2X + sigW, sigY);
  doc.line(sig3X, sigY, sig3X + sigW, sigY);

  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...MUTED);
  doc.text("Nome Legível", sig1X + sigW / 2, sigY + 5, { align: "center" });
  doc.text("Assinatura", sig2X + sigW / 2, sigY + 5, { align: "center" });
  doc.text("Data", sig3X + sigW / 2, sigY + 5, { align: "center" });

  return doc;
}
