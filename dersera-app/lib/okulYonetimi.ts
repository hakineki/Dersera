import { sifreDogru } from "@/lib/auth";
import type { AuthStore, Hesap } from "@/lib/authStore";
import { ayOf } from "@/lib/kredi";
import type { KrediStore } from "@/lib/krediStore";
import type { Okul } from "@/lib/okul";
import type { OkulStore } from "@/lib/okulStore";
import { sonIslemler, type YonetimIslemi, type YonetimIslemKaydiStore } from "@/lib/yonetimIslemKaydi";

// Platform yöneticisinin okul yönetimi: liste, ayrıntı, okul yöneticiliğini devretme, okulu kapatma. Her değişiklik
// işlem kaydına yazılır. Kapatınca okul kaydı, davet kodu, üyelikler, okul kütüphanesindeki paylaşımlar ve kredi
// havuzu silinir; öğretmen hesapları ve kişisel kütüphaneleri kalır.

export interface OkulYonetimiDeps {
  okul: OkulStore;
  auth: AuthStore;
  kredi: KrediStore;
  islemler: YonetimIslemKaydiStore;
}

type Sonuc<T> = { ok: true; value: T } | { ok: false; status: number; error: string };
const hata = (status: number, error: string) => ({ ok: false as const, status, error });
const YOK = hata(404, "Okul bulunamadı.");
const SON_ISLEM = 30;
const NEDEN_EN_FAZLA = 300;
// Üyeler ve paylaşımlar kaldırılırken araya giren istekler için tekrar sayısı.
const KAPATMA_TUR = 5;

const yoneticiOf = (uyeler: { hesapId: string; rol: string }[]) => uyeler.find((u) => u.rol === "yonetici")?.hesapId ?? null;

export async function okulListesi(d: OkulYonetimiDeps, now = Date.now()) {
  const ids = await d.okul.okulIdleri();
  const okullar = (await d.okul.okullar(ids)).filter((o): o is Okul => !!o);
  const ay = ayOf(now);
  const ayrinti = await Promise.all(okullar.map((o) => Promise.all([d.okul.uyeler(o.id), d.okul.paylasimlar(o.id), d.kredi.okulHavuzu(o.id, ay)])));
  const yoneticiler = ayrinti.map(([uyeler]) => yoneticiOf(uyeler));
  const adlar = await d.auth.kullaniciAdlari(yoneticiler.filter((y): y is string => !!y));
  const ad = new Map(yoneticiler.filter((y): y is string => !!y).map((y, i) => [y, adlar[i] ?? null]));
  const liste = okullar.map((o, i) => {
    const [uyeler, paylasimlar, havuz] = ayrinti[i];
    return {
      id: o.id,
      ad: o.ad,
      olusturma: o.olusturma,
      kapaniyor: !!o.kapaniyor,
      yonetici: yoneticiler[i] ? (ad.get(yoneticiler[i]!) ?? null) : null,
      uyeSayisi: uyeler.length,
      paylasimSayisi: paylasimlar.length,
      havuz: { hak: havuz.hak, kullanilan: havuz.kullanilan },
    };
  });
  liste.sort((a, b) => a.ad.localeCompare(b.ad, "tr"));
  return { okullar: liste, islemler: await sonIslemler(d, SON_ISLEM) };
}

export async function okulAyrintisi(d: OkulYonetimiDeps, okulId: string, now = Date.now()) {
  const o = await d.okul.get(okulId);
  if (!o) return YOK;
  const [uyeler, paylasimlar, havuz] = await Promise.all([d.okul.uyeler(okulId), d.okul.paylasimlar(okulId), d.kredi.okulHavuzu(okulId, ayOf(now))]);
  const adlar = await d.auth.kullaniciAdlari(uyeler.map((u) => u.hesapId));
  const liste = uyeler
    .map((u, i) => ({ hesapId: u.hesapId, kullaniciAdi: adlar[i] ?? null, rol: u.rol, katilma: u.katilma }))
    .sort((a, b) => (a.rol === b.rol ? a.katilma - b.katilma : a.rol === "yonetici" ? -1 : 1));
  return {
    ok: true as const,
    value: {
      id: o.id,
      ad: o.ad,
      olusturma: o.olusturma,
      kapaniyor: !!o.kapaniyor,
      uyeler: liste,
      paylasimSayisi: paylasimlar.length,
      havuz: { hak: havuz.hak, sinir: havuz.sinir, kullanilan: havuz.kullanilan },
    },
  };
}

function nedenOf(v: unknown): Sonuc<string> {
  const n = typeof v === "string" ? v.trim() : "";
  if (n.length < 3) return hata(422, "Gerekçe yaz (en az 3 karakter).");
  if (n.length > NEDEN_EN_FAZLA) return hata(422, `Gerekçe en fazla ${NEDEN_EN_FAZLA} karakter olabilir.`);
  return { ok: true, value: n };
}

// İşlem yapıldıktan sonra yazılır; kayıt hatası işlemi geri almaz, loglanır.
async function kaydet(d: OkulYonetimiDeps, yonetici: Hesap, islem: YonetimIslemi, okul: Okul, hedefId: string, neden: string, now: number): Promise<void> {
  try {
    await d.islemler.ekle({ tarih: now, yoneticiId: yonetici.id, islem, hedefId, neden, okul: { id: okul.id, ad: okul.ad } });
  } catch (err) {
    console.error("[yonetim] işlem kaydı yazılamadı", islem, okul.id, err instanceof Error ? err.message : err);
  }
}

// Okul yöneticiliğini okulun bir öğretmen üyesine devreder; eski yönetici öğretmen üye olarak kalır.
export async function yoneticiDevret(d: OkulYonetimiDeps, yonetici: Hesap, okulId: string, yeniGirdi: unknown, nedenGirdi: unknown, now = Date.now()): Promise<Sonuc<{ yonetici: string | null }>> {
  const neden = nedenOf(nedenGirdi);
  if (!neden.ok) return neden;
  const o = await d.okul.get(okulId);
  if (!o || o.kapaniyor) return YOK;
  const uyeler = await d.okul.uyeler(okulId);
  const eski = yoneticiOf(uyeler);
  const yeni = uyeler.find((u) => u.hesapId === yeniGirdi);
  if (!yeni) return hata(422, "Yeni yönetici okulun bir öğretmen üyesi olmalı.");
  if (yeni.rol === "yonetici") return hata(409, "Bu öğretmen zaten okulun yöneticisi.");
  if (!eski || !(await d.okul.yoneticiDevret(okulId, eski, yeni.hesapId))) {
    return hata(409, "Okul üyeleri bu arada değişti. Sayfayı yenileyip tekrar dene.");
  }
  await kaydet(d, yonetici, "okul-devret", o, yeni.hesapId, neden.value, now);
  const [ad] = await d.auth.kullaniciAdlari([yeni.hesapId]);
  return { ok: true, value: { yonetici: ad ?? null } };
}

// Okulu kapatır. Onay: okulun adı yazılır ve yönetici kendi şifresini girer. Önce kayıt "kapanıyor" olur (davet kodu
// silinir, katılma ve paylaşma kapanır), sonra üyelikler ve paylaşımlar kaldırılır, havuz sıfırlanır, en son okul
// kaydı silinir. Arada hata olursa okul listede "kapatılıyor" kalır ve kapatma yeniden çalıştırılabilir.
export async function okulKapat(d: OkulYonetimiDeps, yonetici: Hesap, okulId: string, onayAdi: unknown, sifre: unknown, nedenGirdi: unknown, now = Date.now()): Promise<Sonuc<{ uye: number; paylasim: number }>> {
  if (typeof sifre !== "string" || sifre.length === 0 || sifre.length > 200 || !(await sifreDogru(sifre, yonetici.sifreOzeti))) {
    return hata(403, "Şifren hatalı.");
  }
  const neden = nedenOf(nedenGirdi);
  if (!neden.ok) return neden;
  const o = await d.okul.get(okulId);
  if (!o) return YOK;
  if (typeof onayAdi !== "string" || onayAdi.trim().toLocaleLowerCase("tr-TR") !== o.ad.toLocaleLowerCase("tr-TR")) {
    return hata(422, "Onay için okulun adını aynen yaz.");
  }
  if (!o.kapaniyor && !(await d.okul.kapatmaBaslat(o))) return hata(409, "Okul bilgisi bu arada değişti. Sayfayı yenileyip tekrar dene.");

  let uye = 0;
  let paylasim = 0;
  for (let tur = 0; tur < KAPATMA_TUR; tur++) {
    const [uyeler, ozetler] = await Promise.all([d.okul.uyeler(okulId), d.okul.paylasimlar(okulId)]);
    if (uyeler.length === 0 && ozetler.length === 0) break;
    for (const u of uyeler) if (await d.okul.uyeCikar(okulId, u.hesapId)) uye++;
    for (const p of ozetler) {
      const tam = await d.okul.paylasim(okulId, p.id);
      if (tam && (await d.okul.paylasimKaldir(okulId, { id: tam.id, kaynak: tam.kaynak }))) paylasim++;
    }
  }
  await d.kredi.okulHakYaz(okulId, 0);
  await d.kredi.okulSinirYaz(okulId, 0);
  await d.okul.kapatmaBitir(okulId);
  await kaydet(d, yonetici, "okul-kapat", o, o.olusturan, neden.value, now);
  return { ok: true, value: { uye, paylasim } };
}
