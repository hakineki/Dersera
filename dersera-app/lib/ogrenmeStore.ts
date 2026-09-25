import { OGRENME, type Oneri, type OneriDurumu } from "@/lib/ogrenme";
import { redisFromEnv, type RedisCommand } from "@/lib/redis";

// Öğrenme döngüsü deposu: aylık sayaç tablosu (her olay tek komut), öğrenci başına tek sayım, yapay zekâ güncelleme
// talimatları (son N, kimliksiz) ve öneriler (karar tek sefer: beklenen durumdan geçiş).

export interface OgrenmeStore {
  // Her alan 1 artar (aynı alan birden çok kez verilirse o kadar).
  sayaclariArtir(ay: string, alanlar: string[]): Promise<void>;
  // Aynı oyun kodunda aynı öğrenci yalnız bir kez sayılır; ilk sayımda true.
  ogrenciSay(ay: string, kod: string, oyuncu: string, alanlar: string[], ttlMs: number): Promise<boolean>;
  sayaclar(ay: string): Promise<Record<string, number>>;
  talimatEkle(metin: string): Promise<void>;
  talimatlar(adet: number): Promise<string[]>;
  oneriYaz(o: Oneri): Promise<void>;
  oneriler(): Promise<Oneri[]>;
  // Yalnız öneri hâlâ beklenen durumdaysa günceller (eşzamanlı iki karar çakışmasın).
  oneriGecis(id: string, beklenen: OneriDurumu[], yeni: Pick<Oneri, "durum" | "karar">): Promise<Oneri | null>;
}

const say = (alanlar: string[]) => {
  const m = new Map<string, number>();
  for (const a of alanlar) m.set(a, (m.get(a) ?? 0) + 1);
  return m;
};

export function createMemoryOgrenmeStore(): OgrenmeStore {
  const tablolar = new Map<string, Map<string, number>>();
  const sayilan = new Set<string>();
  let talimatlar: string[] = [];
  const oneriler = new Map<string, Oneri>();
  const tablo = (ay: string) => tablolar.get(ay) ?? tablolar.set(ay, new Map()).get(ay)!;
  const artir = (ay: string, alanlar: string[]) => {
    const t = tablo(ay);
    for (const [a, n] of say(alanlar)) t.set(a, (t.get(a) ?? 0) + n);
  };
  return {
    async sayaclariArtir(ay, alanlar) {
      artir(ay, alanlar);
    },
    async ogrenciSay(ay, kod, oyuncu, alanlar) {
      const k = `${kod}:${oyuncu}`;
      if (sayilan.has(k)) return false;
      sayilan.add(k);
      artir(ay, alanlar);
      return true;
    },
    async sayaclar(ay) {
      return Object.fromEntries(tablo(ay));
    },
    async talimatEkle(metin) {
      talimatlar = [metin, ...talimatlar].slice(0, OGRENME.talimatSaklama);
    },
    async talimatlar(adet) {
      return talimatlar.slice(0, adet);
    },
    async oneriYaz(o) {
      oneriler.set(o.id, o);
    },
    async oneriler() {
      return [...oneriler.values()].sort((a, b) => b.tarih - a.tarih);
    },
    async oneriGecis(id, beklenen, yeni) {
      const o = oneriler.get(id);
      if (!o || !beklenen.includes(o.durum)) return null;
      const g = { ...o, ...yeni };
      oneriler.set(id, g);
      return g;
    },
  };
}

const tabloKey = (ay: string) => `dersera:ogrenme:sinyal:${ay}`;
const sayilanKey = (kod: string) => `dersera:ogrenme:sayilan:${kod}`;
const TALIMAT_KEY = "dersera:ogrenme:talimatlar";
const ONERI_KEY = "dersera:ogrenme:oneriler";
// Aylık tablo bir yıldan uzun tutulur (geçmiş aylarla karşılaştırma).
const TABLO_TTL_MS = 400 * 24 * 60 * 60 * 1000;

// KEYS: tablo. ARGV: ttl, sonra alan/artış çiftleri.
const ARTIR = `for i = 2, #ARGV, 2 do redis.call('HINCRBY', KEYS[1], ARGV[i], ARGV[i + 1]) end
redis.call('PEXPIRE', KEYS[1], ARGV[1])
return 1`;
// KEYS: sayılan öğrenciler, tablo. ARGV: oyuncu, sayılan ttl, tablo ttl, sonra alan/artış çiftleri.
const OGRENCI = `if redis.call('SADD', KEYS[1], ARGV[1]) == 0 then return 0 end
redis.call('PEXPIRE', KEYS[1], ARGV[2])
for i = 4, #ARGV, 2 do redis.call('HINCRBY', KEYS[2], ARGV[i], ARGV[i + 1]) end
redis.call('PEXPIRE', KEYS[2], ARGV[3])
return 1`;
// KEYS: öneriler. ARGV: id, yeni JSON, beklenen durumlar (virgüllü). Durum JSON'dan düz metinle okunur.
const GECIS = `local v = redis.call('HGET', KEYS[1], ARGV[1])
if not v then return false end
local d = string.match(v, '"durum":"([a-z]+)"')
if not d or not string.find(',' .. ARGV[3] .. ',', ',' .. d .. ',', 1, true) then return false end
redis.call('HSET', KEYS[1], ARGV[1], ARGV[2])
return 1`;

const ciftler = (alanlar: string[]) => [...say(alanlar)].flatMap(([a, n]) => [a, n]);

export function createRedisOgrenmeStore(command: RedisCommand): OgrenmeStore {
  return {
    async sayaclariArtir(ay, alanlar) {
      if (!alanlar.length) return;
      await command(["EVAL", ARTIR, 1, tabloKey(ay), TABLO_TTL_MS, ...ciftler(alanlar)]);
    },
    async ogrenciSay(ay, kod, oyuncu, alanlar, ttlMs) {
      const r = await command(["EVAL", OGRENCI, 2, sayilanKey(kod), tabloKey(ay), oyuncu, Math.max(1000, ttlMs), TABLO_TTL_MS, ...ciftler(alanlar)]);
      return Number(r) === 1;
    },
    async sayaclar(ay) {
      const ham = ((await command(["HGETALL", tabloKey(ay)])) as string[] | null) ?? [];
      const out: Record<string, number> = {};
      for (let i = 0; i + 1 < ham.length; i += 2) out[ham[i]] = Number(ham[i + 1]);
      return out;
    },
    async talimatEkle(metin) {
      await command(["EVAL", "redis.call('LPUSH', KEYS[1], ARGV[1]) redis.call('LTRIM', KEYS[1], 0, tonumber(ARGV[2]) - 1) return 1", 1, TALIMAT_KEY, metin, OGRENME.talimatSaklama]);
    },
    async talimatlar(adet) {
      return ((await command(["LRANGE", TALIMAT_KEY, 0, adet - 1])) as string[] | null) ?? [];
    },
    async oneriYaz(o) {
      await command(["HSET", ONERI_KEY, o.id, JSON.stringify(o)]);
    },
    async oneriler() {
      const ham = ((await command(["HVALS", ONERI_KEY])) as string[] | null) ?? [];
      return ham.map((h) => JSON.parse(h) as Oneri).sort((a, b) => b.tarih - a.tarih);
    },
    async oneriGecis(id, beklenen, yeni) {
      const onceki = ((await command(["HGET", ONERI_KEY, id])) as string | null) ?? null;
      if (!onceki) return null;
      const g: Oneri = { ...(JSON.parse(onceki) as Oneri), ...yeni };
      const r = await command(["EVAL", GECIS, 1, ONERI_KEY, id, JSON.stringify(g), beklenen.join(",")]);
      return Number(r) === 1 ? g : null;
    },
  };
}

let store: OgrenmeStore | null = null;
export function getOgrenmeStore(): OgrenmeStore {
  if (!store) {
    const command = redisFromEnv();
    store = command ? createRedisOgrenmeStore(command) : createMemoryOgrenmeStore();
  }
  return store;
}
