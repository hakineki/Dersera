import { anahtarlariTara, redisFromEnv, type RedisCommand } from "@/lib/redis";

// Öğretmen hesabı. Kimlik (id) değişmez; kullanıcı adı ayrı tutulur ve bir dizinle id'ye bağlanır.
// Ad ile şifre ayrı anahtarlarda durduğu için eşzamanlı ad ve şifre değişikliği birbirini ezmez.
// surum şifre değişince artar; eski sürümle açılmış oturumlar geçersiz olur.
// Askı bilgisi de ayrı anahtardadır: şifre değişikliği yöneticinin askısını ezmez.
export interface Hesap {
  id: string;
  kullaniciAdi: string;
  sifreOzeti: string;
  surum: number;
  olusturma: number;
  aski?: Aski;
}

// Platform yöneticisinin askısı. Geri açılınca kayıt kalır (askida: false): askıya alma anından önce açılmış
// oturumlar geri açıldıktan sonra da geçersizdir.
export interface Aski {
  askida: boolean;
  zaman: number;
  neden: string;
}

type HesapKaydi = Omit<Hesap, "kullaniciAdi" | "aski">;

export interface Oturum {
  id: string;
  surum: number;
  // Oturumun açıldığı an; askıdan önce açılmış oturum geçersizdir. Eski oturumlarda yok (0 sayılır).
  acilis?: number;
}

export type AdTasimaSonucu = "tasindi" | "alinmis" | "degismis";

export interface AuthStore {
  persistent: boolean;
  hesap(id: string): Promise<Hesap | null>;
  idByAd(kullaniciAdi: string): Promise<string | null>;
  // Birden çok hesabın kullanıcı adı tek okumada (ör. okul listeleri); olmayan null.
  kullaniciAdlari(ids: string[]): Promise<(string | null)[]>;
  // Kullanıcı adı boştaysa hesabı atomik olarak oluşturur; alınmışsa false.
  olustur(hesap: Hesap): Promise<boolean>;
  // Şifre/sürüm alanlarını yazar; kullanıcı adına ve askıya dokunmaz.
  sifreGuncelle(hesap: Hesap): Promise<void>;
  // Hesabın adı hâlâ eskiAd ise ve yeniAd boştaysa dizini ve adı atomik olarak taşır.
  adTasi(id: string, eskiAd: string, yeniAd: string): Promise<AdTasimaSonucu>;
  oturumYaz(belirtecOzeti: string, oturum: Oturum, ttlMs: number): Promise<void>;
  oturum(belirtecOzeti: string): Promise<Oturum | null>;
  oturumSil(belirtecOzeti: string): Promise<void>;
  // Hesabı, askı kaydını ve ad dizinini siler (ad boşa çıkar); hesabın adı bu arada değiştiyse hiçbir şey silmez
  // (false). Kayıt gidince bu hesabın bütün oturumları geçersizdir (oturum hesabı bulamaz).
  hesapSil(id: string, kullaniciAdi: string): Promise<boolean>;
  // Askı kaydını yazar; hesap yoksa (silinmiş) yazmaz ve false döner.
  askiYaz(id: string, aski: Aski): Promise<boolean>;
  // Bütün hesaplar (yönetim listesi; tarama, seyrek). Şifre özeti dönmez.
  hesaplar(): Promise<Omit<Hesap, "sifreOzeti" | "surum">[]>;
  // Toplam hesap sayısı (yönetim özeti; tarama, seyrek).
  hesapSayisi(): Promise<number>;
}

const hesapKey = (id: string) => `dersera:hesap:${id}`;
const hesapAdKey = (id: string) => `dersera:hesap:${id}:ad`;
const askiKey = (id: string) => `dersera:hesap:${id}:aski`;
const adKey = (ad: string) => `dersera:hesap-adi:${ad}`;
const oturumKey = (ozet: string) => `dersera:oturum:${ozet}`;
const AD_ONEKI = adKey("");

const kayitOf = ({ id, sifreOzeti, surum, olusturma }: Hesap): HesapKaydi => ({ id, sifreOzeti, surum, olusturma });
const hesapOf = (k: HesapKaydi, kullaniciAdi: string, aski: Aski | undefined): Hesap => (aski ? { ...k, kullaniciAdi, aski } : { ...k, kullaniciAdi });

export function createMemoryAuthStore(now: () => number = Date.now): AuthStore {
  const kayitlar = new Map<string, HesapKaydi>();
  const hesapAdlari = new Map<string, string>();
  const askilar = new Map<string, Aski>();
  const adlar = new Map<string, string>();
  const oturumlar = new Map<string, { oturum: Oturum; until: number }>();
  const hesap = (id: string) => {
    const k = kayitlar.get(id);
    const ad = hesapAdlari.get(id);
    return k && ad ? hesapOf(k, ad, askilar.get(id)) : null;
  };
  return {
    persistent: false,
    async hesap(id) {
      return hesap(id);
    },
    async idByAd(ad) {
      return adlar.get(ad) ?? null;
    },
    async kullaniciAdlari(ids) {
      return ids.map((id) => hesapAdlari.get(id) ?? null);
    },
    async olustur(h) {
      if (adlar.has(h.kullaniciAdi)) return false;
      adlar.set(h.kullaniciAdi, h.id);
      kayitlar.set(h.id, kayitOf(h));
      hesapAdlari.set(h.id, h.kullaniciAdi);
      return true;
    },
    async sifreGuncelle(h) {
      kayitlar.set(h.id, kayitOf(h));
    },
    async adTasi(id, eskiAd, yeniAd) {
      if (hesapAdlari.get(id) !== eskiAd) return "degismis";
      if (adlar.has(yeniAd)) return "alinmis";
      adlar.set(yeniAd, id);
      adlar.delete(eskiAd);
      hesapAdlari.set(id, yeniAd);
      return "tasindi";
    },
    async oturumYaz(ozet, oturum, ttlMs) {
      oturumlar.set(ozet, { oturum, until: now() + ttlMs });
    },
    async oturum(ozet) {
      const o = oturumlar.get(ozet);
      if (!o || o.until <= now()) return null;
      return o.oturum;
    },
    async oturumSil(ozet) {
      oturumlar.delete(ozet);
    },
    async hesapSayisi() {
      return adlar.size;
    },
    async hesapSil(id, ad) {
      if (hesapAdlari.get(id) !== ad) return false;
      if (adlar.get(ad) === id) adlar.delete(ad);
      kayitlar.delete(id);
      hesapAdlari.delete(id);
      askilar.delete(id);
      return true;
    },
    async askiYaz(id, aski) {
      if (!kayitlar.has(id)) return false;
      askilar.set(id, aski);
      return true;
    },
    async hesaplar() {
      return [...adlar.values()].flatMap((id) => {
        const h = hesap(id);
        return h ? [ozetOf(h)] : [];
      });
    },
  };
}

const ozetOf = ({ id, kullaniciAdi, olusturma, aski }: Hesap): Omit<Hesap, "sifreOzeti" | "surum"> => (aski ? { id, kullaniciAdi, olusturma, aski } : { id, kullaniciAdi, olusturma });

// Lua betikleri yalnız dize işlemleri kullanır; ara adımda hata olursa yetim dizin kaydı kalmaz.
const OLUSTUR = `if not redis.call('SET', KEYS[1], ARGV[1], 'NX') then return 0 end
redis.call('SET', KEYS[2], ARGV[2])
redis.call('SET', KEYS[3], ARGV[3])
return 1`;

const AD_TASI = `if redis.call('GET', KEYS[3]) ~= ARGV[2] then return -1 end
if not redis.call('SET', KEYS[1], ARGV[1], 'NX') then return 0 end
redis.call('DEL', KEYS[2])
redis.call('SET', KEYS[3], ARGV[3])
return 1`;

const HESAP_SIL = `if redis.call('GET', KEYS[2]) ~= ARGV[2] then return 0 end
if redis.call('GET', KEYS[3]) == ARGV[1] then redis.call('DEL', KEYS[3]) end
redis.call('DEL', KEYS[1], KEYS[2], KEYS[4])
return 1`;

// Hesap silinirken yazılan askı yetim kalmasın: kayıt yoksa yazılmaz.
const ASKI_YAZ = `if redis.call('EXISTS', KEYS[1]) == 0 then return 0 end
redis.call('SET', KEYS[2], ARGV[1])
return 1`;

export function createRedisAuthStore(command: RedisCommand): AuthStore {
  return {
    persistent: true,
    async hesap(id) {
      const [raw, ad, aski] = ((await command(["MGET", hesapKey(id), hesapAdKey(id), askiKey(id)])) as (string | null)[] | null) ?? [];
      return raw && ad ? hesapOf(JSON.parse(raw) as HesapKaydi, ad, aski ? (JSON.parse(aski) as Aski) : undefined) : null;
    },
    async idByAd(ad) {
      return ((await command(["GET", adKey(ad)])) as string | null) ?? null;
    },
    async kullaniciAdlari(ids) {
      if (ids.length === 0) return [];
      const r = ((await command(["MGET", ...ids.map(hesapAdKey)])) as (string | null)[] | null) ?? [];
      return ids.map((_, i) => r[i] ?? null);
    },
    async olustur(h) {
      const res = await command(["EVAL", OLUSTUR, 3, adKey(h.kullaniciAdi), hesapKey(h.id), hesapAdKey(h.id), h.id, JSON.stringify(kayitOf(h)), h.kullaniciAdi]);
      return Number(res) === 1;
    },
    async sifreGuncelle(h) {
      await command(["SET", hesapKey(h.id), JSON.stringify(kayitOf(h))]);
    },
    async adTasi(id, eskiAd, yeniAd) {
      const res = Number(await command(["EVAL", AD_TASI, 3, adKey(yeniAd), adKey(eskiAd), hesapAdKey(id), id, eskiAd, yeniAd]));
      return res === 1 ? "tasindi" : res === 0 ? "alinmis" : "degismis";
    },
    async oturumYaz(ozet, oturum, ttlMs) {
      await command(["SET", oturumKey(ozet), JSON.stringify(oturum), "PX", ttlMs]);
    },
    async oturum(ozet) {
      const raw = (await command(["GET", oturumKey(ozet)])) as string | null;
      return raw ? (JSON.parse(raw) as Oturum) : null;
    },
    async oturumSil(ozet) {
      await command(["DEL", oturumKey(ozet)]);
    },
    async hesapSayisi() {
      return (await anahtarlariTara(command, adKey("*"))).length;
    },
    async hesapSil(id, ad) {
      return Number(await command(["EVAL", HESAP_SIL, 4, hesapKey(id), hesapAdKey(id), adKey(ad), askiKey(id), id, ad])) === 1;
    },
    async askiYaz(id, aski) {
      return Number(await command(["EVAL", ASKI_YAZ, 2, hesapKey(id), askiKey(id), JSON.stringify(aski)])) === 1;
    },
    async hesaplar() {
      // Ad dizini taranır; kimlikler, kayıtlar ve askılar üç toplu okumada.
      const anahtarlar = await anahtarlariTara(command, adKey("*"));
      if (anahtarlar.length === 0) return [];
      const ids = ((await command(["MGET", ...anahtarlar])) as (string | null)[] | null) ?? [];
      const varOlan = anahtarlar.flatMap((k, i) => (ids[i] ? [{ ad: k.slice(AD_ONEKI.length), id: ids[i]! }] : []));
      if (varOlan.length === 0) return [];
      const [kayitlar, askilar] = await Promise.all(
        [hesapKey, askiKey].map(async (f) => ((await command(["MGET", ...varOlan.map((v) => f(v.id))])) as (string | null)[] | null) ?? [])
      );
      return varOlan.flatMap((v, i) => {
        const raw = kayitlar[i];
        if (!raw) return [];
        const aski = askilar[i];
        return [ozetOf(hesapOf(JSON.parse(raw) as HesapKaydi, v.ad, aski ? (JSON.parse(aski) as Aski) : undefined))];
      });
    },
  };
}

export class AuthUnavailableError extends Error {}

let store: AuthStore | null = null;

// Sunucusuz ortamda bellek her örnekte ayrıdır ve kaybolur; üretimde hesaplar için Redis zorunludur.
export function getAuthStore(): AuthStore {
  if (!store) {
    const command = redisFromEnv();
    if (!command && process.env.NODE_ENV === "production") throw new AuthUnavailableError("Hesaplar için Redis gerekli");
    store = command ? createRedisAuthStore(command) : createMemoryAuthStore();
  }
  return store;
}
