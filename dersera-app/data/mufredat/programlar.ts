import lise from "./tymm-programlar.json";
import ortaokul from "./tymm-ortaokul.json";

// Türkiye Yüzyılı Maarif Modeli öğretim programları: ortaokul (5–8, scripts/tymm-ortaokul.mjs) ve ortaöğretim (9–12).
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
const KAYNAKLAR = [lise, ortaokul] as ProgramVerisi[];
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
