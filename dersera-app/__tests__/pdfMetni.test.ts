import { execFileSync } from "child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { pdfMetni, type PdfSonucu } from "@/lib/pdfMetni";

// Composer "PDF'ten al": metin tarayıcıda pdf.js ile çıkarılır. Testler aynı kodu Node'da gerçek pdf.js ile çalıştırır.
// pdf.js yalnız ES modülü; Jest onu yükleyemediği için pdf.js'e ulaşan durumlar lib/pdfMetni.ts'i ayrı bir Node
// sürecinde çalıştırır (helpers/pdfMetniCalistir.mjs). Sınır denetimi pdf.js'ten önce olduğundan burada çalışır.
function calistir(dosyalar: Record<string, Buffer>): PdfSonucu[] {
  const dizin = mkdtempSync(join(tmpdir(), "pdf-"));
  try {
    const yollar = Object.entries(dosyalar).map(([ad, icerik]) => {
      const yol = join(dizin, ad);
      writeFileSync(yol, icerik);
      return yol;
    });
    const cikti = execFileSync(process.execPath, [join(__dirname, "helpers/pdfMetniCalistir.mjs"), ...yollar], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], timeout: 60_000 });
    return JSON.parse(cikti) as PdfSonucu[];
  } finally {
    rmSync(dizin, { recursive: true, force: true });
  }
}

// Her sayfası tek satır metin olan en küçük geçerli PDF (Helvetica, WinAnsi; yalnız ASCII metin).
function pdf(sayfalar: string[]): Buffer {
  const nesneler: string[] = [];
  const sayfaNo = sayfalar.map((_, i) => 4 + i * 2);
  nesneler.push("<< /Type /Catalog /Pages 2 0 R >>");
  nesneler.push(`<< /Type /Pages /Kids [${sayfaNo.map((n) => `${n} 0 R`).join(" ")}] /Count ${sayfalar.length} >>`);
  nesneler.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");
  for (const [i, metin] of sayfalar.entries()) {
    const akis = metin ? `BT /F1 12 Tf 72 720 Td (${metin}) Tj ET` : "";
    nesneler.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${sayfaNo[i] + 1} 0 R >>`);
    nesneler.push(`<< /Length ${akis.length} >>\nstream\n${akis}\nendstream`);
  }
  let govde = "%PDF-1.4\n";
  const konumlar: number[] = [];
  nesneler.forEach((n, i) => {
    konumlar.push(govde.length);
    govde += `${i + 1} 0 obj\n${n}\nendobj\n`;
  });
  const xref = govde.length;
  govde += `xref\n0 ${nesneler.length + 1}\n0000000000 65535 f \n${konumlar.map((k) => `${String(k).padStart(10, "0")} 00000 n \n`).join("")}`;
  govde += `trailer\n<< /Size ${nesneler.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(govde, "latin1");
}

const UZUN = "Newton hareket yasalari: kuvvet kutle ile ivmenin carpimina esittir ve etki tepkiye esittir. ";

describe("PDF'ten metin", () => {
  it("gerçek pdf.js ile: sayfaları sırayla çıkarır; metinsiz PDF'te ve bozuk dosyada çökmeden açık hata verir", () => {
    const [iki, metinsiz, bozuk] = calistir({ "iki.pdf": pdf([UZUN + "Birinci sayfa.", UZUN + "Ikinci sayfa."]), "taranmis.pdf": pdf(["", ""]), "bozuk.pdf": Buffer.from("%PDF-1.4 bozuk") });
    expect(iki).toMatchObject({ ok: true, sayfa: 2, alinanSayfa: 2, kirpildi: false });
    if (!iki.ok) throw new Error(iki.hata);
    expect(iki.metin).toContain("Birinci sayfa.");
    expect(iki.metin.indexOf("Birinci")).toBeLessThan(iki.metin.indexOf("Ikinci"));
    expect(metinsiz).toEqual({ ok: false, hata: expect.stringContaining("okunabilir metin bulunamadı") });
    expect(bozuk).toEqual({ ok: false, hata: expect.stringContaining("PDF okunamadı") });
  }, 90_000);

  it("20 MB'tan büyük dosyayı okumadan reddeder", async () => {
    const buyuk = new File([new Uint8Array(20 * 1024 * 1024 + 1)], "buyuk.pdf");
    expect(await pdfMetni(buyuk)).toEqual({ ok: false, hata: "PDF en çok 20 MB olabilir." });
  });

  it("pdf.js zararlı PDF'te kod çalıştırma açığı kapalı sürümde (GHSA-hq66-cqwq-w95j: <6.2.108)", () => {
    const { version } = JSON.parse(readFileSync(join(__dirname, "../node_modules/pdfjs-dist/package.json"), "utf8")) as { version: string };
    const [a, b, c] = version.split(".").map(Number);
    expect(a * 1e6 + b * 1e3 + c).toBeGreaterThanOrEqual(6 * 1e6 + 2 * 1e3 + 108);
  });
});
