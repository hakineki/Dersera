import { redisFromEnv, type RedisCommand } from "@/lib/redis";

// Öğretmen öğrenme takibi deposu: öğretmen (sahip = "hesap:<id>") başına aylık sayaç tablosu. Aynı oyunda aynı
// öğrenci yalnız bir kez sayılır; oyunun ilk sayılan öğrencisinde oyun alanları da bir kez artar. Her sonuç tek komuttur.

export interface OgrenmeTakibiStore {
  // İlk sayımda true (aynı öğrenci tekrar gönderirse false, hiçbir şey yazılmaz).
  ogrenciSay(sahip: string, ay: string, kod: string, oyuncu: string, alanlar: string[], oyunAlanlari: string[], ttlMs: number): Promise<boolean>;
  // aylar sırasıyla, her ay için alan → sayı.
  sayaclar(sahip: string, aylar: string[]): Promise<Record<string, number>[]>;
}

const say = (alanlar: string[]) => {
  const m = new Map<string, number>();
  for (const a of alanlar) m.set(a, (m.get(a) ?? 0) + 1);
  return m;
};

export function createMemoryOgrenmeTakibiStore(): OgrenmeTakibiStore {
  const tablolar = new Map<string, Map<string, number>>();
  const sayilan = new Map<string, Set<string>>();
  const tablo = (k: string) => tablolar.get(k) ?? tablolar.set(k, new Map()).get(k)!;
  return {
    async ogrenciSay(sahip, ay, kod, oyuncu, alanlar, oyunAlanlari) {
      const s = sayilan.get(kod) ?? sayilan.set(kod, new Set()).get(kod)!;
      if (s.has(oyuncu)) return false;
      s.add(oyuncu);
      const t = tablo(`${sahip}:${ay}`);
      for (const [a, n] of say(s.size === 1 ? [...alanlar, ...new Set(oyunAlanlari)] : alanlar)) t.set(a, (t.get(a) ?? 0) + n);
      return true;
    },
    async sayaclar(sahip, aylar) {
      return aylar.map((ay) => Object.fromEntries(tablo(`${sahip}:${ay}`)));
    },
  };
}

const tabloKey = (sahip: string, ay: string) => `dersera:takip:${sahip}:${ay}`;
const sayilanKey = (kod: string) => `dersera:takip:sayilan:${kod}`;
// Aylık tablo bir yıldan uzun tutulur (geçen yılın aynı dönemiyle karşılaştırma).
const TABLO_TTL_MS = 400 * 24 * 60 * 60 * 1000;

// KEYS: sayılan öğrenciler, tablo. ARGV: oyuncu, sayılan ttl, tablo ttl, öğrenci çifti sayısı n, sonra n alan/artış
// çifti, sonra oyun başına bir kez artan alanlar (yalnız oyunun ilk sayılan öğrencisinde).
const OGRENCI = `if redis.call('SADD', KEYS[1], ARGV[1]) == 0 then return 0 end
redis.call('PEXPIRE', KEYS[1], ARGV[2])
local n = tonumber(ARGV[4])
for i = 5, 4 + 2 * n, 2 do redis.call('HINCRBY', KEYS[2], ARGV[i], ARGV[i + 1]) end
if redis.call('SCARD', KEYS[1]) == 1 then
  for i = 5 + 2 * n, #ARGV do redis.call('HINCRBY', KEYS[2], ARGV[i], 1) end
end
redis.call('PEXPIRE', KEYS[2], ARGV[3])
return 1`;

export function createRedisOgrenmeTakibiStore(command: RedisCommand): OgrenmeTakibiStore {
  return {
    async ogrenciSay(sahip, ay, kod, oyuncu, alanlar, oyunAlanlari, ttlMs) {
      const ciftler = [...say(alanlar)];
      const r = await command([
        "EVAL",
        OGRENCI,
        2,
        sayilanKey(kod),
        tabloKey(sahip, ay),
        oyuncu,
        Math.max(1000, ttlMs),
        TABLO_TTL_MS,
        ciftler.length,
        ...ciftler.flat(),
        ...new Set(oyunAlanlari),
      ]);
      return Number(r) === 1;
    },
    async sayaclar(sahip, aylar) {
      const hamlar = await Promise.all(aylar.map((ay) => command(["HGETALL", tabloKey(sahip, ay)]) as Promise<string[] | null>));
      return hamlar.map((ham) => {
        const out: Record<string, number> = {};
        for (let i = 0; ham && i + 1 < ham.length; i += 2) out[ham[i]] = Number(ham[i + 1]);
        return out;
      });
    },
  };
}

let store: OgrenmeTakibiStore | null = null;
export function getOgrenmeTakibiStore(): OgrenmeTakibiStore {
  if (!store) {
    const command = redisFromEnv();
    store = command ? createRedisOgrenmeTakibiStore(command) : createMemoryOgrenmeTakibiStore();
  }
  return store;
}
