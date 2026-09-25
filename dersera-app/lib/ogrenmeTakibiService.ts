import { kazanimBul, PROGRAM_DERS_ADI } from "@/data/mufredat/programlar";
import type { StoredGame } from "@/lib/gamesStore";
import { ayOf } from "@/lib/kredi";
import {
  oyunAlanlari,
  takipAlanlari,
  takipPenceresi,
  takipRaporuHesapla,
  type KazanimTanimi,
  type KazanimYeri,
  type TakipRaporu,
  type YerBulucu,
} from "@/lib/ogrenmeTakibi";
import { getOgrenmeTakibiStore, type OgrenmeTakibiStore } from "@/lib/ogrenmeTakibiStore";

// Öğrenci sonucu oyunu yayınlayan öğretmenin sayaçlarına yazılır (kurallar lib/ogrenmeTakibi.ts). Yan etkidir: hata
// sonucu kaydetmeyi bozmaz, yalnız loglanır. Yayınlayanı ya da konuları bilinmeyen oyun (oturumsuz yayın, bu özellikten
// önceki yayınlar) ve öğretmenin kendi oturumundan gelen deneme oynayışı sayılmaz.
export async function takipSinyali(
  game: Pick<StoredGame, "sahip" | "definition" | "dersler">,
  kod: string,
  oyuncu: string,
  durakYanlislari: Record<string, number>,
  istekSahibi: string | null,
  ttlMs: number,
  now = Date.now(),
  store: OgrenmeTakibiStore = getOgrenmeTakibiStore()
): Promise<void> {
  const { sahip, definition, dersler } = game;
  if (!sahip || !definition || !dersler || sahip === istekSahibi) return;
  const yerOf: YerBulucu = (hedef) => {
    const k = kazanimBul(definition.meta.sinif, dersler, hedef);
    return k && { ders: k.ders, sinif: k.sinif, uniteId: k.uniteId };
  };
  try {
    await store.ogrenciSay(sahip, ayOf(now), kod, oyuncu, takipAlanlari(definition, durakYanlislari, yerOf), oyunAlanlari(definition, yerOf), ttlMs);
  } catch (err) {
    console.error("[takip] sonuç sayılamadı", err instanceof Error ? err.message : err);
  }
}

function tanimOf(yer: KazanimYeri, kod: string): KazanimTanimi | null {
  const k = kazanimBul(yer.sinif, [{ ders: yer.ders, konuId: yer.uniteId }], kod);
  return k && { metin: k.metin, ders: k.ders, dersAd: PROGRAM_DERS_ADI[k.ders], sinif: k.sinif, uniteId: k.uniteId, uniteAd: k.uniteAd };
}

// Seçilen ay ve önceki iki ayın raporu; çıktı metni, ders ve konu müfredattan eklenir.
export async function takipRaporu(sahip: string, ay: string, store: OgrenmeTakibiStore = getOgrenmeTakibiStore()): Promise<TakipRaporu> {
  const aylar = takipPenceresi(ay);
  return takipRaporuHesapla(aylar, await store.sayaclar(sahip, aylar), tanimOf);
}
