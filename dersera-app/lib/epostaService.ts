import { createHash, randomBytes } from "crypto";
import { kullaniciAdiNormal, sifreDogru, sifreHatasi, sifreOzeti, type AuthSonucu } from "@/lib/auth";
import type { AuthStore, Hesap } from "@/lib/authStore";
import { checkLimit } from "@/lib/composer/rateLimit";
import type { Eposta } from "@/lib/eposta";
import type { EpostaStore } from "@/lib/epostaStore";
import { hashToken } from "@/lib/gamesService";

// Öğretmenin isteğe bağlı e-postası ve şifre sıfırlama. E-posta yalnız doğrulandıktan sonra ve yalnız şifre sıfırlama
// bağlantısı göndermek için kullanılır. Bağlantılar tek kullanımlıktır; e-posta tarayıcıları bağlantıyı önceden açsa da
// tüketilmesin diye bağlantı yalnız sayfayı açar, işlem sayfadaki düğmeyle (POST) yapılır.

export interface EpostaDeps {
  auth: AuthStore;
  eposta: EpostaStore;
  gonder: (e: Eposta) => Promise<void>;
  // Yanıt süresi hesabın var olup olmadığını ele vermesin diye sıfırlama e-postası yanıttan sonra gönderilir.
  arkaPlan: (is: () => Promise<void>) => void;
}

export const DOGRULAMA_SURESI_MS = 24 * 60 * 60 * 1000;
export const SIFIRLAMA_SURESI_MS = 60 * 60 * 1000;
const SAAT_MS = 60 * 60 * 1000;
// Hesap başına saatte en çok bu kadar e-posta (doğrulama + sıfırlama); kötüye kullanımla gelen kutusu doldurulmasın.
const HESAP_SAATLIK_EPOSTA = 5;
const ADRES = /^[^\s@"\\<>(),;:]+@[^\s@"\\<>(),;:]+\.[^\s@"\\<>(),;:.]{2,}$/;

const hata = (status: number, error: string) => ({ ok: false as const, status, error });

export function epostaNormal(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const a = v.trim().toLowerCase();
  return a.length <= 254 && ADRES.test(a) ? a : null;
}
export const adresOzeti = (adres: string) => createHash("sha256").update(adres).digest("hex");
const yeniBelirtec = () => randomBytes(32).toString("base64url");
const belirtecGecerli = (v: unknown): v is string => typeof v === "string" && v.length >= 20 && v.length <= 100;

// Ayarlarda gösterilir.
export async function epostaDurumu(d: Pick<EpostaDeps, "eposta">, hesap: Hesap) {
  const k = await d.eposta.oku(hesap.id);
  return k ? { adres: k.adres, dogrulandi: k.dogrulandi } : null;
}

async function hesapEpostaSiniri(hesapId: string): Promise<boolean> {
  return checkLimit(`dersera:eposta-gonderim:${hesapId}`, SAAT_MS, HESAP_SAATLIK_EPOSTA);
}

// E-posta ekle ya da değiştir (şifreyle): adres doğrulanmamış yazılır, doğrulama bağlantısı gönderilir. Aynı adres
// tekrar girilirse doğrulama bağlantısı yeniden gönderilir.
export async function epostaEkle(d: EpostaDeps, hesap: Hesap, adresGirdi: unknown, sifre: unknown, site: string, now = Date.now()): Promise<AuthSonucu<{ adres: string; dogrulandi: boolean }>> {
  if (typeof sifre !== "string" || !(await sifreDogru(sifre, hesap.sifreOzeti))) return hata(403, "Şifre hatalı.");
  const adres = epostaNormal(adresGirdi);
  if (!adres) return hata(422, "Geçerli bir e-posta adresi yaz.");
  const su = await d.eposta.oku(hesap.id);
  if (su?.dogrulandi && su.adres === adres) return { ok: true, value: { adres, dogrulandi: true } };
  if (!(await hesapEpostaSiniri(hesap.id))) return hata(429, "Çok fazla e-posta istendi. Bir saat sonra tekrar dene.");
  await d.eposta.yaz(hesap.id, { adres, dogrulandi: false, zaman: now }, su?.dogrulandi ? adresOzeti(su.adres) : null);
  const belirtec = yeniBelirtec();
  await d.eposta.belirtecYaz(await hashToken(belirtec), { tur: "dogrulama", hesapId: hesap.id, adres }, DOGRULAMA_SURESI_MS);
  await d.gonder({
    kime: adres,
    konu: "Dersera: e-posta adresini doğrula",
    metin: `Merhaba ${hesap.kullaniciAdi},\n\nDersera hesabına bu e-posta adresi eklendi. Doğrulamak için bağlantıyı aç ve sayfadaki düğmeye bas (24 saat geçerli):\n\n${site}/eposta-dogrula?t=${belirtec}\n\nBu isteği sen yapmadıysan bu e-postayı yok sayabilirsin.`,
  });
  return { ok: true, value: { adres, dogrulandi: false } };
}

export async function epostaKaldir(d: Pick<EpostaDeps, "eposta">, hesap: Hesap, sifre: unknown): Promise<AuthSonucu<null>> {
  if (typeof sifre !== "string" || !(await sifreDogru(sifre, hesap.sifreOzeti))) return hata(403, "Şifre hatalı.");
  const su = await d.eposta.oku(hesap.id);
  if (su) await d.eposta.kaldir(hesap.id, su.dogrulandi ? adresOzeti(su.adres) : null);
  return { ok: true, value: null };
}

// Doğrulama bağlantısı: oturum gerekmez (başka cihazda açılabilir); belirteç tek kullanımlıktır.
export async function epostaDogrula(d: Pick<EpostaDeps, "eposta" | "auth">, belirtec: unknown, now = Date.now()): Promise<AuthSonucu<{ adres: string }>> {
  const GECERSIZ = hata(400, "Bağlantı geçersiz ya da süresi dolmuş. Ayarlardan yeni doğrulama e-postası iste.");
  if (!belirtecGecerli(belirtec)) return GECERSIZ;
  const b = await d.eposta.belirtecAl(await hashToken(belirtec));
  if (!b || b.tur !== "dogrulama" || !(await d.auth.hesap(b.hesapId))) return GECERSIZ;
  const r = await d.eposta.dogrula(b.hesapId, b.adres, adresOzeti(b.adres), now);
  if (r === "alinmis") return hata(409, "Bu e-posta adresi başka bir hesapta doğrulanmış.");
  if (r === "degisti") return GECERSIZ;
  return { ok: true, value: { adres: b.adres } };
}

async function sifirlamaBelirteci(d: Pick<EpostaDeps, "eposta">, hesap: Hesap): Promise<string> {
  const belirtec = yeniBelirtec();
  await d.eposta.belirtecYaz(await hashToken(belirtec), { tur: "sifirlama", hesapId: hesap.id, surum: hesap.surum }, SIFIRLAMA_SURESI_MS);
  return belirtec;
}
export const sifirlamaBaglantisi = (site: string, belirtec: string) => `${site}/sifre-sifirla?t=${belirtec}`;

export const SIFIRLAMA_ISTENDI =
  "Bu kullanıcı adına ya da e-postaya bağlı doğrulanmış bir e-posta varsa birkaç dakika içinde şifre sıfırlama bağlantısı gelecek. E-postan yoksa okul yöneticinden ya da platform yöneticisinden sıfırlama bağlantısı iste.";

// "Şifremi unuttum": kullanıcı adı ya da e-posta. Yanıt her durumda aynıdır (hesabın ya da e-postanın var olup olmadığı
// öğrenilemez); e-posta yalnız doğrulanmış adrese, yanıttan sonra gönderilir.
export async function sifirlamaIste(d: EpostaDeps, girdi: unknown, site: string): Promise<void> {
  if (typeof girdi !== "string" || girdi.length > 254) return;
  let id: string | null = null;
  if (girdi.includes("@")) {
    const adres = epostaNormal(girdi);
    id = adres ? await d.eposta.adrestenHesap(adresOzeti(adres)) : null;
  } else {
    const ad = kullaniciAdiNormal(girdi);
    id = ad ? await d.auth.idByAd(ad) : null;
  }
  if (!id) return;
  const hesapId = id;
  d.arkaPlan(async () => {
    const [hesap, k] = await Promise.all([d.auth.hesap(hesapId), d.eposta.oku(hesapId)]);
    if (!hesap || !k?.dogrulandi || !(await hesapEpostaSiniri(hesapId))) return;
    const belirtec = await sifirlamaBelirteci(d, hesap);
    await d.gonder({
      kime: k.adres,
      konu: "Dersera: şifre sıfırlama",
      metin: `Merhaba ${hesap.kullaniciAdi},\n\nŞifreni sıfırlamak için bağlantıyı aç (1 saat geçerli, tek kullanımlık):\n\n${sifirlamaBaglantisi(site, belirtec)}\n\nBu isteği sen yapmadıysan bu e-postayı yok sayabilirsin; şifren değişmez.`,
    });
  });
}

// Platform yöneticisi için (e-postasız öğretmen): bağlantıyı yönetici öğretmene kendisi iletir.
export const yoneticiSifirlamaBelirteci = sifirlamaBelirteci;

// Yeni şifre: şifre kuralı belirteç harcanmadan denetlenir. Belirteç, verildiği andaki hesap sürümüne bağlıdır: bu
// arada şifre değiştiyse (ya da başka bir sıfırlama kullanıldıysa) geçersizdir. Sürüm artar, bütün oturumlar kapanır.
export async function sifreSifirla(d: Pick<EpostaDeps, "eposta" | "auth">, belirtec: unknown, yeniSifre: unknown): Promise<AuthSonucu<null>> {
  const GECERSIZ = hata(400, "Bağlantı geçersiz ya da süresi dolmuş. Yeniden şifre sıfırlama iste.");
  if (!belirtecGecerli(belirtec)) return GECERSIZ;
  const sorun = sifreHatasi(yeniSifre);
  if (sorun) return hata(422, sorun);
  const b = await d.eposta.belirtecAl(await hashToken(belirtec));
  if (!b || b.tur !== "sifirlama") return GECERSIZ;
  const hesap = await d.auth.hesap(b.hesapId);
  if (!hesap || hesap.surum !== b.surum) return GECERSIZ;
  await d.auth.sifreGuncelle({ ...hesap, sifreOzeti: await sifreOzeti(yeniSifre as string), surum: hesap.surum + 1 });
  return { ok: true, value: null };
}
