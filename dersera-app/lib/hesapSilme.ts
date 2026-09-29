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
import { durumOf } from "@/lib/topluluk";
import type { ToplulukStore } from "@/lib/toplulukStore";

// Öğretmenin kendi hesabını silmesi (KVKK md. 7 ve 11). Silinen: hesap ve ad (ad boşa çıkar), kütüphane ve
// istatistikleri, koleksiyonlar, okul üyeliği ve bütün okullarda (ayrıldıkları dahil) paylaştığı oyunlar, kişisel
// kredi kayıtları, koşul onayı, öğrenme takibi tabloları. Toplulukta açtığı bütün kayıtlardan yayındaki ya da
// incelemedeki olanlar geri çekilir (kütüphaneden silinmiş olanlar ve önceki sürümler dahil). Kopya kayıtlarında
// kimlik ve ad "silindi" olur. Başkalarının oyunlarına verdiği puan, inceleme kararı ve notu kimliksiz kalır (hesap
// ve ad silindiği için kimseyle eşleşmez).
// Önce hesabın sürümü artırılır: diğer cihaz ve sekmelerdeki oturumlar hemen düşer, silme sürerken yeni veri
// yazamazlar. Hesap en son silinir: arada hata olursa öğretmen yeniden giriş yapıp tekrar deneyebilir.

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
  return hesapVerileriniSil(d, hesap, "kendisi", now);
}

const ENGEL_MESAJLARI = {
  kendisi: {
    yonetici: "Platform yöneticisi hesabı buradan silinemez.",
    okulYoneticisi: "Okul yöneticisisin: okul ve üyeleri bu hesaba bağlı. Hesabını silmek için bize yaz; okulu kapatalım ya da yöneticiliği devredelim.",
    askidaKredi: "Şu anda bir oyun oluşturuluyor. Birkaç dakika sonra tekrar dene.",
    degisti: "Hesap bilgisi başka bir oturumda değişti. Sayfayı yenileyip tekrar dene.",
  },
  yonetici: {
    yonetici: "Platform yöneticisi hesabı silinemez.",
    okulYoneticisi: "Bu öğretmen bir okulun yöneticisi: önce okulun yöneticiliğini devret ya da okulu kapat.",
    askidaKredi: "Öğretmenin şu anda süren bir oyun oluşturması var. Birkaç dakika sonra tekrar dene.",
    degisti: "Hesap bilgisi bu arada değişti. Sayfayı yenileyip tekrar dene.",
  },
} as const;

// Silmenin kendisi: öğretmen kendi hesabını (şifreyle, yukarıda) ya da platform yöneticisi bir öğretmeni siler.
export async function hesapVerileriniSil(d: HesapSilmeDeps, hesap: Hesap, kim: keyof typeof ENGEL_MESAJLARI, now = Date.now()): Promise<HesapSilmeSonucu> {
  const m = ENGEL_MESAJLARI[kim];
  if (await d.yoneticiMi(hesap)) return { ok: false, status: 409, error: m.yonetici };
  const okulId = await d.okul.okulOf(hesap.id);
  if (okulId && (await d.okul.uyeler(okulId)).some((u) => u.hesapId === hesap.id && u.rol === "yonetici")) {
    return { ok: false, status: 409, error: m.okulYoneticisi };
  }
  // Süren bir oyun oluşturma (askıdaki kredi) varken silinirse kredi iadesi yazılamaz.
  if ((await d.kredi.askidakiler(hesap.id)).length > 0) return { ok: false, status: 409, error: m.askidaKredi };

  // Güncel kayıt yeniden okunur: bu arada başka sekmede değişen şifre eski özetle ezilmez.
  const guncel = await d.auth.hesap(hesap.id);
  if (!guncel || guncel.kullaniciAdi !== hesap.kullaniciAdi) return { ok: false, status: 409, error: m.degisti };
  await d.auth.sifreGuncelle({ ...guncel, surum: guncel.surum + 1 });

  const sahip = kutuphaneSahibi(hesap);
  for (const { okulId: o, paylasim } of await d.okul.hesabinPaylasimlari(hesap.id)) {
    await d.okul.paylasimKaldir(o, { id: paylasim.id, kaynak: paylasim.kaynak });
  }
  if (okulId) await d.okul.uyeCikar(okulId, hesap.id);
  for (const id of await d.topluluk.olusturanKayitlari(sahip)) {
    const k = await d.topluluk.get(id);
    if (!k || k.olusturan !== sahip) continue;
    const durum = durumOf(k);
    // Atomik: bu arada onaylanan ya da reddedilen kayıt için geçiş olmaz.
    if ((durum === "inceleme" || durum === "yayinda") && (await d.topluluk.durumGecis(id, ["inceleme", "yayinda"], "geri-cekildi", durum))) {
      await d.topluluk.kuyruktanCikar(id);
    }
  }
  for (const id of await d.library.idler(sahip)) {
    await istatistikleriSil(`${sahip}:${id}`);
    await d.library.remove(sahip, id);
  }
  for (const k of await d.koleksiyon.listele(hesap.id)) await d.koleksiyon.sil(hesap.id, k.id);
  await d.kredi.hesapSil(hesap.id, sonAylar(now, KREDI_AY));
  await d.takip.tablolariSil(sahip, sonAylar(now, TAKIP_AY));
  await d.denetim.hesabiUnut(hesap.id);
  if (!(await d.auth.hesapSil(hesap.id, hesap.kullaniciAdi))) {
    return { ok: false, status: 409, error: "Hesap bilgisi başka bir oturumda değişti. Sayfayı yenileyip tekrar dene." };
  }
  return { ok: true };
}
