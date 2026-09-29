import { kutuphaneSahibi, sifreDogru } from "@/lib/auth";
import type { AuthStore, Hesap } from "@/lib/authStore";
import type { DenetimKaydiStore } from "@/lib/denetimKaydi";
import { istatistikleriSil } from "@/lib/istatistikService";
import type { KoleksiyonStore } from "@/lib/koleksiyonStore";
import { ayOf } from "@/lib/kredi";
import type { KrediStore } from "@/lib/krediStore";
import type { LibraryStore } from "@/lib/libraryStore";
import type { OgrenmeTakibiStore } from "@/lib/ogrenmeTakibiStore";
import type { OkulStore } from "@/lib/okulStore";
import { topluluktanGeriCek } from "@/lib/toplulukPaylasim";
import type { ToplulukStore } from "@/lib/toplulukStore";

// Öğretmenin kendi hesabını silmesi (KVKK md. 7 ve 11). Silinen: hesap ve ad (ad boşa çıkar; bütün oturumlar düşer),
// kütüphane ve istatistikleri, koleksiyonlar, okul üyeliği ve okulda paylaştığı oyunlar, kişisel kredi kayıtları,
// koşul onayı, öğrenme takibi tabloları. Toplulukta yayındaki ya da incelemedeki oyunları geri çekilir. Kopya
// kayıtlarında kimlik ve ad "silindi" olur. Başkalarının oyunlarına verdiği puan ve inceleme kararları kimliksiz
// olarak toplamlarda kalır (hesap ve ad silindiği için kimseyle eşleşmez). Hesap en son silinir: arada hata olursa
// öğretmen tekrar deneyebilir.

export interface HesapSilmeDeps {
  auth: AuthStore;
  okul: OkulStore;
  library: LibraryStore;
  koleksiyon: KoleksiyonStore;
  kredi: KrediStore;
  denetim: DenetimKaydiStore;
  takip: OgrenmeTakibiStore;
  topluluk: ToplulukStore;
  // Platform yöneticisi mi (env listesi): yönetici hesabı buradan silinmez.
  yoneticiMi: (hesap: Hesap) => Promise<boolean>;
}

export type HesapSilmeSonucu = { ok: true } | { ok: false; status: number; error: string };

// Kredi aylık kullanımı 40 gün tutulur (en çok iki ay); öğrenme takibi tabloları 400 gün (en çok 14 ay).
const KREDI_AY = 2;
const TAKIP_AY = 14;

// Bu ay dahil geriye doğru n ay ("YYYY-MM").
export function sonAylar(now: number, n: number): string[] {
  const [y, m] = ayOf(now).split("-").map(Number);
  return Array.from({ length: n }, (_, i) => {
    const t = y * 12 + (m - 1) - i;
    return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, "0")}`;
  });
}

export async function hesabiSil(d: HesapSilmeDeps, hesap: Hesap, sifre: unknown, now = Date.now()): Promise<HesapSilmeSonucu> {
  if (typeof sifre !== "string" || sifre.length === 0 || sifre.length > 200 || !(await sifreDogru(sifre, hesap.sifreOzeti))) {
    return { ok: false, status: 403, error: "Şifre hatalı." };
  }
  if (await d.yoneticiMi(hesap)) {
    return { ok: false, status: 409, error: "Platform yöneticisi hesabı buradan silinemez." };
  }
  const okulId = await d.okul.okulOf(hesap.id);
  if (okulId && (await d.okul.uyeler(okulId)).some((u) => u.hesapId === hesap.id && u.rol === "yonetici")) {
    return { ok: false, status: 409, error: "Okul yöneticisisin: okul ve üyeleri bu hesaba bağlı. Hesabını silmek için bize yaz; okulu kapatalım ya da yöneticiliği devredelim." };
  }
  // Süren bir oyun oluşturma (askıdaki kredi) varken silinirse kredi iadesi yazılamaz.
  if ((await d.kredi.askidakiler(hesap.id)).length > 0) {
    return { ok: false, status: 409, error: "Şu anda bir oyun oluşturuluyor. Birkaç dakika sonra tekrar dene." };
  }

  const sahip = kutuphaneSahibi(hesap);
  if (okulId) {
    for (const p of await d.okul.paylasimlar(okulId)) {
      if (p.paylasan !== hesap.id) continue;
      const tam = await d.okul.paylasim(okulId, p.id);
      if (tam) await d.okul.paylasimKaldir(okulId, { id: tam.id, kaynak: tam.kaynak });
    }
    await d.okul.uyeCikar(okulId, hesap.id);
  }
  for (const id of await d.library.idler(sahip)) {
    // Toplulukta olmayan oyun için 404/409 döner; silmeyi durdurmaz.
    await topluluktanGeriCek(d.topluluk, hesap, id);
    await istatistikleriSil(`${sahip}:${id}`);
    await d.library.remove(sahip, id);
  }
  for (const k of await d.koleksiyon.listele(hesap.id)) await d.koleksiyon.sil(hesap.id, k.id);
  await d.kredi.hesapSil(hesap.id, sonAylar(now, KREDI_AY));
  await d.takip.tablolariSil(sahip, sonAylar(now, TAKIP_AY));
  await d.denetim.hesabiUnut(hesap.id, hesap.kullaniciAdi);
  if (!(await d.auth.hesapSil(hesap.id, hesap.kullaniciAdi))) {
    return { ok: false, status: 409, error: "Hesap bilgisi başka bir oturumda değişti. Sayfayı yenileyip tekrar dene." };
  }
  return { ok: true };
}
