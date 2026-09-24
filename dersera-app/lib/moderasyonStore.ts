import { MODERASYON, type ModerasyonKaydi, type ModerasyonSonucu } from "@/lib/moderasyon";
import { redisFromEnv, type RedisCommand } from "@/lib/redis";

// Anahtarlar: kayıt (JSON, süreli), tekillik (aynı içerik/oyun kuyruğa bir kez), bekleyen ve kapatılan sıralı
// kümeler (tarih azalan okunur) ve kapatma kilidi (ilk karar kazanır, SET NX).
export interface ModerasyonStore {
  // Tekillik anahtarı daha önce görüldüyse yazmaz, false döner.
  ekle(k: ModerasyonKaydi, tekil: string): Promise<boolean>;
  liste(durum: ModerasyonKaydi["durum"], adet: number): Promise<ModerasyonKaydi[]>;
  get(id: string): Promise<ModerasyonKaydi | null>;
  // Yalnız bekleyen kayıt ve yalnız ilk karar: kapatılan kaydı döner; kayıt yoksa ya da kapatılmışsa null.
  kapat(id: string, sonuc: ModerasyonSonucu): Promise<ModerasyonKaydi | null>;
}

const SAKLAMA_MS = MODERASYON.saklamaGun * 24 * 60 * 60 * 1000;

export function createMemoryModerasyonStore(): ModerasyonStore {
  const kayitlar = new Map<string, ModerasyonKaydi>();
  const tekiller = new Set<string>();
  const sirali = (durum: ModerasyonKaydi["durum"]) => [...kayitlar.values()].filter((k) => k.durum === durum).sort((a, b) => b.tarih - a.tarih);
  return {
    async ekle(k, tekil) {
      if (tekiller.has(tekil)) return false;
      tekiller.add(tekil);
      kayitlar.set(k.id, k);
      // Kuyruk sınırı: en eski bekleyenler düşer.
      for (const eski of sirali("bekliyor").slice(MODERASYON.enCokKayit)) kayitlar.delete(eski.id);
      return true;
    },
    async liste(durum, adet) {
      return sirali(durum).slice(0, adet);
    },
    async get(id) {
      return kayitlar.get(id) ?? null;
    },
    async kapat(id, sonuc) {
      const k = kayitlar.get(id);
      if (!k || k.durum !== "bekliyor") return null;
      const kapali: ModerasyonKaydi = { ...k, durum: "kapatildi", sonuc };
      kayitlar.set(id, kapali);
      return kapali;
    },
  };
}

const kayitKey = (id: string) => `dersera:moderasyon:kayit:${id}`;
const tekilKey = (t: string) => `dersera:moderasyon:tekil:${t}`;
const kilitKey = (id: string) => `dersera:moderasyon:karar:${id}`;
const BEKLEYEN = "dersera:moderasyon:bekleyen";
const KAPALI = "dersera:moderasyon:kapali";

export function createRedisModerasyonStore(command: RedisCommand): ModerasyonStore {
  const oku = async (ids: string[]) => {
    if (ids.length === 0) return [];
    const ham = ((await command(["MGET", ...ids.map(kayitKey)])) as (string | null)[] | null) ?? [];
    return ham.flatMap((h) => (h ? [JSON.parse(h) as ModerasyonKaydi] : []));
  };
  return {
    async ekle(k, tekil) {
      if ((await command(["SET", tekilKey(tekil), k.id, "NX", "PX", SAKLAMA_MS])) !== "OK") return false;
      await command(["SET", kayitKey(k.id), JSON.stringify(k), "PX", SAKLAMA_MS]);
      await command(["ZADD", BEKLEYEN, k.tarih, k.id]);
      await command(["ZREMRANGEBYRANK", BEKLEYEN, 0, -(MODERASYON.enCokKayit + 1)]);
      return true;
    },
    async liste(durum, adet) {
      const ids = ((await command(["ZREVRANGE", durum === "bekliyor" ? BEKLEYEN : KAPALI, 0, adet - 1])) as string[] | null) ?? [];
      return oku(ids);
    },
    async get(id) {
      return (await oku([id]))[0] ?? null;
    },
    async kapat(id, sonuc) {
      const k = (await oku([id]))[0];
      if (!k || k.durum !== "bekliyor") return null;
      // İki yönetici aynı anda karar verirse yalnız ilki yazılır.
      if ((await command(["SET", kilitKey(id), JSON.stringify(sonuc), "NX", "PX", SAKLAMA_MS])) !== "OK") return null;
      const kapali: ModerasyonKaydi = { ...k, durum: "kapatildi", sonuc };
      await command(["SET", kayitKey(id), JSON.stringify(kapali), "PX", SAKLAMA_MS]);
      await command(["ZREM", BEKLEYEN, id]);
      await command(["ZADD", KAPALI, sonuc.tarih, id]);
      await command(["ZREMRANGEBYRANK", KAPALI, 0, -(MODERASYON.enCokKayit + 1)]);
      return kapali;
    },
  };
}

let store: ModerasyonStore | null = null;
export function getModerasyonStore(): ModerasyonStore {
  if (!store) {
    const command = redisFromEnv();
    store = command ? createRedisModerasyonStore(command) : createMemoryModerasyonStore();
  }
  return store;
}
