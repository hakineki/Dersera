import { redisFromEnv, type RedisCommand } from "@/lib/redis";
import type { KrediHareketi } from "@/lib/kredi";

// Hesap başına: ayın kullanılan aylık hakkı (ay sonunda süresi dolar), kazanılan bakiye ve son hareketler.
// Harcama tek Redis betiğinde denetlenir ve yazılır: iki eşzamanlı oluşturma bakiyeyi eksiye düşüremez.

export interface KrediKaydi {
  kullanilan: number;
  kazanilan: number;
  hareketler: KrediHareketi[];
}

export type HarcamaSonucu = { ok: true; aylik: number; kazanilan: number } | { ok: false; aylikKalan: number; kazanilan: number };

export interface KrediStore {
  oku(hesapId: string, ay: string, hareketSayisi: number): Promise<KrediKaydi>;
  // Önce aylık haktan, yetmezse kazanılandan düşer; toplam yetmezse hiçbir şey yazılmaz.
  harca(hesapId: string, ay: string, hak: number, miktar: number, tarih: number, aciklama: string, ttlMs: number): Promise<HarcamaSonucu>;
  // Başarısız oluşturmanın harcaması, düştüğü aya ve paylara göre geri verilir.
  iade(hesapId: string, ay: string, aylik: number, kazanilan: number, tarih: number, aciklama: string): Promise<void>;
  odul(hesapId: string, miktar: number, tarih: number, aciklama: string): Promise<void>;
}

const aylikKey = (id: string, ay: string) => `dersera:kredi:${id}:aylik:${ay}`;
const kazanilanKey = (id: string) => `dersera:kredi:${id}:kazanilan`;
const hareketKey = (id: string) => `dersera:kredi:${id}:hareketler`;
export const HAREKET_SAKLAMA = 100;

export function createMemoryKrediStore(): KrediStore {
  const aylik = new Map<string, number>();
  const kazanilan = new Map<string, number>();
  const hareketler = new Map<string, KrediHareketi[]>();
  const yaz = (id: string, h: KrediHareketi) => hareketler.set(id, [h, ...(hareketler.get(id) ?? [])].slice(0, HAREKET_SAKLAMA));
  return {
    async oku(id, ay, n) {
      return { kullanilan: aylik.get(aylikKey(id, ay)) ?? 0, kazanilan: kazanilan.get(id) ?? 0, hareketler: (hareketler.get(id) ?? []).slice(0, n) };
    },
    async harca(id, ay, hak, miktar, tarih, aciklama) {
      const kullanilan = aylik.get(aylikKey(id, ay)) ?? 0;
      const kaz = kazanilan.get(id) ?? 0;
      const aylikKalan = Math.max(0, hak - kullanilan);
      if (aylikKalan + kaz < miktar) return { ok: false, aylikKalan, kazanilan: kaz };
      const a = Math.min(miktar, aylikKalan);
      const k = miktar - a;
      aylik.set(aylikKey(id, ay), kullanilan + a);
      kazanilan.set(id, kaz - k);
      yaz(id, { tur: "harcama", miktar: -miktar, aylik: a, kazanilan: k, tarih, aciklama });
      return { ok: true, aylik: a, kazanilan: k };
    },
    async iade(id, ay, a, k, tarih, aciklama) {
      aylik.set(aylikKey(id, ay), Math.max(0, (aylik.get(aylikKey(id, ay)) ?? 0) - a));
      kazanilan.set(id, (kazanilan.get(id) ?? 0) + k);
      yaz(id, { tur: "iade", miktar: a + k, aylik: a, kazanilan: k, tarih, aciklama });
    },
    async odul(id, miktar, tarih, aciklama) {
      kazanilan.set(id, (kazanilan.get(id) ?? 0) + miktar);
      yaz(id, { tur: "odul", miktar, aylik: 0, kazanilan: miktar, tarih, aciklama });
    },
  };
}

// Hareket JSON'u betikte birleştirilir; açıklama JS'te JSON.stringify ile kaçırılmış olarak gelir.
const HAREKET_YAZ = (tur: string, miktarIfadesi: string) =>
  `redis.call('LPUSH', KEYS[3], '{"tur":"${tur}","miktar":' .. ${miktarIfadesi} .. ',"aylik":' .. a .. ',"kazanilan":' .. k .. ',"tarih":' .. ARGV[4] .. ',"aciklama":' .. ARGV[5] .. '}')
redis.call('LTRIM', KEYS[3], 0, ${HAREKET_SAKLAMA - 1})`;

// KEYS: aylık kullanılan, kazanılan, hareketler. ARGV: hak, miktar, ttl, tarih, açıklama(JSON). Dönüş: {ok, aylık, kazanılan}.
const HARCA = `local kullanilan = tonumber(redis.call('GET', KEYS[1]) or '0')
local kaz = tonumber(redis.call('GET', KEYS[2]) or '0')
local miktar = tonumber(ARGV[2])
local aylikKalan = math.max(0, tonumber(ARGV[1]) - kullanilan)
if aylikKalan + kaz < miktar then return {0, aylikKalan, kaz} end
local a = math.min(miktar, aylikKalan)
local k = miktar - a
if a > 0 then
  redis.call('INCRBY', KEYS[1], a)
  redis.call('PEXPIRE', KEYS[1], ARGV[3])
end
if k > 0 then redis.call('DECRBY', KEYS[2], k) end
${HAREKET_YAZ("harcama", "(-miktar)")}
return {1, a, k}`;

// ARGV: aylık payı, kazanılan payı, (boş), tarih, açıklama(JSON).
const IADE = `local a = tonumber(ARGV[1])
local k = tonumber(ARGV[2])
if a > 0 then redis.call('DECRBY', KEYS[1], a) end
if k > 0 then redis.call('INCRBY', KEYS[2], k) end
${HAREKET_YAZ("iade", "(a + k)")}
return 1`;

// ARGV: (boş), miktar, (boş), tarih, açıklama(JSON). KEYS[1] kullanılmaz (betik biçimi ortak).
const ODUL = `local a = 0
local k = tonumber(ARGV[2])
redis.call('INCRBY', KEYS[2], k)
${HAREKET_YAZ("odul", "k")}
return 1`;

export function createRedisKrediStore(command: RedisCommand): KrediStore {
  const keys = (id: string, ay: string) => [3, aylikKey(id, ay), kazanilanKey(id), hareketKey(id)];
  return {
    async oku(id, ay, n) {
      const [kul, kaz] = ((await command(["MGET", aylikKey(id, ay), kazanilanKey(id)])) as (string | null)[] | null) ?? [];
      const ham = ((await command(["LRANGE", hareketKey(id), 0, n - 1])) as string[] | null) ?? [];
      return { kullanilan: Number(kul ?? 0), kazanilan: Number(kaz ?? 0), hareketler: ham.map((h) => JSON.parse(h) as KrediHareketi) };
    },
    async harca(id, ay, hak, miktar, tarih, aciklama, ttlMs) {
      const r = ((await command(["EVAL", HARCA, ...keys(id, ay), hak, miktar, Math.max(1000, ttlMs), tarih, JSON.stringify(aciklama)])) as number[]).map(Number);
      return r[0] === 1 ? { ok: true, aylik: r[1], kazanilan: r[2] } : { ok: false, aylikKalan: r[1], kazanilan: r[2] };
    },
    async iade(id, ay, a, k, tarih, aciklama) {
      await command(["EVAL", IADE, ...keys(id, ay), a, k, 0, tarih, JSON.stringify(aciklama)]);
    },
    async odul(id, miktar, tarih, aciklama) {
      await command(["EVAL", ODUL, ...keys(id, "-"), 0, miktar, 0, tarih, JSON.stringify(aciklama)]);
    },
  };
}

export class KrediUnavailableError extends Error {}

let store: KrediStore | null = null;

// Üretimde bellek içi bakiye her sunucu örneğinde ayrı olur; bu yüzden Redis zorunludur.
export function getKrediStore(): KrediStore {
  if (!store) {
    const command = redisFromEnv();
    if (!command && process.env.NODE_ENV === "production") throw new KrediUnavailableError("Kredi için Redis gerekli");
    store = command ? createRedisKrediStore(command) : createMemoryKrediStore();
  }
  return store;
}
