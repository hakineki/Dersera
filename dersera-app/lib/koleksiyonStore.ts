import { KOLEKSIYON, type Koleksiyon, type KoleksiyonBilgisi } from "@/lib/koleksiyon";
import { redisFromEnv, type RedisCommand } from "@/lib/redis";

// Öğretmen koleksiyonları deposu: öğretmen başına koleksiyon bilgileri (hash) ve her koleksiyonun oyunları (eklenme
// zamanına göre sıralı küme). Sınırlar ve varlık denetimi yazımla aynı adımda (Lua): eşzamanlı iki ekleme sınırı
// delemez, silinmiş koleksiyona oyun eklenemez.

export type OyunEklemeSonucu = "ok" | "zaten" | "dolu" | "yok";

export interface KoleksiyonStore {
  listele(hesapId: string): Promise<Koleksiyon[]>;
  // Koleksiyon sayısı sınırdaysa false.
  olustur(hesapId: string, k: KoleksiyonBilgisi): Promise<boolean>;
  // Koleksiyon yoksa false.
  adDegistir(hesapId: string, id: string, ad: string): Promise<boolean>;
  sil(hesapId: string, id: string): Promise<boolean>;
  oyunEkle(hesapId: string, id: string, oyunId: string, now: number): Promise<OyunEklemeSonucu>;
  // Koleksiyon yoksa false (oyun zaten yoksa true).
  oyunCikar(hesapId: string, id: string, oyunId: string): Promise<boolean>;
}

export function createMemoryKoleksiyonStore(): KoleksiyonStore {
  const hesaplar = new Map<string, Map<string, { bilgi: KoleksiyonBilgisi; oyunlar: Map<string, number> }>>();
  const hesap = (h: string) => hesaplar.get(h) ?? hesaplar.set(h, new Map()).get(h)!;
  return {
    async listele(hesapId) {
      return [...hesap(hesapId).values()]
        .map(({ bilgi, oyunlar }) => ({ ...bilgi, oyunlar: [...oyunlar].sort((a, b) => b[1] - a[1]).map(([o]) => o) }))
        .sort((a, b) => a.olusturma - b.olusturma);
    },
    async olustur(hesapId, k) {
      const h = hesap(hesapId);
      if (h.size >= KOLEKSIYON.enCok) return false;
      h.set(k.id, { bilgi: { ...k }, oyunlar: new Map() });
      return true;
    },
    async adDegistir(hesapId, id, ad) {
      const k = hesap(hesapId).get(id);
      if (!k) return false;
      k.bilgi = { ...k.bilgi, ad };
      return true;
    },
    async sil(hesapId, id) {
      return hesap(hesapId).delete(id);
    },
    async oyunEkle(hesapId, id, oyunId, now) {
      const k = hesap(hesapId).get(id);
      if (!k) return "yok";
      if (k.oyunlar.has(oyunId)) return "zaten";
      if (k.oyunlar.size >= KOLEKSIYON.oyunEnCok) return "dolu";
      k.oyunlar.set(oyunId, now);
      return "ok";
    },
    async oyunCikar(hesapId, id, oyunId) {
      const k = hesap(hesapId).get(id);
      if (!k) return false;
      k.oyunlar.delete(oyunId);
      return true;
    },
  };
}

const bilgiKey = (hesapId: string) => `dersera:koleksiyon:${hesapId}`;
const oyunlarKey = (hesapId: string, id: string) => `dersera:koleksiyon:${hesapId}:${id}`;

// KEYS: bilgiler. ARGV: id, bilgi JSON, en çok koleksiyon.
const OLUSTUR = `if redis.call('HLEN', KEYS[1]) >= tonumber(ARGV[3]) then return 0 end
redis.call('HSET', KEYS[1], ARGV[1], ARGV[2])
return 1`;
// KEYS: bilgiler. ARGV: id, yeni bilgi JSON.
const AD = `if redis.call('HEXISTS', KEYS[1], ARGV[1]) == 0 then return 0 end
redis.call('HSET', KEYS[1], ARGV[1], ARGV[2])
return 1`;
// KEYS: bilgiler, oyunlar. ARGV: id.
const SIL = `if redis.call('HDEL', KEYS[1], ARGV[1]) == 0 then return 0 end
redis.call('DEL', KEYS[2])
return 1`;
// KEYS: bilgiler, oyunlar. ARGV: id, oyun, zaman, en çok oyun.
const EKLE = `if redis.call('HEXISTS', KEYS[1], ARGV[1]) == 0 then return 'yok' end
if redis.call('ZSCORE', KEYS[2], ARGV[2]) then return 'zaten' end
if redis.call('ZCARD', KEYS[2]) >= tonumber(ARGV[4]) then return 'dolu' end
redis.call('ZADD', KEYS[2], ARGV[3], ARGV[2])
return 'ok'`;
// KEYS: bilgiler, oyunlar. ARGV: id, oyun.
const CIKAR = `if redis.call('HEXISTS', KEYS[1], ARGV[1]) == 0 then return 0 end
redis.call('ZREM', KEYS[2], ARGV[2])
return 1`;

export function createRedisKoleksiyonStore(command: RedisCommand): KoleksiyonStore {
  return {
    async listele(hesapId) {
      const ham = ((await command(["HGETALL", bilgiKey(hesapId)])) as string[] | null) ?? [];
      const bilgiler: KoleksiyonBilgisi[] = [];
      for (let i = 0; i + 1 < ham.length; i += 2) bilgiler.push(JSON.parse(ham[i + 1]) as KoleksiyonBilgisi);
      const oyunlar = await Promise.all(bilgiler.map((b) => command(["ZREVRANGE", oyunlarKey(hesapId, b.id), 0, -1]) as Promise<string[] | null>));
      return bilgiler.map((b, i) => ({ ...b, oyunlar: oyunlar.at(i) ?? [] })).sort((a, b) => a.olusturma - b.olusturma);
    },
    async olustur(hesapId, k) {
      return Number(await command(["EVAL", OLUSTUR, 1, bilgiKey(hesapId), k.id, JSON.stringify(k), KOLEKSIYON.enCok])) === 1;
    },
    async adDegistir(hesapId, id, ad) {
      const ham = (await command(["HGET", bilgiKey(hesapId), id])) as string | null;
      if (!ham) return false;
      const yeni: KoleksiyonBilgisi = { ...(JSON.parse(ham) as KoleksiyonBilgisi), ad };
      return Number(await command(["EVAL", AD, 1, bilgiKey(hesapId), id, JSON.stringify(yeni)])) === 1;
    },
    async sil(hesapId, id) {
      return Number(await command(["EVAL", SIL, 2, bilgiKey(hesapId), oyunlarKey(hesapId, id), id])) === 1;
    },
    async oyunEkle(hesapId, id, oyunId, now) {
      return (await command(["EVAL", EKLE, 2, bilgiKey(hesapId), oyunlarKey(hesapId, id), id, oyunId, now, KOLEKSIYON.oyunEnCok])) as OyunEklemeSonucu;
    },
    async oyunCikar(hesapId, id, oyunId) {
      return Number(await command(["EVAL", CIKAR, 2, bilgiKey(hesapId), oyunlarKey(hesapId, id), id, oyunId])) === 1;
    },
  };
}

let store: KoleksiyonStore | null = null;
export function getKoleksiyonStore(): KoleksiyonStore {
  if (!store) {
    const command = redisFromEnv();
    store = command ? createRedisKoleksiyonStore(command) : createMemoryKoleksiyonStore();
  }
  return store;
}
