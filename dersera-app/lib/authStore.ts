import { redisFromEnv, type RedisCommand } from "@/lib/redis";

// Öğretmen hesabı. Kimlik (id) değişmez; kullanıcı adı ayrı bir dizinle id'ye bağlanır ve değiştirilebilir.
// surum şifre değişince artar; eski sürümle açılmış oturumlar geçersiz olur.
export interface Hesap {
  id: string;
  kullaniciAdi: string;
  sifreOzeti: string;
  surum: number;
  olusturma: number;
}

export interface Oturum {
  id: string;
  surum: number;
}

export interface AuthStore {
  persistent: boolean;
  hesap(id: string): Promise<Hesap | null>;
  idByAd(kullaniciAdi: string): Promise<string | null>;
  // Kullanıcı adı boştaysa hesabı oluşturur; alınmışsa false.
  olustur(hesap: Hesap): Promise<boolean>;
  guncelle(hesap: Hesap): Promise<void>;
  // Yeni ad boştaysa dizini taşır; alınmışsa false.
  adTasi(id: string, eskiAd: string, yeniAd: string): Promise<boolean>;
  oturumYaz(belirtecOzeti: string, oturum: Oturum, ttlMs: number): Promise<void>;
  oturum(belirtecOzeti: string): Promise<Oturum | null>;
  oturumSil(belirtecOzeti: string): Promise<void>;
}

const hesapKey = (id: string) => `dersera:hesap:${id}`;
const adKey = (ad: string) => `dersera:hesap-adi:${ad}`;
const oturumKey = (ozet: string) => `dersera:oturum:${ozet}`;

export function createMemoryAuthStore(now: () => number = Date.now): AuthStore {
  const hesaplar = new Map<string, Hesap>();
  const adlar = new Map<string, string>();
  const oturumlar = new Map<string, { oturum: Oturum; until: number }>();
  return {
    persistent: false,
    async hesap(id) {
      return hesaplar.get(id) ?? null;
    },
    async idByAd(ad) {
      return adlar.get(ad) ?? null;
    },
    async olustur(h) {
      if (adlar.has(h.kullaniciAdi)) return false;
      adlar.set(h.kullaniciAdi, h.id);
      hesaplar.set(h.id, h);
      return true;
    },
    async guncelle(h) {
      hesaplar.set(h.id, h);
    },
    async adTasi(id, eskiAd, yeniAd) {
      if (adlar.has(yeniAd)) return false;
      adlar.set(yeniAd, id);
      adlar.delete(eskiAd);
      return true;
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

export function createRedisAuthStore(command: RedisCommand): AuthStore {
  return {
    persistent: true,
    async hesap(id) {
      const raw = (await command(["GET", hesapKey(id)])) as string | null;
      return raw ? (JSON.parse(raw) as Hesap) : null;
    },
    async idByAd(ad) {
      return ((await command(["GET", adKey(ad)])) as string | null) ?? null;
    },
    async olustur(h) {
      // Ad dizini NX ile alınır: aynı adla eşzamanlı iki kayıttan yalnız biri kazanır.
      if ((await command(["SET", adKey(h.kullaniciAdi), h.id, "NX"])) !== "OK") return false;
      await command(["SET", hesapKey(h.id), JSON.stringify(h)]);
      return true;
    },
    async guncelle(h) {
      await command(["SET", hesapKey(h.id), JSON.stringify(h)]);
    },
    async adTasi(id, eskiAd, yeniAd) {
      if ((await command(["SET", adKey(yeniAd), id, "NX"])) !== "OK") return false;
      await command(["DEL", adKey(eskiAd)]);
      return true;
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

let store: AuthStore | null = null;

export function getAuthStore(): AuthStore {
  if (!store) {
    const command = redisFromEnv();
    store = command ? createRedisAuthStore(command) : createMemoryAuthStore();
  }
  return store;
}
