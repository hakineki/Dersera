import { depoKomutu, type RedisCommand } from "@/lib/redis";

// Aylık yapay zekâ kullanım tablosu (alan adları lib/yzMaliyet.ts). Bir çağrının bütün alanları tek betikte artar.

export interface YzMaliyetStore {
  artir(ay: string, alanlar: Record<string, number>): Promise<void>;
  tablo(ay: string): Promise<Record<string, number>>;
}

// Karşılaştırma için bir yıldan uzun tutulur.
export const MALIYET_SAKLAMA_MS = 400 * 24 * 60 * 60 * 1000;

export function createMemoryYzMaliyetStore(): YzMaliyetStore {
  const tablolar = new Map<string, Map<string, number>>();
  return {
    async artir(ay, alanlar) {
      const t = tablolar.get(ay) ?? tablolar.set(ay, new Map()).get(ay)!;
      for (const [a, n] of Object.entries(alanlar)) if (n) t.set(a, (t.get(a) ?? 0) + Math.round(n));
    },
    async tablo(ay) {
      return Object.fromEntries(tablolar.get(ay) ?? []);
    },
  };
}

const tabloKey = (ay: string) => `dersera:yzmaliyet:${ay}`;

// KEYS: tablo. ARGV: saklama ms, sonra alan/artış çiftleri.
const ARTIR = `for i = 2, #ARGV, 2 do redis.call('HINCRBY', KEYS[1], ARGV[i], ARGV[i + 1]) end
redis.call('PEXPIRE', KEYS[1], ARGV[1])
return 1`;

export function createRedisYzMaliyetStore(command: RedisCommand): YzMaliyetStore {
  return {
    async artir(ay, alanlar) {
      const ciftler = Object.entries(alanlar)
        .filter(([, n]) => n)
        .flatMap(([a, n]) => [a, Math.round(n)]);
      if (ciftler.length) await command(["EVAL", ARTIR, 1, tabloKey(ay), MALIYET_SAKLAMA_MS, ...ciftler]);
    },
    async tablo(ay) {
      const ham = ((await command(["HGETALL", tabloKey(ay)])) as string[] | null) ?? [];
      const out: Record<string, number> = {};
      for (let i = 0; i + 1 < ham.length; i += 2) out[ham[i]] = Number(ham[i + 1]);
      return out;
    },
  };
}

let store: YzMaliyetStore | null = null;
export function getYzMaliyetStore(): YzMaliyetStore {
  if (!store) {
    const command = depoKomutu("yapay zekâ maliyet kaydı");
    store = command ? createRedisYzMaliyetStore(command) : createMemoryYzMaliyetStore();
  }
  return store;
}
