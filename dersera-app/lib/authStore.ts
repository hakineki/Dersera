import { redisFromEnv, type RedisCommand } from "@/lib/redis";

// Öğretmen hesabı. Kimlik (id) değişmez; kullanıcı adı ayrı tutulur ve bir dizinle id'ye bağlanır.
// Ad ile şifre ayrı anahtarlarda durduğu için eşzamanlı ad ve şifre değişikliği birbirini ezmez.
// surum şifre değişince artar; eski sürümle açılmış oturumlar geçersiz olur.
export interface Hesap {
  id: string;
  kullaniciAdi: string;
  sifreOzeti: string;
  surum: number;
  olusturma: number;
}

type HesapKaydi = Omit<Hesap, "kullaniciAdi">;

export interface Oturum {
  id: string;
  surum: number;
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
  // Şifre/sürüm alanlarını yazar; kullanıcı adına dokunmaz.
  sifreGuncelle(hesap: Hesap): Promise<void>;
  // Hesabın adı hâlâ eskiAd ise ve yeniAd boştaysa dizini ve adı atomik olarak taşır.
  adTasi(id: string, eskiAd: string, yeniAd: string): Promise<AdTasimaSonucu>;
  oturumYaz(belirtecOzeti: string, oturum: Oturum, ttlMs: number): Promise<void>;
  oturum(belirtecOzeti: string): Promise<Oturum | null>;
  oturumSil(belirtecOzeti: string): Promise<void>;
}

const hesapKey = (id: string) => `dersera:hesap:${id}`;
const hesapAdKey = (id: string) => `dersera:hesap:${id}:ad`;
const adKey = (ad: string) => `dersera:hesap-adi:${ad}`;
const oturumKey = (ozet: string) => `dersera:oturum:${ozet}`;

const kayitOf = ({ id, sifreOzeti, surum, olusturma }: Hesap): HesapKaydi => ({ id, sifreOzeti, surum, olusturma });

export function createMemoryAuthStore(now: () => number = Date.now): AuthStore {
  const kayitlar = new Map<string, HesapKaydi>();
  const hesapAdlari = new Map<string, string>();
  const adlar = new Map<string, string>();
  const oturumlar = new Map<string, { oturum: Oturum; until: number }>();
  return {
    persistent: false,
    async hesap(id) {
      const k = kayitlar.get(id);
      const ad = hesapAdlari.get(id);
      return k && ad ? { ...k, kullaniciAdi: ad } : null;
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
  };
}

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

export function createRedisAuthStore(command: RedisCommand): AuthStore {
  return {
    persistent: true,
    async hesap(id) {
      const [raw, ad] = ((await command(["MGET", hesapKey(id), hesapAdKey(id)])) as (string | null)[] | null) ?? [];
      return raw && ad ? { ...(JSON.parse(raw) as HesapKaydi), kullaniciAdi: ad } : null;
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
