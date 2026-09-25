import { redisFromEnv, type RedisCommand } from "@/lib/redis";
import type { GorselHedefi } from "@/lib/gorselIstem";
import type { Harcama } from "@/lib/krediService";

// Görsel işi: oyun oluşturulurken sunucuda kurulur (istemler, sahip, görselin kredi harcaması). Her hedef tek kez
// üretilir: istek bekleyen ilk hedefi atomik olarak sahiplenir. Yarıda kalan (işlev kesilen) hedef bayatlayınca
// yeniden sahiplenilebilir. Hazır görselin adresi kalıcıdır (oyun yayında kaldıkça gösterilir); iş kaydı bir gün tutulur.

export type HedefDurumu = "bekliyor" | "calisiyor" | "hazir" | "hata";

export interface GorselIsi {
  isId: string;
  sahip: string;
  olusturma: number;
  // Görsel için ayrı askı harcaması: en az bir görsel üretilirse kesinleşir, hiçbiri üretilemezse iade edilir.
  harcama: Harcama;
  hedefler: GorselHedefi[];
}

export interface GorselStore {
  olustur(is: GorselIsi, ttlMs: number): Promise<void>;
  get(isId: string): Promise<GorselIsi | null>;
  durumlar(isId: string): Promise<Record<string, HedefDurumu>>;
  // Sıradaki bekleyen (ya da bayatMs'den eski "calisiyor") hedefi sahiplenir; yoksa null.
  sahiplen(isId: string, hedefler: string[], now: number, bayatMs: number): Promise<string | null>;
  // Adres önce yazılır: "hazir" durumu adresin var olduğunu garanti eder.
  bitir(isId: string, hedef: string, url: string | null): Promise<void>;
  dosya(isId: string, hedef: string): Promise<string | null>;
  // Kredi kararı tek sefer verilir: ilk çağıran true alır.
  sonuclandir(isId: string, ttlMs: number): Promise<boolean>;
}

const durumOf = (v: string | undefined | null): HedefDurumu | null =>
  v === "bekliyor" || v === "hazir" || v === "hata" ? v : v?.startsWith("calisiyor:") ? "calisiyor" : null;

export function createMemoryGorselStore(): GorselStore {
  const isler = new Map<string, GorselIsi>();
  const durum = new Map<string, Map<string, string>>();
  const dosyalar = new Map<string, string>();
  const sonuc = new Set<string>();
  return {
    async olustur(is) {
      isler.set(is.isId, is);
      durum.set(is.isId, new Map(is.hedefler.map((h) => [h.hedef, "bekliyor"])));
    },
    async get(isId) {
      return isler.get(isId) ?? null;
    },
    async durumlar(isId) {
      const out: Record<string, HedefDurumu> = {};
      for (const [h, v] of durum.get(isId) ?? []) {
        const d = durumOf(v);
        if (d) out[h] = d;
      }
      return out;
    },
    async sahiplen(isId, hedefler, now, bayatMs) {
      const t = durum.get(isId);
      if (!t) return null;
      for (const h of hedefler) {
        const v = t.get(h);
        if (v === "bekliyor" || (v?.startsWith("calisiyor:") && now - Number(v.slice(10)) > bayatMs)) {
          t.set(h, `calisiyor:${now}`);
          return h;
        }
      }
      return null;
    },
    async bitir(isId, hedef, url) {
      if (url) dosyalar.set(`${isId}:${hedef}`, url);
      durum.get(isId)?.set(hedef, url ? "hazir" : "hata");
    },
    async dosya(isId, hedef) {
      return dosyalar.get(`${isId}:${hedef}`) ?? null;
    },
    async sonuclandir(isId) {
      if (sonuc.has(isId)) return false;
      sonuc.add(isId);
      return true;
    },
  };
}

const isKey = (isId: string) => `dersera:gorsel:is:${isId}`;
const durumKey = (isId: string) => `dersera:gorsel:durum:${isId}`;
const dosyaKey = (isId: string, hedef: string) => `dersera:gorsel:dosya:${isId}:${hedef}`;
const sonucKey = (isId: string) => `dersera:gorsel:sonuc:${isId}`;

// KEYS: durum tablosu. ARGV: şimdi, bayat süresi, hedefler (sırayla). Dönüş: sahiplenilen hedef ya da nil.
const SAHIPLEN = `for i = 3, #ARGV do
  local h = ARGV[i]
  local d = redis.call('HGET', KEYS[1], h)
  if d == 'bekliyor' or (d and string.sub(d, 1, 10) == 'calisiyor:' and tonumber(ARGV[1]) - tonumber(string.sub(d, 11)) > tonumber(ARGV[2])) then
    redis.call('HSET', KEYS[1], h, 'calisiyor:' .. ARGV[1])
    return h
  end
end
return false`;

// KEYS: iş kaydı, durum tablosu. ARGV: iş JSON, ttl, hedefler.
const OLUSTUR = `redis.call('SET', KEYS[1], ARGV[1], 'PX', ARGV[2])
for i = 3, #ARGV do redis.call('HSET', KEYS[2], ARGV[i], 'bekliyor') end
redis.call('PEXPIRE', KEYS[2], ARGV[2])
return 1`;

export function createRedisGorselStore(command: RedisCommand): GorselStore {
  return {
    async olustur(is, ttlMs) {
      await command(["EVAL", OLUSTUR, 2, isKey(is.isId), durumKey(is.isId), JSON.stringify(is), Math.max(1000, ttlMs), ...is.hedefler.map((h) => h.hedef)]);
    },
    async get(isId) {
      const ham = (await command(["GET", isKey(isId)])) as string | null;
      return ham ? (JSON.parse(ham) as GorselIsi) : null;
    },
    async durumlar(isId) {
      const ham = ((await command(["HGETALL", durumKey(isId)])) as string[] | null) ?? [];
      const out: Record<string, HedefDurumu> = {};
      for (let i = 0; i + 1 < ham.length; i += 2) {
        const d = durumOf(ham[i + 1]);
        if (d) out[ham[i]] = d;
      }
      return out;
    },
    async sahiplen(isId, hedefler, now, bayatMs) {
      const r = await command(["EVAL", SAHIPLEN, 1, durumKey(isId), now, bayatMs, ...hedefler]);
      return typeof r === "string" && r ? r : null;
    },
    async bitir(isId, hedef, url) {
      if (url) await command(["SET", dosyaKey(isId, hedef), url]);
      await command(["HSET", durumKey(isId), hedef, url ? "hazir" : "hata"]);
    },
    async dosya(isId, hedef) {
      return ((await command(["GET", dosyaKey(isId, hedef)])) as string | null) ?? null;
    },
    async sonuclandir(isId, ttlMs) {
      return (await command(["SET", sonucKey(isId), "1", "NX", "PX", Math.max(1000, ttlMs)])) === "OK";
    },
  };
}

let store: GorselStore | null = null;
export function getGorselStore(): GorselStore {
  if (!store) {
    const command = redisFromEnv();
    store = command ? createRedisGorselStore(command) : createMemoryGorselStore();
  }
  return store;
}
