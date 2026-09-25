import lise from "./tymm-programlar.json";
import ortaokul from "./tymm-ortaokul.json";
import ilkokul from "./tymm-ilkokul.json";

// Türkiye Yüzyılı Maarif Modeli öğretim programları: ilkokul (1–4) ve ortaokul (5–8) scripts/tymm-temel-egitim.mjs ile,
// ortaöğretim (9–12) tymm-programlar.json.
// Composer yalnızca bu veriyi kullanır; konu (ünite/tema) ve öğrenme çıktısı uydurulamaz. Aylık soru bankası (sinif10)
// ayrı bir kaynaktır.

import { PROGRAM_DERSLERI, SINIFLAR, type ProgramDersi } from "./dersler";

export { PROGRAM_DERS_ADI, PROGRAM_DERSLERI, SINIFLAR, type ProgramDersi, type Sinif } from "./dersler";

export interface OgrenmeCiktisi {
  kod: string;
  metin: string;
}

export interface Unite {
  id: string;
  ad: string;
  amac: string | null;
  konular: string[];
  ogrenmeCiktilari: OgrenmeCiktisi[];
}

interface ProgramVerisi {
  kaynak: string;
  alinma: string;
  programlar: Partial<Record<ProgramDersi, Partial<Record<string, Unite[]>>>>;
}

// İki kaynak ders → sınıf düzeyinde birleşir (aynı ders anahtarı, ör. matematik, iki kademede de vardır).
const KAYNAKLAR = [lise, ortaokul, ilkokul] as ProgramVerisi[];
const PROGRAMLAR: ProgramVerisi["programlar"] = {};
for (const k of KAYNAKLAR)
  for (const [ders, siniflar] of Object.entries(k.programlar)) PROGRAMLAR[ders as ProgramDersi] = { ...PROGRAMLAR[ders as ProgramDersi], ...siniflar };

export function getUniteler(sinif: number, ders: string): Unite[] {
  return PROGRAMLAR[ders as ProgramDersi]?.[String(sinif)] ?? [];
}

export function getUnite(sinif: number, ders: string, uniteId: string): Unite | undefined {
  return getUniteler(sinif, ders).find((u) => u.id === uniteId);
}

export interface KonuSecenegi {
  id: string;
  ad: string;
}

// İstemciye yalnız ünite adları gider; öğrenme çıktıları sunucuda kalır.
export function getKonuSecenekleri(): Record<string, KonuSecenegi[]> {
  const out: Record<string, KonuSecenegi[]> = {};
  for (const ders of PROGRAM_DERSLERI) {
    for (const sinif of SINIFLAR) {
      const uniteler = getUniteler(sinif, ders).filter((u) => u.ogrenmeCiktilari.length > 0);
      if (uniteler.length) out[`${sinif}:${ders}`] = uniteler.map((u) => ({ id: u.id, ad: u.ad }));
    }
  }
  return out;
}

export interface KazanimBilgisi {
  kod: string;
  metin: string;
  ders: ProgramDersi;
  sinif: number;
  uniteId: string;
  uniteAd: string;
}

// Öğrenme çıktısı kodundan (ör. FİZ.10.1.1) program bilgisine: öğretmen öğrenme takibi ve pekiştirme oyunu için.
// Composer oyunları yalnız programdaki kodları kullanır (doğrulayıcı), bu yüzden birebir eşleşme yeterlidir.
let kazanimDizini: Map<string, KazanimBilgisi> | null = null;
export function kazanimBul(kod: string): KazanimBilgisi | null {
  if (!kazanimDizini) {
    kazanimDizini = new Map();
    for (const ders of PROGRAM_DERSLERI)
      for (const sinif of SINIFLAR)
        for (const u of getUniteler(sinif, ders))
          for (const c of u.ogrenmeCiktilari)
            if (!kazanimDizini.has(c.kod)) kazanimDizini.set(c.kod, { kod: c.kod, metin: c.metin, ders, sinif, uniteId: u.id, uniteAd: u.ad });
  }
  return kazanimDizini.get(kod) ?? null;
}
