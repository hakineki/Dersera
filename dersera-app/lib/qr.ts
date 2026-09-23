import QRCode from "qrcode";
import { QR_COUNT } from "@/lib/games";

export const QR_BASE_URL = "https://dersera.vercel.app/game?qr=";
export const QR_NUMBERS = Array.from({ length: QR_COUNT }, (_, i) => i + 1);

export function qrUrl(n: number): string {
  return `${QR_BASE_URL}${n}`;
}

export type QrDesignId = "koyu" | "acik";

export interface QrDesign {
  id: QrDesignId;
  label: string;
  background: string;
  band: string | null;
  border: string | null;
  modules: string;
  number: string;
  brand: string;
  footer: string;
}

export const QR_DESIGNS: Record<QrDesignId, QrDesign> = {
  koyu: {
    id: "koyu",
    label: "Koyu / mor",
    background: "#3B2F9E",
    band: null,
    border: null,
    modules: "#FFFFFF",
    number: "#FFFFFF",
    brand: "#C8C3F8",
    footer: "#C8C3F8",
  },
  acik: {
    id: "acik",
    label: "Açık / baskı",
    background: "#FFFFFF",
    band: "#EEF0FD",
    border: "#DADDF5",
    modules: "#3B2F9E",
    number: "#3B2F9E",
    brand: "#3B2F9E",
    footer: "#6B63C9",
  },
};

// Kart geometrisi (px); PDF aynı ölçüleri orantılı büyütür.
export const CARD = {
  width: 160,
  height: 220,
  radius: 14,
  bandHeight: 36,
  brandY: 22,
  qrX: 16,
  qrY: 46,
  qrSize: 128,
  footerY: 200,
  numberSize: 33,
} as const;

export interface QrLayout {
  size: number;
  cell: number;
  isDark: (row: number, col: number) => boolean;
}

// Numaranın arkasındaki modüller boşaltılır (kutu çizilmez); H seviyesi bu kaybı tolere eder.
export function qrLayout(n: number): QrLayout {
  const { modules } = QRCode.create(qrUrl(n), { errorCorrectionLevel: "H" });
  const size = modules.size;
  const cell = CARD.qrSize / size;
  const digits = String(n).length;
  const holeW = digits * 20 + 16;
  const holeH = CARD.numberSize + 5;
  const x0 = (CARD.qrSize - holeW) / 2;
  const y0 = (CARD.qrSize - holeH) / 2;
  const inHole = (row: number, col: number) => {
    const cx = (col + 0.5) * cell;
    const cy = (row + 0.5) * cell;
    return cx >= x0 && cx <= x0 + holeW && cy >= y0 && cy <= y0 + holeH;
  };
  return {
    size,
    cell,
    isDark: (row, col) => Boolean(modules.get(row, col)) && !inHole(row, col),
  };
}

// Yatay koyu modül dizilerini tek dikdörtgende birleştirir: daha küçük SVG ve PDF.
export function darkRuns(layout: QrLayout): { row: number; col: number; length: number }[] {
  const runs: { row: number; col: number; length: number }[] = [];
  for (let row = 0; row < layout.size; row++) {
    let col = 0;
    while (col < layout.size) {
      if (!layout.isDark(row, col)) {
        col++;
        continue;
      }
      const start = col;
      while (col < layout.size && layout.isDark(row, col)) col++;
      runs.push({ row, col: start, length: col - start });
    }
  }
  return runs;
}
