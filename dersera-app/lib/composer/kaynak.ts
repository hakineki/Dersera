// Özel kaynaktan oyun (docs/URUN-BAGLAMI.md V2 "PDF/özel kaynak"): öğretmen ders notunu yapıştırır ya da PDF'in metni
// tarayıcıda çıkarılır (lib/pdfMetni.ts). Kaynak yalnız oluşturma isteminde kullanılır; hiçbir yerde saklanmaz ya da
// loglanmaz. Bu dosya istemci ile sunucunun ortak kurallarıdır: ağır modül (müfredat verisi, zod) içe aktarmamalı.

export const KAYNAK = {
  enAz: 100,
  enCok: 15_000,
} as const;

// Kontrol, yön değiştirici ve sıfır genişlikli karakterler (satır sonu kalır). Ön not (lib/composer/input.ts) da kullanır.
export const gorunmezleriAt = (s: string): string => s.replace(/[\u0000-\u0008\u000B-\u001F\u007F-\u009F\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/g, "");

// PDF'ten gelen fazla boşluk (bölünmez boşluk dahil) ve boş satırlar da sıkıştırılır. En az/en çok sınırı bu metne uygulanır.
export function kaynakNormal(s: string): string {
  return gorunmezleriAt(s.replace(/\r\n?/g, "\n").replace(/\t/g, " "))
    .replace(/[ \u00A0]{2,}/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// PDF sayfa metinlerini sırayla birleştirir; sınır aşılınca kalan sayfalar alınmaz (sayfa ortasında kesilir).
export function sayfalariBirlestir(sayfalar: string[], enCok: number = KAYNAK.enCok): { metin: string; alinanSayfa: number; kirpildi: boolean } {
  let metin = "";
  let alinanSayfa = 0;
  for (const s of sayfalar) {
    const ek = kaynakNormal(s);
    if (!ek) {
      alinanSayfa++;
      continue;
    }
    const aday = metin ? `${metin}\n\n${ek}` : ek;
    if (aday.length > enCok) {
      return { metin: aday.slice(0, enCok).trimEnd(), alinanSayfa: alinanSayfa + 1, kirpildi: true };
    }
    metin = aday;
    alinanSayfa++;
  }
  return { metin, alinanSayfa, kirpildi: false };
}
