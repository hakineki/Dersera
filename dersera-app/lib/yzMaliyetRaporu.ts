import { ayOf } from "@/lib/kredi";
import type { OkulStore } from "@/lib/okulStore";
import { DOLAR_KURU, GORSEL_FIYATLARI, raporOf, TOKEN_FIYATLARI, type YzMaliyetRaporu } from "@/lib/yzMaliyet";
import type { YzMaliyetStore } from "@/lib/yzMaliyetStore";

// Yönetim sayfası için aylık yapay zekâ maliyet raporu: tür/model ve okul kırılımı, okul adlarıyla, fiyat varsayımları.

export const AY_BICIMI = /^\d{4}-(0[1-9]|1[0-2])$/;

// Bu ay dahil geriye doğru n ay (seçim listesi).
export function sonAylarListesi(now: number, n: number): string[] {
  const [y, m] = ayOf(now).split("-").map(Number);
  return Array.from({ length: n }, (_, i) => {
    const t = y * 12 + (m - 1) - i;
    return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, "0")}`;
  });
}

export async function yzMaliyetRaporu(d: { maliyet: YzMaliyetStore; okul: OkulStore }, ay: string, now = Date.now()) {
  const rapor: YzMaliyetRaporu = raporOf(ay, await d.maliyet.tablo(ay));
  const idler = rapor.okullar.flatMap((o) => (o.okulId ? [o.okulId] : []));
  const okullar = idler.length ? await d.okul.okullar(idler) : [];
  const adlar = new Map(idler.map((id, i) => [id, okullar[i]?.ad ?? null]));
  return {
    ...rapor,
    okullar: rapor.okullar.map((o) => ({ ...o, okulAdi: o.okulId ? (adlar.get(o.okulId) ?? null) : null })),
    aylar: sonAylarListesi(now, 13),
    varsayimlar: { dolarKuru: DOLAR_KURU, token: TOKEN_FIYATLARI, gorsel: GORSEL_FIYATLARI },
  };
}

export type YzMaliyetYaniti = Awaited<ReturnType<typeof yzMaliyetRaporu>>;
