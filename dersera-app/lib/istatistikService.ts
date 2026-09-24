import { createHash } from "crypto";
import { nicknameKey } from "@/lib/gameState";
import { GAME_RETENTION_MS } from "@/lib/gamesStore";
import { gosterilecekOrtalama } from "@/lib/istatistik";
import { getIstatistikStore, type Istatistik } from "@/lib/istatistikStore";
import { getResultsStore } from "@/lib/resultsStore";
import { getToplulukStore } from "@/lib/toplulukStore";

// Tek bir yayın kodu (bir sınıf oturumu) en çok bu kadar öğrenci sayısı ekleyebilir: tek kodla şişirmeye karşı.
export const KOD_BASINA_EN_COK_OGRENCI = 60;

export function istatistikOzeti(i: Istatistik) {
  return { ogrenci_sayisi: i.ogrenci, puan_ortalama: gosterilecekOrtalama(i.puanToplam, i.puanSayisi), puan_sayisi: i.puanSayisi };
}

// Oyuncu kimliği koda göre tuzlanmış takma ad özetidir: takma ad düz metin saklanmaz, oyunlar arasında eşleşmez.
const oyuncuOf = (kod: string, nickname: string) => createHash("sha256").update(`${kod}:${nicknameKey(nickname)}`).digest("hex");

// İsteği yapan oyunun sahibi mi? Öğretmen kendi oyununu kendi oturumuyla oynarsa sayılmaz.
const sahibinKaynagi = (kaynak: string | null, istekSahibi: string | null) => !!(kaynak && istekSahibi && kaynak.startsWith(`${istekSahibi}:`));

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

// Kütüphane kaydı silinince sayaçları da silinir. Hata silmeyi bozmaz.
export async function istatistikleriSil(kaynak: string) {
  try {
    await getIstatistikStore().sil(kaynak);
  } catch (err) {
    console.error("[istatistik] silinemedi", err instanceof Error ? err.message : err);
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

// Sonuç kaydedildikten sonra: oyuncu bu kodda ilk kez bitirdiyse kütüphane öğrenci sayısı ve topluluk oynanma sayısı artar.
// Sahibin kendi oturumu ve kod başına sınırı aşan bitirişler sayılmaz. Hata sonuç kaydını bozmaz.
export async function bitirisSay(kod: string, nickname: string, istekSahibi: string | null, expiresAt: number, now = Date.now()): Promise<void> {
  try {
    const store = getIstatistikStore();
    const kaynak = await store.kodunKaynagi(kod);
    const sonuc = await store.bitirenKaydet(kod, oyuncuOf(kod, nickname), kaynak, !sahibinKaynagi(kaynak, istekSahibi), KOD_BASINA_EN_COK_OGRENCI, expiresAt + GAME_RETENTION_MS - now);
    if (sonuc !== "yeni-sayildi") return;
    const topluluk = getToplulukStore();
    const id = await topluluk.kodunOyunu(kod);
    if (!id) return;
    const olusturan = await topluluk.olusturani(id);
    if (istekSahibi && olusturan === istekSahibi) return;
    await topluluk.oynanmaArtir(id);
    // Kodu yayınlayan öğretmenin bu oyunu sınıfında oynattığının kanıtı (öğretmen puanı uygunluğu); sahip sayılmaz.
    const yayinlayan = await topluluk.kodYayinlayani(kod);
    if (yayinlayan && yayinlayan !== olusturan) await topluluk.ogretmenKullanimArtir(id, yayinlayan);
  } catch (err) {
    console.error("[istatistik] bitiriş sayılamadı", err instanceof Error ? err.message : err);
  }
}

export type PuanSonucu = "kaydedildi" | "zaten-verildi" | "bitirmedi";

// Oyuncu doğrulandıktan sonra çağrılır. Yalnız oyunu bitirmiş (sonucu kaydedilmiş) oyuncu, takma ad başına bir kez oy verir.
// Bitirişi sayılmamış oyuncunun (sahibin oturumu, kod sınırı dışı) oyu kaydedilir ama toplamlara eklenmez.
export async function puanVer(kod: string, nickname: string, puan: number, istekSahibi: string | null, expiresAt: number, now = Date.now()): Promise<PuanSonucu> {
  const store = getIstatistikStore();
  const oyuncu = oyuncuOf(kod, nickname);
  let bitiris = await store.bitirisDurumu(kod, oyuncu);
  // Sonuç kaydedildi ama bitiriş sayımı o an yazılamadıysa: kayıtlı sonuç kanıttır, bitiriş şimdi yazılır.
  if (bitiris === "yok" && (await getResultsStore().has(kod, nickname))) {
    await bitirisSay(kod, nickname, istekSahibi, expiresAt, now);
    bitiris = await store.bitirisDurumu(kod, oyuncu);
  }
  if (bitiris === "yok") return "bitirmedi";
  const kaynak = await store.kodunKaynagi(kod);
  const sayilsin = bitiris === "sayildi" && !sahibinKaynagi(kaynak, istekSahibi);
  if (!(await store.puanKaydet(kod, oyuncu, kaynak, puan, sayilsin, expiresAt + GAME_RETENTION_MS - now))) return "zaten-verildi";
  // Topluluk toplamı yan etkidir: hatası öğrencinin puanını geçersiz kılmasın.
  try {
    const topluluk = getToplulukStore();
    const id = sayilsin ? await topluluk.kodunOyunu(kod) : null;
    if (id && !(istekSahibi && (await topluluk.olusturani(id)) === istekSahibi)) await topluluk.puanEkle(id, puan);
  } catch (err) {
    console.error("[topluluk] puan eklenemedi", err instanceof Error ? err.message : err);
  }
  return "kaydedildi";
}
