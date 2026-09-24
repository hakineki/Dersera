import { randomInt, randomUUID } from "crypto";
import { kutuphaneSahibi } from "@/lib/auth";
import type { AuthStore, Hesap } from "@/lib/authStore";
import { parseComposerDefinition } from "@/lib/composer/adapter";
import { duzenlemeBaglami } from "@/lib/composer/duzenleme";
import { yonetisimDegerlendir, type YonetisimSonucu } from "@/lib/composer/yonetisim";
import { yzDenetle } from "@/lib/composer/yzDenetimService";
import { limitAsildi, limitKaydet } from "@/lib/composer/rateLimit";
import type { IstatistikStore } from "@/lib/istatistikStore";
import { ayOf, OKUL_HAVUZU } from "@/lib/kredi";
import type { KrediStore } from "@/lib/krediStore";
import type { LibraryStore } from "@/lib/libraryStore";
import { DAVET_ALFABE, DAVET_UZUNLUK, davetKoduNormal, OKUL, okulAdiNormal, type Okul, type OkulRolu, type PaylasimOzeti } from "@/lib/okul";
import type { OkulStore } from "@/lib/okulStore";

// Okul katmanı kuralları (lib/okul.ts). Yetki: okul yöneticisi davet kodunu görür/yeniler, üye çıkarır, panoyu görür,
// her paylaşımı kaldırabilir; öğretmen yalnız kendi paylaşımını kaldırır ve okuldan ayrılabilir. Yönetici ayrılamaz
// ve çıkarılamaz (okul yöneticisiz kalmasın). Üye olmayan hiçbir okul verisini göremez.

const SAAT_MS = 60 * 60 * 1000;
// Davet kodu tahminine karşı: hesap başına saatte en çok bu kadar hatalı kod denemesi.
export const HATALI_DAVET_SAATLIK = 10;

const davetKoduUret = () => Array.from({ length: DAVET_UZUNLUK }, () => DAVET_ALFABE[randomInt(DAVET_ALFABE.length)]).join("");

type Sonuc<T> = ({ ok: true } & T) | { ok: false; status: number; error: string; yonetisim?: YonetisimSonucu };

export interface OkulDeps {
  okul: OkulStore;
  auth: AuthStore;
  library: LibraryStore;
  istatistik: IstatistikStore;
  kredi: KrediStore;
}

const UYE_DEGIL: Sonuc<never> = { ok: false, status: 404, error: "Bir okula üye değilsin." };
const YONETICI_DEGIL: Sonuc<never> = { ok: false, status: 403, error: "Bu işlem yalnız okul yöneticisine açık." };

// Hesabın okulu ve rolü; üye değilse null.
async function uyelik(d: OkulDeps, hesap: Hesap): Promise<{ okul: Okul; rol: OkulRolu } | null> {
  const okulId = await d.okul.okulOf(hesap.id);
  if (!okulId) return null;
  const [okul, uyeler] = await Promise.all([d.okul.get(okulId), d.okul.uyeler(okulId)]);
  const uye = uyeler.find((u) => u.hesapId === hesap.id);
  return okul && uye ? { okul, rol: uye.rol } : null;
}

export interface OkulumYaniti {
  okul: { ad: string; uyeSayisi: number; davetKodu?: string } | null;
  rol?: OkulRolu;
}

export async function okulum(d: OkulDeps, hesap: Hesap): Promise<OkulumYaniti> {
  const u = await uyelik(d, hesap);
  if (!u) return { okul: null };
  const uyeSayisi = (await d.okul.uyeler(u.okul.id)).length;
  // Davet kodu yalnız yöneticiye gösterilir.
  return { okul: { ad: u.okul.ad, uyeSayisi, ...(u.rol === "yonetici" && { davetKodu: u.okul.davetKodu }) }, rol: u.rol };
}

export async function okulOlustur(d: OkulDeps, hesap: Hesap, adGirdi: unknown, now = Date.now()): Promise<Sonuc<OkulumYaniti>> {
  const ad = okulAdiNormal(adGirdi);
  if (!ad) return { ok: false, status: 422, error: `Okul adı ${OKUL.adEnAz}–${OKUL.adEnCok} karakter olmalı.` };
  for (let deneme = 0; deneme < 3; deneme++) {
    const okul: Okul = { id: randomUUID(), ad, olusturma: now, olusturan: hesap.id, davetKodu: davetKoduUret() };
    try {
      if (!(await d.okul.olustur(okul, { hesapId: hesap.id, rol: "yonetici", katilma: now }))) return { ok: false, status: 409, error: "Zaten bir okula üyesin." };
      return { ok: true, ...(await okulum(d, hesap)) };
    } catch (err) {
      // Davet kodu çakışması: yeni kodla yeniden denenir.
      if (deneme === 2) throw err;
    }
  }
  throw new Error("Okul oluşturulamadı");
}

export async function okulaKatil(d: OkulDeps, hesap: Hesap, kodGirdi: unknown, now = Date.now()): Promise<Sonuc<OkulumYaniti>> {
  const sinir = `okul:katil-hata:${hesap.id}`;
  if (await limitAsildi(sinir, SAAT_MS, HATALI_DAVET_SAATLIK)) return { ok: false, status: 429, error: "Çok fazla hatalı kod denendi. Bir saat sonra tekrar deneyin." };
  const kod = davetKoduNormal(kodGirdi);
  const okulId = kod ? await d.okul.davettenOkul(kod) : null;
  if (!okulId) {
    await limitKaydet(sinir, SAAT_MS);
    return { ok: false, status: 404, error: "Davet kodu geçersiz." };
  }
  const r = await d.okul.katil(okulId, { hesapId: hesap.id, rol: "ogretmen", katilma: now });
  if (r === "zaten-uye") return { ok: false, status: 409, error: "Zaten bir okula üyesin; önce ondan ayrıl." };
  if (r === "dolu") return { ok: false, status: 422, error: `Okul en çok ${OKUL.enCokUye} öğretmene açık.` };
  return { ok: true, ...(await okulum(d, hesap)) };
}

export async function okuldanAyril(d: OkulDeps, hesap: Hesap): Promise<Sonuc<object>> {
  const u = await uyelik(d, hesap);
  if (!u) return UYE_DEGIL;
  if (u.rol === "yonetici") return { ok: false, status: 422, error: "Okul yöneticisi okuldan ayrılamaz." };
  if (!(await d.okul.uyeCikar(u.okul.id, hesap.id))) return UYE_DEGIL;
  return { ok: true };
}

export async function uyeCikar(d: OkulDeps, hesap: Hesap, hedefId: string): Promise<Sonuc<object>> {
  const u = await uyelik(d, hesap);
  if (!u) return UYE_DEGIL;
  if (u.rol !== "yonetici") return YONETICI_DEGIL;
  const hedef = (await d.okul.uyeler(u.okul.id)).find((x) => x.hesapId === hedefId);
  if (!hedef) return { ok: false, status: 404, error: "Bu öğretmen okulun üyesi değil." };
  if (hedef.rol === "yonetici") return { ok: false, status: 422, error: "Okul yöneticisi çıkarılamaz." };
  if (!(await d.okul.uyeCikar(u.okul.id, hedefId))) return { ok: false, status: 404, error: "Bu öğretmen okulun üyesi değil." };
  return { ok: true };
}

export async function davetYenile(d: OkulDeps, hesap: Hesap): Promise<Sonuc<{ davetKodu: string }>> {
  const u = await uyelik(d, hesap);
  if (!u) return UYE_DEGIL;
  if (u.rol !== "yonetici") return YONETICI_DEGIL;
  for (let deneme = 0; deneme < 3; deneme++) {
    const kod = davetKoduUret();
    const r = await d.okul.davetYenile(u.okul, kod);
    if (r === "ok") return { ok: true, davetKodu: kod };
    // Eşzamanlı bir yenileme kazandı: onun kodu geçerlidir, ikinci kod üretilmez.
    if (r === "degisti") {
      const guncel = await d.okul.get(u.okul.id);
      if (guncel) return { ok: true, davetKodu: guncel.davetKodu };
    }
  }
  throw new Error("Davet kodu yenilenemedi");
}

// ── Okul içi paylaşım ─────────────────────────────────────────────────────────

export async function okullaPaylas(d: OkulDeps, hesap: Hesap, kutuphaneId: string, now = Date.now()): Promise<Sonuc<{ id: string }>> {
  const u = await uyelik(d, hesap);
  if (!u) return UYE_DEGIL;
  const sahip = kutuphaneSahibi(hesap);
  const kayit = await d.library.get(sahip, kutuphaneId);
  if (!kayit) return { ok: false, status: 404, error: "Oyun kütüphanede bulunamadı." };
  const r = parseComposerDefinition(kayit.definition, kayit.dersler);
  if (!r.ok) return { ok: false, status: r.status, error: r.error };
  if (!r.validation.gecerli) return { ok: false, status: 422, error: "Oyun doğrulamadan geçmedi; önce düzeltin." };
  // Okul içi paylaşım topluluk incelemesinden geçmez; içerik kapıları (çocuk güvenliği dahil) uygulanır.
  const yonetisim = yonetisimDegerlendir(r.definition, r.validation, await yzDenetle(r.definition, { sinirAnahtari: `hesap:${hesap.id}` }));
  if (yonetisim.karar === "BLOCK") return { ok: false, status: 422, error: "Oyun içerik denetiminden geçmedi; okulla paylaşılamaz.", yonetisim };
  const m = r.definition.meta;
  const id = randomUUID();
  const sonuc = await d.okul.paylas(u.okul.id, {
    id,
    kaynak: `${sahip}:${kutuphaneId}`,
    paylasan: hesap.id,
    baslik: m.baslik,
    sinif: m.sinif,
    ders: m.ders,
    konu: m.konu,
    sure_dk: m.sure_dk,
    tarih: now,
    definition: r.definition,
    dersler: r.dersler,
  });
  if (sonuc === "dolu") return { ok: false, status: 422, error: `Okul kütüphanesi en çok ${OKUL.enCokPaylasim} oyun alır; önce eskileri kaldırın.` };
  return { ok: true, id };
}

export type PaylasimListesiOgesi = Omit<PaylasimOzeti, "paylasan"> & { paylasanAd: string; kaldirabilir: boolean };

// Kullanıcı adları tek okumada (üye sayısından bağımsız).
const adlar = async (d: OkulDeps, idler: string[]) => {
  const tekil = [...new Set(idler)];
  const okunan = await d.auth.kullaniciAdlari(tekil);
  const m = new Map(tekil.map((id, i) => [id, okunan[i] ?? "ayrılmış öğretmen"]));
  return (id: string) => m.get(id)!;
};

export async function okulPaylasimlari(d: OkulDeps, hesap: Hesap): Promise<Sonuc<{ oyunlar: PaylasimListesiOgesi[] }>> {
  const u = await uyelik(d, hesap);
  if (!u) return UYE_DEGIL;
  const ozetler = (await d.okul.paylasimlar(u.okul.id)).sort((a, b) => b.tarih - a.tarih);
  const ad = await adlar(d, ozetler.map((o) => o.paylasan));
  return {
    ok: true,
    oyunlar: ozetler.map(({ paylasan, ...o }) => ({ ...o, paylasanAd: ad(paylasan), kaldirabilir: paylasan === hesap.id || u.rol === "yonetici" })),
  };
}

// "Kullan": tam oyun (cevaplar dahil) yalnız aynı okulun üyesine; composer'da kopya olarak açılır.
export async function okulPaylasimDetayi(d: OkulDeps, hesap: Hesap, id: string) {
  const u = await uyelik(d, hesap);
  if (!u) return UYE_DEGIL;
  const p = await d.okul.paylasim(u.okul.id, id);
  if (!p) return { ok: false as const, status: 404, error: "Oyun bulunamadı." };
  const { definition, dersler, ...ozet } = p;
  return {
    ok: true as const,
    oyun: { baslik: ozet.baslik, sinif: ozet.sinif, ders: ozet.ders, konu: ozet.konu, sure_dk: ozet.sure_dk, definition, dersler },
    ...duzenlemeBaglami(p.sinif, dersler, definition),
  };
}

export async function okulPaylasimKaldir(d: OkulDeps, hesap: Hesap, id: string): Promise<Sonuc<object>> {
  const u = await uyelik(d, hesap);
  if (!u) return UYE_DEGIL;
  const p = await d.okul.paylasim(u.okul.id, id);
  if (!p) return { ok: false, status: 404, error: "Oyun bulunamadı." };
  if (p.paylasan !== hesap.id && u.rol !== "yonetici") return { ok: false, status: 403, error: "Yalnız paylaşan öğretmen ya da okul yöneticisi kaldırabilir." };
  await d.okul.paylasimKaldir(u.okul.id, p);
  return { ok: true };
}

// Kütüphane listesi için: öğretmen bir okulun üyesiyse her kaydın okuldaki paylaşım kimliği.
export async function kutuphaneOkulDurumu(d: Pick<OkulDeps, "okul">, hesap: Hesap, kaynaklar: string[]): Promise<{ okul: { ad: string } | null; paylasimlar: (string | null)[] }> {
  const okulId = await d.okul.okulOf(hesap.id);
  const okul = okulId ? await d.okul.get(okulId) : null;
  if (!okul) return { okul: null, paylasimlar: kaynaklar.map(() => null) };
  return { okul: { ad: okul.ad }, paylasimlar: await d.okul.kaynakPaylasimlari(okul.id, kaynaklar) };
}

// ── Okul panosu (yönetici) ────────────────────────────────────────────────────

export interface PanoOgretmeni {
  hesapId: string;
  kullaniciAdi: string;
  rol: OkulRolu;
  katilma: number;
  kutuphaneOyun: number;
  paylasim: number;
  ogrenci: number;
  puanOrtalama: number | null;
  // Bu ay okul kredi havuzundan kullandığı.
  havuzdan: number;
}

// Okulun bu ayki kredi havuzu (havuz atanmamışsa null). sinir: öğretmen başına aylık sınır (yoksa null).
export interface PanoHavuzu {
  ay: string;
  hak: number;
  kullanilan: number;
  kalan: number;
  sinir: number | null;
}

export interface OkulPanosu {
  ogretmenler: PanoOgretmeni[];
  toplam: { ogretmen: number; kutuphaneOyun: number; paylasim: number; ogrenci: number };
  havuz: PanoHavuzu | null;
}

export async function okulPanosu(d: OkulDeps, hesap: Hesap, now = Date.now()): Promise<Sonuc<OkulPanosu>> {
  const u = await uyelik(d, hesap);
  if (!u) return UYE_DEGIL;
  if (u.rol !== "yonetici") return YONETICI_DEGIL;
  const ay = ayOf(now);
  const [uyeler, paylasimlar, havuz] = await Promise.all([d.okul.uyeler(u.okul.id), d.okul.paylasimlar(u.okul.id), d.kredi.okulHavuzu(u.okul.id, ay)]);
  // Üye sayısından bağımsız sabit sayıda okuma: adlar, tüm kütüphane kimlikleri ve tüm istatistikler birer toplu çağrı.
  const sahipler = uyeler.map((x) => `hesap:${x.hesapId}`);
  const [ad, idListeleri] = await Promise.all([adlar(d, uyeler.map((x) => x.hesapId)), d.library.idlerToplu(sahipler)]);
  const kaynaklar = idListeleri.flatMap((idler, i) => idler.map((id) => `${sahipler[i]}:${id}`));
  const tumIst = await d.istatistik.istatistikler(kaynaklar);
  let bas = 0;
  const ogretmenler = uyeler.map((x, i) => {
    const idler = idListeleri[i];
    // Öğrenci puanı gösterimi kovalıdır (lib/istatistik.ts); pano da gösterilen değerleri toplar.
    const ist = tumIst.slice(bas, (bas += idler.length));
    const ogrenci = ist.reduce((a, s) => a + s.ogrenci, 0);
    const puanToplam = ist.reduce((a, s) => a + s.puanToplam, 0);
    const puanSayisi = ist.reduce((a, s) => a + s.puanSayisi, 0);
    return {
      hesapId: x.hesapId,
      kullaniciAdi: ad(x.hesapId),
      rol: x.rol,
      katilma: x.katilma,
      kutuphaneOyun: idler.length,
      paylasim: paylasimlar.filter((p) => p.paylasan === x.hesapId).length,
      ogrenci,
      puanOrtalama: puanSayisi ? Math.round((puanToplam / puanSayisi) * 10) / 10 : null,
      havuzdan: havuz.ogretmenler[x.hesapId] ?? 0,
    };
  });
  ogretmenler.sort((a, b) => (a.rol === b.rol ? a.katilma - b.katilma : a.rol === "yonetici" ? -1 : 1));
  return {
    ok: true,
    ogretmenler,
    toplam: {
      ogretmen: ogretmenler.length,
      kutuphaneOyun: ogretmenler.reduce((a, o) => a + o.kutuphaneOyun, 0),
      paylasim: paylasimlar.length,
      ogrenci: ogretmenler.reduce((a, o) => a + o.ogrenci, 0),
    },
    havuz:
      havuz.hak > 0
        ? { ay, hak: havuz.hak, kullanilan: havuz.kullanilan, kalan: Math.max(0, havuz.hak - havuz.kullanilan), sinir: havuz.sinir > 0 ? havuz.sinir : null }
        : null,
  };
}

// Tam sayı ve [0, enCok] aralığında değilse null.
const tamSayi = (v: unknown, enCok: number): number | null => (typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= enCok ? v : null);

// Okul yöneticisi: öğretmen başına aylık havuz sınırı (0: sınır yok). Havuz atanmamış okulda da ayarlanabilir.
export async function okulKrediSiniri(d: OkulDeps, hesap: Hesap, sinirGirdi: unknown): Promise<Sonuc<{ sinir: number | null }>> {
  const u = await uyelik(d, hesap);
  if (!u) return UYE_DEGIL;
  if (u.rol !== "yonetici") return YONETICI_DEGIL;
  const sinir = tamSayi(sinirGirdi, OKUL_HAVUZU.sinirEnCok);
  if (sinir === null) return { ok: false, status: 422, error: `Sınır 0–${OKUL_HAVUZU.sinirEnCok} arasında bir tam sayı olmalı (0: sınır yok).` };
  await d.kredi.okulSinirYaz(u.okul.id, sinir);
  return { ok: true, sinir: sinir > 0 ? sinir : null };
}

// ── Okul kredi havuzu (platform yöneticisi; yetki route'ta denetlenir) ──────────

export interface HavuzluOkul {
  okulId: string;
  ad: string;
  uyeSayisi?: number;
  hak: number;
  kullanilan: number;
}

const OKUL_ID = /^[0-9a-f-]{36}$/;

export async function havuzListesi(d: Pick<OkulDeps, "okul" | "kredi">, now = Date.now()): Promise<{ ay: string; okullar: HavuzluOkul[] }> {
  const ay = ayOf(now);
  const havuzlar = await d.kredi.okulHavuzlari(ay);
  const okullar = await d.okul.okullar(havuzlar.map((h) => h.okulId));
  return {
    ay,
    okullar: havuzlar
      .map((h, i) => ({ okulId: h.okulId, ad: okullar[i]?.ad ?? "(silinmiş okul)", hak: h.hak, kullanilan: h.kullanilan }))
      .sort((a, b) => a.ad.localeCompare(b.ad, "tr")),
  };
}

// Okul yöneticisinin verdiği davet koduyla okulu bulur.
export async function havuzOkulBul(d: Pick<OkulDeps, "okul" | "kredi">, kodGirdi: unknown, now = Date.now()): Promise<Sonuc<{ okul: HavuzluOkul }>> {
  const kod = davetKoduNormal(kodGirdi);
  const okulId = kod ? await d.okul.davettenOkul(kod) : null;
  const okul = okulId ? await d.okul.get(okulId) : null;
  if (!okul) return { ok: false, status: 404, error: "Bu davet koduyla okul bulunamadı." };
  const [uyeler, havuz] = await Promise.all([d.okul.uyeler(okul.id), d.kredi.okulHavuzu(okul.id, ayOf(now))]);
  return { ok: true, okul: { okulId: okul.id, ad: okul.ad, uyeSayisi: uyeler.length, hak: havuz.hak, kullanilan: havuz.kullanilan } };
}

// Aylık havuz hakkını yazar (0: havuzu kaldırır). Her ayın kullanımı ayrı sayılır; hak değişikliği o aydan geçerlidir.
export async function havuzAta(
  d: Pick<OkulDeps, "okul" | "kredi">,
  yoneticiAdi: string,
  okulIdGirdi: unknown,
  hakGirdi: unknown,
  now = Date.now()
): Promise<Sonuc<{ okul: HavuzluOkul }>> {
  const hak = tamSayi(hakGirdi, OKUL_HAVUZU.hakEnCok);
  if (hak === null) return { ok: false, status: 422, error: `Aylık havuz 0–${OKUL_HAVUZU.hakEnCok} arasında bir tam sayı olmalı (0: havuzu kaldır).` };
  const okul = typeof okulIdGirdi === "string" && OKUL_ID.test(okulIdGirdi) ? await d.okul.get(okulIdGirdi) : null;
  if (!okul) return { ok: false, status: 404, error: "Okul bulunamadı." };
  await d.kredi.okulHakYaz(okul.id, hak);
  // Denetim izi: kim, hangi okula, ne kadar.
  console.info(`[kredi] okul havuzu ayarlandı okul=${okul.id} hak=${hak} yonetici=${yoneticiAdi}`);
  const havuz = await d.kredi.okulHavuzu(okul.id, ayOf(now));
  return { ok: true, okul: { okulId: okul.id, ad: okul.ad, hak: havuz.hak, kullanilan: havuz.kullanilan } };
}
