import { kutuphaneSahibi, sifreDogru } from "@/lib/auth";
import type { Hesap } from "@/lib/authStore";
import { hesapVerileriniSil, type HesapSilmeDeps } from "@/lib/hesapSilme";
import { ayOf, KREDI_KURALLARI } from "@/lib/kredi";
import { sonIslemler, type YonetimIslemi, type YonetimIslemKaydiStore } from "@/lib/yonetimIslemKaydi";

// Platform yöneticisinin öğretmen yönetimi: arama, ayrıntı, askıya alma / geri açma, hesabı silme. Her değişiklik
// işlem kaydına yazılır. Yönetici kendini ve başka platform yöneticisini askıya alamaz, silemez.

export interface OgretmenYonetimiDeps extends HesapSilmeDeps {
  islemler: YonetimIslemKaydiStore;
}

export type Sonuc<T> = { ok: true; value: T } | { ok: false; status: number; error: string };
const hata = (status: number, error: string) => ({ ok: false as const, status, error });

export const LISTE_SINIRI = 100;
export const NEDEN_EN_FAZLA = 300;
export const SON_ISLEM = 30;

export interface OgretmenSatiri {
  id: string;
  kullaniciAdi: string;
  olusturma: number;
  askida: boolean;
  okulAdi: string | null;
}

export async function ogretmenListesi(d: OgretmenYonetimiDeps, sorguGirdi: unknown) {
  const sorgu = typeof sorguGirdi === "string" ? sorguGirdi.trim().toLocaleLowerCase("tr-TR").slice(0, 40) : "";
  const hepsi = await d.auth.hesaplar();
  const eslesen = (sorgu ? hepsi.filter((h) => h.kullaniciAdi.includes(sorgu)) : hepsi).sort((a, b) => b.olusturma - a.olusturma);
  const sayfa = eslesen.slice(0, LISTE_SINIRI);
  const okulIdler = await Promise.all(sayfa.map((h) => d.okul.okulOf(h.id)));
  const benzersiz = [...new Set(okulIdler.filter((o): o is string => !!o))];
  const okullar = benzersiz.length ? await d.okul.okullar(benzersiz) : [];
  const okulAdi = new Map(benzersiz.map((id, i) => [id, okullar[i]?.ad ?? null]));
  const ogretmenler: OgretmenSatiri[] = sayfa.map((h, i) => ({
    id: h.id,
    kullaniciAdi: h.kullaniciAdi,
    olusturma: h.olusturma,
    askida: !!h.aski?.askida,
    okulAdi: okulIdler[i] ? (okulAdi.get(okulIdler[i]!) ?? null) : null,
  }));
  return { toplam: hepsi.length, eslesen: eslesen.length, ogretmenler, islemler: await sonIslemler(d, SON_ISLEM) };
}

export async function ogretmenAyrintisi(d: OgretmenYonetimiDeps, id: string, now = Date.now()) {
  const h = await d.auth.hesap(id);
  if (!h) return hata(404, "Öğretmen bulunamadı.");
  const sahip = kutuphaneSahibi(h);
  const okulId = await d.okul.okulOf(h.id);
  const [okul, uyeler, kredi, oyunSayisi, toplulukKayitlari, platformYoneticisi] = await Promise.all([
    okulId ? d.okul.get(okulId) : null,
    okulId ? d.okul.uyeler(okulId) : [],
    d.kredi.oku(h.id, ayOf(now), 0),
    d.library.count(sahip),
    d.topluluk.olusturanKayitlari(sahip),
    d.yoneticiMi(h),
  ]);
  return {
    ok: true as const,
    value: {
      id: h.id,
      kullaniciAdi: h.kullaniciAdi,
      olusturma: h.olusturma,
      aski: h.aski ?? null,
      platformYoneticisi,
      okul: okul ? { ad: okul.ad, rol: uyeler.find((u) => u.hesapId === h.id)?.rol ?? "ogretmen" } : null,
      kredi: { aylikKalan: Math.max(0, KREDI_KURALLARI.aylikHak - kredi.kullanilan), aylikHak: KREDI_KURALLARI.aylikHak, kazanilan: kredi.kazanilan },
      oyunSayisi,
      toplulukKayitSayisi: toplulukKayitlari.length,
    },
  };
}

// Hedef hesap: yok 404, kendisi ya da platform yöneticisi 409.
async function hedefHesap(d: OgretmenYonetimiDeps, yonetici: Hesap, id: string): Promise<Sonuc<Hesap>> {
  if (id === yonetici.id) return hata(409, "Kendi hesabında bu işlemi yapamazsın.");
  const h = await d.auth.hesap(id);
  if (!h) return hata(404, "Öğretmen bulunamadı.");
  if (await d.yoneticiMi(h)) return hata(409, "Platform yöneticisi hesabında bu işlem yapılamaz.");
  return { ok: true, value: h };
}

function nedenOf(v: unknown, zorunlu: boolean): Sonuc<string> {
  const n = typeof v === "string" ? v.trim() : "";
  if (zorunlu && n.length < 3) return hata(422, "Gerekçe yaz (en az 3 karakter).");
  if (n.length > NEDEN_EN_FAZLA) return hata(422, `Gerekçe en fazla ${NEDEN_EN_FAZLA} karakter olabilir.`);
  return { ok: true, value: n };
}

// İşlem yapıldıktan sonra yazılır (yapılmamış işlem kayda geçmez); kayıt hatası işlemi geri almaz, loglanır.
async function kaydet(d: OgretmenYonetimiDeps, yonetici: Hesap, islem: YonetimIslemi, hedefId: string, neden: string, now: number): Promise<void> {
  try {
    await d.islemler.ekle({ tarih: now, yoneticiId: yonetici.id, islem, hedefId, neden });
  } catch (err) {
    console.error("[yonetim] işlem kaydı yazılamadı", islem, hedefId, err instanceof Error ? err.message : err);
  }
}

// Askıya alınan hesabın bütün oturumları hemen düşer ve giriş yapamaz; geri açılınca yeniden giriş yapar. Yalnız hesaba
// erişim kapanır: verileri silinmez, topluluktaki ve okuldaki paylaşımları görünür kalır, öğrencilerin süren oyunları
// sürer (içerik sorunu varsa moderasyondan ayrıca geri çekilir).
export async function askiDegistir(d: OgretmenYonetimiDeps, yonetici: Hesap, id: string, askida: unknown, nedenGirdi: unknown, now = Date.now()): Promise<Sonuc<{ askida: boolean }>> {
  if (typeof askida !== "boolean") return hata(422, "askida alanı true ya da false olmalı.");
  const neden = nedenOf(nedenGirdi, askida);
  if (!neden.ok) return neden;
  const hedef = await hedefHesap(d, yonetici, id);
  if (!hedef.ok) return hedef;
  const su = hedef.value.aski;
  if (askida && su?.askida) return hata(409, "Hesap zaten askıda.");
  if (!askida && !su?.askida) return hata(409, "Hesap askıda değil.");
  // Geri açmada askı anı korunur: askıdan önce açılmış oturumlar geçersiz kalır.
  const aski = askida ? { askida: true, zaman: now, neden: neden.value } : { askida: false, zaman: su!.zaman, neden: neden.value };
  if (!(await d.auth.askiYaz(id, aski))) return hata(404, "Öğretmen bulunamadı.");
  await kaydet(d, yonetici, askida ? "askiya-al" : "geri-ac", id, neden.value, now);
  return { ok: true, value: { askida } };
}

// Yönetici öğretmen hesabını ve verilerini kalıcı siler (kendi silmesiyle aynı kapsam). Onay: öğretmenin kullanıcı
// adı yazılır ve yönetici kendi şifresini girer.
export async function ogretmenSil(d: OgretmenYonetimiDeps, yonetici: Hesap, id: string, onayAdi: unknown, yoneticiSifresi: unknown, nedenGirdi: unknown, now = Date.now()): Promise<Sonuc<null>> {
  if (typeof yoneticiSifresi !== "string" || yoneticiSifresi.length === 0 || yoneticiSifresi.length > 200 || !(await sifreDogru(yoneticiSifresi, yonetici.sifreOzeti))) {
    return hata(403, "Şifren hatalı.");
  }
  const neden = nedenOf(nedenGirdi, true);
  if (!neden.ok) return neden;
  const hedef = await hedefHesap(d, yonetici, id);
  if (!hedef.ok) return hedef;
  if (typeof onayAdi !== "string" || onayAdi.trim().toLocaleLowerCase("tr-TR") !== hedef.value.kullaniciAdi) {
    return hata(422, "Onay için öğretmenin kullanıcı adını aynen yaz.");
  }
  const r = await hesapVerileriniSil(d, hedef.value, "yonetici", now);
  if (!r.ok) return r;
  await kaydet(d, yonetici, "sil", id, neden.value, now);
  return { ok: true, value: null };
}
