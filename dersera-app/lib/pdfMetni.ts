import { KAYNAK, kaynakNormal, sayfalariBirlestir } from "@/lib/composer/kaynak";

// PDF'in metni yalnız tarayıcıda çıkarılır: dosya sunucuya gönderilmez (Vercel istek sınırı ve kişisel veri).
// pdf.js yalnız öğretmen PDF seçince yüklenir. İşleyici ana iş parçacığında çalışır (ayrı worker dosyası gerekmez);
// PDF boyutu sınırlı olduğundan kısa bir süre yeter.

export const PDF_EN_BUYUK_BAYT = 20 * 1024 * 1024;
// Metin bu sayfalardan sonra zaten sınırı aşar; çok sayfalı PDF'te boşuna beklenmez.
const EN_COK_SAYFA = 60;

export type PdfSonucu = { ok: true; metin: string; sayfa: number; alinanSayfa: number; kirpildi: boolean } | { ok: false; hata: string };

export async function pdfMetni(dosya: File): Promise<PdfSonucu> {
  if (dosya.size > PDF_EN_BUYUK_BAYT) return { ok: false, hata: "PDF en çok 20 MB olabilir." };
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  // globalThis.pdfjsWorker'ı kurar: pdf.js ayrı worker yerine bunu kullanır.
  await import("pdfjs-dist/legacy/build/pdf.worker.mjs");
  let belge: Awaited<ReturnType<typeof pdfjs.getDocument>["promise"]> | null = null;
  try {
    belge = await pdfjs.getDocument({ data: new Uint8Array(await dosya.arrayBuffer()), disableFontFace: true }).promise;
    const sayfalar: string[] = [];
    let uzunluk = 0;
    for (let i = 1; i <= Math.min(belge.numPages, EN_COK_SAYFA) && uzunluk <= KAYNAK.enCok; i++) {
      const icerik = await (await belge.getPage(i)).getTextContent();
      const metin = icerik.items.map((o) => ("str" in o ? o.str + (o.hasEOL ? "\n" : " ") : "")).join("");
      sayfalar.push(metin);
      uzunluk += kaynakNormal(metin).length;
    }
    const r = sayfalariBirlestir(sayfalar);
    if (r.metin.length < KAYNAK.enAz) {
      return { ok: false, hata: "Bu PDF'te okunabilir metin bulunamadı. Taranmış (görüntü) PDF'ler desteklenmiyor; metni kopyalayıp aşağıya yapıştırabilirsin." };
    }
    return { ok: true, metin: r.metin, sayfa: belge.numPages, alinanSayfa: r.alinanSayfa, kirpildi: r.kirpildi || belge.numPages > r.alinanSayfa };
  } catch (err) {
    if (err instanceof Error && err.name === "PasswordException") return { ok: false, hata: "Parola korumalı PDF açılamıyor. Parolasız bir kopya seç." };
    return { ok: false, hata: "PDF okunamadı. Dosya bozuk olabilir; metni kopyalayıp yapıştırmayı dene." };
  } finally {
    await belge?.destroy();
  }
}
