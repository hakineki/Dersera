import { jsPDF } from "jspdf";
import { CARD, QR_DESIGNS, QR_NUMBERS, darkRuns, qrLayout, type QrDesignId } from "@/lib/qr";

export type PaperSize = "a5" | "a4" | "a3";

const PT_PER_MM = 72 / 25.4;

// Kartı (x, y) sol üst köşesinden, widthMm genişliğinde vektörel çizer; SVG ile aynı geometri.
function drawCard(doc: jsPDF, n: number, designId: QrDesignId, x: number, y: number, widthMm: number) {
  const d = QR_DESIGNS[designId];
  const k = widthMm / CARD.width;
  const w = CARD.width * k;
  const h = CARD.height * k;
  const r = CARD.radius * k;

  doc.setFillColor(d.background);
  doc.roundedRect(x, y, w, h, r, r, "F");
  if (d.band) {
    const bandH = CARD.bandHeight * k;
    doc.setFillColor(d.band);
    doc.roundedRect(x, y, w, bandH, r, r, "F");
    doc.rect(x, y + bandH - r, w, r, "F");
  }
  if (d.border) {
    doc.setDrawColor(d.border);
    doc.setLineWidth(0.3);
    doc.roundedRect(x, y, w, h, r, r, "S");
  }

  doc.setFont("helvetica", "bold");
  doc.setTextColor(d.brand);
  doc.setFontSize(11 * k * PT_PER_MM);
  doc.text("DERSERA", x + w / 2, y + CARD.brandY * k, { align: "center", charSpace: 1.5 * k });

  const layout = qrLayout(n);
  const qx = x + CARD.qrX * k;
  const qy = y + CARD.qrY * k;
  const cell = layout.cell * k;
  doc.setFillColor(d.modules);
  for (const run of darkRuns(layout)) {
    // Küçük örtüşme, PDF görüntüleyicilerde modüller arasında ince çizgi oluşmasını önler.
    doc.rect(qx + run.col * cell, qy + run.row * cell, run.length * cell + 0.02, cell + 0.02, "F");
  }

  doc.setTextColor(d.number);
  doc.setFontSize(CARD.numberSize * k * PT_PER_MM);
  doc.text(String(n), qx + (CARD.qrSize * k) / 2, qy + (CARD.qrSize * k) / 2, {
    align: "center",
    baseline: "middle",
  });

  doc.setFont("helvetica", "normal");
  doc.setTextColor(d.footer);
  doc.setFontSize(8 * k * PT_PER_MM);
  doc.text("dersera.vercel.app", x + w / 2, y + CARD.footerY * k, { align: "center" });
}

export function buildAllPdf(designId: QrDesignId): jsPDF {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const cols = 2;
  const rows = 2;
  const cellW = pageW / cols;
  const cellH = pageH / rows;
  const cardW = Math.min(cellW * 0.82, (cellH * 0.82 * CARD.width) / CARD.height);
  const cardH = (cardW * CARD.height) / CARD.width;

  QR_NUMBERS.forEach((n, i) => {
    const slot = i % (cols * rows);
    if (i > 0 && slot === 0) doc.addPage();
    const col = slot % cols;
    const row = Math.floor(slot / cols);
    drawCard(doc, n, designId, col * cellW + (cellW - cardW) / 2, row * cellH + (cellH - cardH) / 2, cardW);
  });
  return doc;
}

export function buildSinglePdf(n: number, designId: QrDesignId, size: PaperSize): jsPDF {
  const doc = new jsPDF({ unit: "mm", format: size });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const cardW = Math.min(pageW * 0.8, (pageH * 0.8 * CARD.width) / CARD.height);
  const cardH = (cardW * CARD.height) / CARD.width;
  drawCard(doc, n, designId, (pageW - cardW) / 2, (pageH - cardH) / 2, cardW);
  return doc;
}

export function downloadAllPdf(designId: QrDesignId): void {
  buildAllPdf(designId).save(`dersera-qr-1-20-${designId}.pdf`);
}

export function downloadSinglePdf(n: number, designId: QrDesignId, size: PaperSize): void {
  buildSinglePdf(n, designId, size).save(`dersera-qr-${String(n).padStart(2, "0")}-${designId}-${size.toUpperCase()}.pdf`);
}
