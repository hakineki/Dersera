export type { Ders, Soru, Konu, AylikPlan } from "./sinif10";
export { sinif10 } from "./sinif10";

import { sinif10 } from "./sinif10";
import type { Ders, Soru } from "./sinif10";

export const AYLAR = [
  { ay: "eylul", ad: "Eylül" },
  { ay: "ekim", ad: "Ekim" },
  { ay: "kasim", ad: "Kasım" },
  { ay: "aralik", ad: "Aralık" },
  { ay: "ocak", ad: "Ocak" },
  { ay: "subat", ad: "Şubat" },
  { ay: "mart", ad: "Mart" },
  { ay: "nisan", ad: "Nisan" },
  { ay: "mayis", ad: "Mayıs" },
] as const;

export type AySlug = (typeof AYLAR)[number]["ay"];

export const DERS_ADI: Record<Ders, string> = {
  matematik: "Matematik",
  fizik: "Fizik",
  kimya: "Kimya",
  "turk-dili": "Türk Dili ve Edebiyatı",
  biyoloji: "Biyoloji",
  tarih: "Tarih",
  cografya: "Coğrafya",
  felsefe: "Felsefe",
  "din-kulturu": "Din Kültürü ve Ahlak Bilgisi",
  "genel-kultur": "Genel Kültür",
};

export const CORE_DERSLER: Ders[] = ["matematik", "fizik", "kimya", "turk-dili"];

export function getAyIndex(ay: string): number {
  const idx = AYLAR.findIndex((a) => a.ay === ay);
  return idx === -1 ? 0 : idx;
}

/** Seçilen ay sluglarından sorular (birleşim — birikimli değil) */
export function getSorular(ders: Ders, aylar: string[]): Soru[] {
  return sinif10
    .filter((plan) => aylar.includes(plan.ay))
    .flatMap((plan) => (plan.dersler[ders]?.sorular ?? []) as Soru[]);
}

/** Seçilen ay havuzundan rastgele soru; yoksa null */
export function rastgeleSoru(ders: Ders, aylar: string[]): Soru | null {
  const sorular = getSorular(ders, aylar);
  if (!sorular.length) return null;
  return sorular[Math.floor(Math.random() * sorular.length)];
}
