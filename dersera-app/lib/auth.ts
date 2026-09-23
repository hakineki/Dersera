import { randomBytes, scrypt as scryptCb, timingSafeEqual, type ScryptOptions } from "crypto";
import { hashToken } from "@/lib/gamesService";
import type { AuthStore, Hesap } from "@/lib/authStore";

// Sunucu tarafı öğretmen hesabı: kayıt, giriş, oturum, kullanıcı adı ve şifre değiştirme.

export const OTURUM_CEREZI = "dersera_oturum";
export const OTURUM_SURESI_MS = 30 * 24 * 60 * 60 * 1000;
export const SIFRE_MIN = 8;
const SIFRE_MAX = 128;
const AD = /^[a-z0-9çğıöşü._-]{3,32}$/u;

const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 64 } as const;

function scrypt(sifre: string, tuz: Buffer, keylen: number, opts: ScryptOptions): Promise<Buffer> {
  return new Promise((resolve, reject) => scryptCb(sifre, tuz, keylen, opts, (err, key) => (err ? reject(err) : resolve(key))));
}

export async function sifreOzeti(sifre: string): Promise<string> {
  const tuz = randomBytes(16);
  const ozet = await scrypt(sifre, tuz, SCRYPT.keylen, { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p });
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${tuz.toString("base64")}$${ozet.toString("base64")}`;
}

export async function sifreDogru(sifre: string, kayitli: string): Promise<boolean> {
  const [alg, n, r, p, tuz, ozet] = kayitli.split("$");
  if (alg !== "scrypt" || !tuz || !ozet) return false;
  const beklenen = Buffer.from(ozet, "base64");
  const gelen = await scrypt(sifre, Buffer.from(tuz, "base64"), beklenen.length, { N: Number(n), r: Number(r), p: Number(p) });
  return gelen.length === beklenen.length && timingSafeEqual(gelen, beklenen);
}

// Kullanıcı adı büyük/küçük harf duyarsızdır; Türkçe kurallarla küçültülür.
export function kullaniciAdiNormal(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const ad = v.trim().toLocaleLowerCase("tr-TR");
  return AD.test(ad) ? ad : null;
}

export function sifreHatasi(v: unknown): string | null {
  if (typeof v !== "string" || v.length < SIFRE_MIN) return `Şifre en az ${SIFRE_MIN} karakter olmalı.`;
  if (v.length > SIFRE_MAX) return `Şifre en fazla ${SIFRE_MAX} karakter olabilir.`;
  return null;
}

export const AD_HATASI = "Kullanıcı adı 3–32 karakter olmalı; harf, rakam, nokta, tire ve alt çizgi kullanılabilir.";

export type AuthSonucu<T> = { ok: true; value: T } | { ok: false; status: number; error: string };
const hata = (status: number, error: string) => ({ ok: false as const, status, error });

// Yanlış kullanıcı adı ile yanlış şifre aynı sürede yanıtlansın: olmayan hesapta da bir özet hesaplanır.
let bosOzet: Promise<string> | null = null;

export async function kayitOl(store: AuthStore, adGirdi: unknown, sifre: unknown, davetKodu: unknown, now = Date.now()): Promise<AuthSonucu<Hesap>> {
  const beklenenDavet = process.env.KAYIT_DAVET_KODU?.trim();
  if (beklenenDavet && davetKodu !== beklenenDavet) return hata(403, "Davet kodu geçersiz.");
  const ad = kullaniciAdiNormal(adGirdi);
  if (!ad) return hata(422, AD_HATASI);
  const sifreSorunu = sifreHatasi(sifre);
  if (sifreSorunu) return hata(422, sifreSorunu);
  const hesap: Hesap = { id: randomBytes(12).toString("hex"), kullaniciAdi: ad, sifreOzeti: await sifreOzeti(sifre as string), surum: 1, olusturma: now };
  if (!(await store.olustur(hesap))) return hata(409, "Bu kullanıcı adı alınmış.");
  return { ok: true, value: hesap };
}

export async function girisYap(store: AuthStore, adGirdi: unknown, sifre: unknown): Promise<AuthSonucu<Hesap>> {
  const ad = kullaniciAdiNormal(adGirdi);
  const id = ad ? await store.idByAd(ad) : null;
  const hesap = id ? await store.hesap(id) : null;
  if (!hesap || typeof sifre !== "string") {
    bosOzet ??= sifreOzeti("dersera-bos");
    await sifreDogru(typeof sifre === "string" ? sifre : "", await bosOzet);
    return hata(401, "Kullanıcı adı veya şifre hatalı.");
  }
  if (!(await sifreDogru(sifre, hesap.sifreOzeti))) return hata(401, "Kullanıcı adı veya şifre hatalı.");
  return { ok: true, value: hesap };
}

// Oturum belirteci yalnız çerezde durur; sunucu özetini saklar.
export async function oturumAc(store: AuthStore, hesap: Hesap): Promise<string> {
  const belirtec = randomBytes(32).toString("base64url");
  await store.oturumYaz(await hashToken(belirtec), { id: hesap.id, surum: hesap.surum }, OTURUM_SURESI_MS);
  return belirtec;
}

export async function oturumHesabi(store: AuthStore, belirtec: string | null): Promise<Hesap | null> {
  if (!belirtec || belirtec.length > 100) return null;
  const oturum = await store.oturum(await hashToken(belirtec));
  if (!oturum) return null;
  const hesap = await store.hesap(oturum.id);
  // Şifre değiştiyse eski oturumlar geçersizdir.
  return hesap && hesap.surum === oturum.surum ? hesap : null;
}

export async function oturumKapat(store: AuthStore, belirtec: string | null): Promise<void> {
  if (belirtec && belirtec.length <= 100) await store.oturumSil(await hashToken(belirtec));
}

// Şifre değişince sürüm artar: bu hesabın diğer tüm oturumları kapanır, çağırana yeni oturum açılır.
export async function sifreDegistir(store: AuthStore, hesap: Hesap, mevcut: unknown, yeni: unknown): Promise<AuthSonucu<Hesap>> {
  if (typeof mevcut !== "string" || !(await sifreDogru(mevcut, hesap.sifreOzeti))) return hata(403, "Mevcut şifre hatalı.");
  const sorun = sifreHatasi(yeni);
  if (sorun) return hata(422, sorun);
  const guncel: Hesap = { ...hesap, sifreOzeti: await sifreOzeti(yeni as string), surum: hesap.surum + 1 };
  await store.sifreGuncelle(guncel);
  return { ok: true, value: guncel };
}

export async function kullaniciAdiDegistir(store: AuthStore, hesap: Hesap, yeniAdGirdi: unknown, sifre: unknown): Promise<AuthSonucu<Hesap>> {
  if (typeof sifre !== "string" || !(await sifreDogru(sifre, hesap.sifreOzeti))) return hata(403, "Şifre hatalı.");
  const yeniAd = kullaniciAdiNormal(yeniAdGirdi);
  if (!yeniAd) return hata(422, AD_HATASI);
  if (yeniAd === hesap.kullaniciAdi) return { ok: true, value: hesap };
  const sonuc = await store.adTasi(hesap.id, hesap.kullaniciAdi, yeniAd);
  if (sonuc === "alinmis") return hata(409, "Bu kullanıcı adı alınmış.");
  if (sonuc === "degismis") return hata(409, "Hesap bilgisi başka bir oturumda değişti. Sayfayı yenileyip tekrar deneyin.");
  return { ok: true, value: { ...hesap, kullaniciAdi: yeniAd } };
}

export const hesapOzeti = (h: Hesap) => ({ kullaniciAdi: h.kullaniciAdi, olusturma: h.olusturma });

// Kütüphane sahipliği hesabın değişmez kimliğine bağlıdır.
export const kutuphaneSahibi = (h: Hesap) => `hesap:${h.id}`;
