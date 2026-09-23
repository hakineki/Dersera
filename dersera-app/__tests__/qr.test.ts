import jsQR from "jsqr";
import QRCode from "qrcode";
import { CARD, QR_BASE_URL, QR_DESIGNS, QR_NUMBERS, darkRuns, qrLayout, qrUrl } from "@/lib/qr";
import { buildAllPdf, buildSinglePdf } from "@/lib/qrPdf";

const SCALE = 6;
const QUIET = 4;

// Kartta çizilen matrisi (ortası boşaltılmış) piksele döker; renkleri tasarıma göre verir.
function render(n: number, fg: [number, number, number], bg: [number, number, number]) {
  const layout = qrLayout(n);
  const side = (layout.size + QUIET * 2) * SCALE;
  const data = new Uint8ClampedArray(side * side * 4);
  for (let y = 0; y < side; y++) {
    for (let x = 0; x < side; x++) {
      const row = Math.floor(y / SCALE) - QUIET;
      const col = Math.floor(x / SCALE) - QUIET;
      const inside = row >= 0 && col >= 0 && row < layout.size && col < layout.size;
      const [r, g, b] = inside && layout.isDark(row, col) ? fg : bg;
      data.set([r, g, b, 255], (y * side + x) * 4);
    }
  }
  return { data, side };
}

describe("sabit QR adresleri", () => {
  it("1–20 arası, dersera.vercel.app/game?qr=N biçiminde ve değişmez", () => {
    expect(QR_NUMBERS).toEqual(Array.from({ length: 20 }, (_, i) => i + 1));
    expect(QR_BASE_URL).toBe("https://dersera.vercel.app/game?qr=");
    expect(qrUrl(7)).toBe("https://dersera.vercel.app/game?qr=7");
  });
});

describe("ortasına numara yazılmış QR okunabilir", () => {
  it.each(QR_NUMBERS)("açık tasarım (#3B2F9E modül, beyaz zemin) QR %i", (n) => {
    const { data, side } = render(n, [0x3b, 0x2f, 0x9e], [255, 255, 255]);
    expect(jsQR(data, side, side, { inversionAttempts: "dontInvert" })?.data).toBe(qrUrl(n));
  });

  // Koyu tasarım ters QR'dır. jsQR'ın kendi ters çevirme yolu bu mor tonda başarısız oluyor
  // (siyah zeminde başarılı); bu yüzden ters QR destekleyen tarayıcıların yaptığı gibi görüntü elle çevrilir.
  it.each(QR_NUMBERS)("koyu tasarım (beyaz modül, #3B2F9E zemin; ters QR) QR %i", (n) => {
    const { data, side } = render(n, [255, 255, 255], [0x3b, 0x2f, 0x9e]);
    for (let i = 0; i < data.length; i += 4) {
      data[i] = 255 - data[i];
      data[i + 1] = 255 - data[i + 1];
      data[i + 2] = 255 - data[i + 2];
    }
    expect(jsQR(data, side, side, { inversionAttempts: "dontInvert" })?.data).toBe(qrUrl(n));
  });

  it("iki tasarımda da modül/zemin kontrastı WCAG AAA (7:1) üstünde", () => {
    const lum = (hex: string) => {
      const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
      const [r, g, b] = c.map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    for (const d of Object.values(QR_DESIGNS)) {
      const [hi, lo] = [lum(d.modules), lum(d.background)].sort((a, b) => b - a);
      expect((hi + 0.05) / (lo + 0.05)).toBeGreaterThan(7);
    }
  });

  it("numaranın arkasındaki modüller gerçekten boşaltılır", () => {
    const layout = qrLayout(20);
    const { modules } = QRCode.create(qrUrl(20), { errorCorrectionLevel: "H" });
    const mid = Math.floor(layout.size / 2);
    let cleared = 0;
    for (let c = 0; c < layout.size; c++) if (modules.get(mid, c) && !layout.isDark(mid, c)) cleared++;
    expect(cleared).toBeGreaterThan(0);
  });

  it("birleştirilmiş satır dizileri matrisi birebir yeniden üretir", () => {
    const layout = qrLayout(13);
    const rebuilt = new Set<string>();
    for (const r of darkRuns(layout)) for (let i = 0; i < r.length; i++) rebuilt.add(`${r.row},${r.col + i}`);
    for (let row = 0; row < layout.size; row++) {
      for (let col = 0; col < layout.size; col++) {
        expect(rebuilt.has(`${row},${col}`)).toBe(layout.isDark(row, col));
      }
    }
  });
});

describe("tasarım ve kart ölçüleri", () => {
  it("talimattaki renk ve ölçüleri kullanır", () => {
    expect(CARD).toMatchObject({ width: 160, height: 220, radius: 14, numberSize: 33 });
    expect(QR_DESIGNS.koyu).toMatchObject({ background: "#3B2F9E", modules: "#FFFFFF", number: "#FFFFFF", brand: "#C8C3F8" });
    expect(QR_DESIGNS.acik).toMatchObject({ background: "#FFFFFF", band: "#EEF0FD", modules: "#3B2F9E", number: "#3B2F9E" });
  });
});

describe("PDF", () => {
  it.each(["koyu", "acik"] as const)("toplu %s PDF: A4, sayfa başına 4 kart, 5 sayfa", (design) => {
    const doc = buildAllPdf(design);
    expect(doc.getNumberOfPages()).toBe(5);
    expect(Math.round(doc.internal.pageSize.getWidth())).toBe(210);
    expect(Math.round(doc.internal.pageSize.getHeight())).toBe(297);
  });

  it.each([
    ["a5", 148, 210],
    ["a4", 210, 297],
    ["a3", 297, 420],
  ] as const)("tek QR %s: tek sayfa, doğru kâğıt boyutu", (size, w, h) => {
    const doc = buildSinglePdf(7, "acik", size);
    expect(doc.getNumberOfPages()).toBe(1);
    expect(Math.round(doc.internal.pageSize.getWidth())).toBe(w);
    expect(Math.round(doc.internal.pageSize.getHeight())).toBe(h);
  });

  it("PDF numarayı ve alt adresi metin olarak içerir", () => {
    const out = buildSinglePdf(17, "koyu", "a4").output();
    expect(out).toContain("(17)");
    expect(out).toContain("(dersera.vercel.app)");
    expect(out).toMatch(/\(D\S*E\S*R/);
  });
});
