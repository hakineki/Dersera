import { kazanimBul, PROGRAM_DERS_ADI } from "@/data/mufredat/programlar";
import type { StoredGame } from "@/lib/gamesStore";
import { ayOf } from "@/lib/kredi";
import { oyunAlanlari, takipAlanlari, takipPenceresi, takipRaporuHesapla, type KazanimTanimi, type TakipRaporu } from "@/lib/ogrenmeTakibi";
import { getOgrenmeTakibiStore, type OgrenmeTakibiStore } from "@/lib/ogrenmeTakibiStore";

// Öğrenci sonucu oyunu yayınlayan öğretmenin sayaçlarına yazılır (kurallar lib/ogrenmeTakibi.ts). Yan etkidir: hata
// sonucu kaydetmeyi bozmaz, yalnız loglanır. Yayınlayanı bilinmeyen oyun (oturumsuz yayın, bu özellikten önceki
// yayınlar) ve öğretmenin kendi oturumundan gelen deneme oynayışı sayılmaz.
export async function takipSinyali(
  game: Pick<StoredGame, "sahip" | "definition">,
  kod: string,
  oyuncu: string,
  durakYanlislari: Record<string, number>,
  istekSahibi: string | null,
  ttlMs: number,
  now = Date.now(),
  store: OgrenmeTakibiStore = getOgrenmeTakibiStore()
): Promise<void> {
  if (!game.sahip || !game.definition || game.sahip === istekSahibi) return;
  try {
    await store.ogrenciSay(game.sahip, ayOf(now), kod, oyuncu, takipAlanlari(game.definition, durakYanlislari), oyunAlanlari(game.definition), ttlMs);
  } catch (err) {
    console.error("[takip] sonuç sayılamadı", err instanceof Error ? err.message : err);
  }
}

function tanimOf(kod: string): KazanimTanimi | null {
  const k = kazanimBul(kod);
  return k && { metin: k.metin, ders: k.ders, dersAd: PROGRAM_DERS_ADI[k.ders], sinif: k.sinif, uniteId: k.uniteId, uniteAd: k.uniteAd };
}

// Seçilen ay ve önceki iki ayın raporu; çıktı metni, ders ve konu müfredattan eklenir.
export async function takipRaporu(sahip: string, ay: string, store: OgrenmeTakibiStore = getOgrenmeTakibiStore()): Promise<TakipRaporu> {
  const aylar = takipPenceresi(ay);
  return takipRaporuHesapla(aylar, await store.sayaclar(sahip, aylar), tanimOf);
}
