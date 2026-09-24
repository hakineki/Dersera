import { nicknameKey } from "@/lib/gameState";
import { GAME_RETENTION_MS } from "@/lib/gamesStore";
import { getIstatistikStore, type Istatistik } from "@/lib/istatistikStore";
import { getToplulukStore } from "@/lib/toplulukStore";

// Öğrenci puanı 1–5 tam sayıdır.
export const PUAN_MIN = 1;
export const PUAN_MAX = 5;
export const gecerliPuan = (v: unknown): v is number => Number.isInteger(v) && (v as number) >= PUAN_MIN && (v as number) <= PUAN_MAX;

export const ortalama = (toplam: number, sayi: number): number | null => (sayi > 0 ? Math.round((toplam / sayi) * 10) / 10 : null);

export function istatistikOzeti(i: Istatistik) {
  return { ogrenci_sayisi: i.ogrenci, puan_ortalama: ortalama(i.puanToplam, i.puanSayisi), puan_sayisi: i.puanSayisi };
}

// Kütüphane listesi için: okunamazsa herkes için sıfır döner (liste yine gelir).
export async function kutuphaneIstatistikleri(kaynaklar: string[]) {
  const bos = { ogrenci: 0, puanToplam: 0, puanSayisi: 0 };
  try {
    const ist = await getIstatistikStore().istatistikler(kaynaklar);
    return kaynaklar.map((_, i) => istatistikOzeti(ist[i] ?? bos));
  } catch (err) {
    console.error("[istatistik] okunamadı", err instanceof Error ? err.message : err);
    return kaynaklar.map(() => istatistikOzeti(bos));
  }
}

// Yayın anında: oyun kodu kütüphane kaydına bağlanır (yalnız sahibi doğrulanmış kütüphane oyunları).
export async function kodKaynagaBagla(kod: string, kutuphaneKaynagi: string | undefined, expiresAt: number, now = Date.now()) {
  if (!kutuphaneKaynagi) return;
  try {
    await getIstatistikStore().kodBagla(kod, kutuphaneKaynagi, expiresAt + GAME_RETENTION_MS - now);
  } catch (err) {
    console.error("[istatistik] kod bağlanamadı", err instanceof Error ? err.message : err);
  }
}

// Katılımın yan etkisi: kütüphane kaydının öğrenci sayısı ve topluluk kaydının oynanma sayısı artar. Hata katılımı bozmaz.
export async function katilimSay(kod: string): Promise<void> {
  try {
    const kaynak = await getIstatistikStore().kodunKaynagi(kod);
    if (kaynak) await getIstatistikStore().ogrenciEkle(kaynak);
  } catch (err) {
    console.error("[istatistik] öğrenci sayılamadı", err instanceof Error ? err.message : err);
  }
  try {
    const topluluk = getToplulukStore();
    const id = await topluluk.kodunOyunu(kod);
    if (id) await topluluk.oynanmaArtir(id);
  } catch (err) {
    console.error("[topluluk] oynanma sayılamadı", err instanceof Error ? err.message : err);
  }
}

export type PuanSonucu = "kaydedildi" | "zaten-verildi";

// Oyuncu doğrulandıktan sonra çağrılır. Takma ad başına bir oy; toplamlar kütüphane ve topluluk kaydına eklenir.
export async function puanVer(kod: string, nickname: string, puan: number, expiresAt: number, now = Date.now()): Promise<PuanSonucu> {
  const store = getIstatistikStore();
  if (!(await store.oyKaydet(kod, nicknameKey(nickname), expiresAt + GAME_RETENTION_MS - now))) return "zaten-verildi";
  const kaynak = await store.kodunKaynagi(kod);
  if (kaynak) await store.puanEkle(kaynak, puan);
  const topluluk = getToplulukStore();
  const id = await topluluk.kodunOyunu(kod);
  if (id) await topluluk.puanEkle(id, puan);
  return "kaydedildi";
}
