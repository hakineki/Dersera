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
  edebiyat: "Türk Edebiyatı",
};

export function getAyIndex(ay: string): number {
  const idx = AYLAR.findIndex((a) => a.ay === ay);
  return idx === -1 ? 0 : idx;
}

/** Seçilen aya kadar (dahil) birikimli tüm sorular */
export function getSorular(ders: Ders, ayIndex: number): Soru[] {
  return sinif10
    .slice(0, ayIndex + 1)
    .flatMap((plan) => plan.dersler[ders].sorular as Soru[]);
}

/** Seçilen aya kadar birikimli havuzdan rastgele soru */
export function rastgeleSoru(ders: Ders, ayIndex: number): Soru {
  const sorular = getSorular(ders, ayIndex);
  return sorular[Math.floor(Math.random() * sorular.length)];
}
