import { redisFromEnv, type RedisCommand } from "@/lib/redis";
import type { KrediHareketi } from "@/lib/kredi";

// Hesap başına: ayın kullanılan aylık hakkı (ay sonunda süresi dolar), kazanılan bakiye, son hareketler ve askıdaki
// harcamalar. Harcama tek Redis betiğinde denetlenir, düşülür ve "askıya" yazılır: oluşturma başarılı olursa askıdan
// çıkar; olmazsa (hata, iade hatası ya da platformun işlevi sert kesmesi) askıdaki kayıt iadeyle kapatılır. İade askıdaki
// kaydı atomik olarak sahiplenir: aynı harcama iki kez iade edilemez.

export interface KrediKaydi {
  kullanilan: number;
  kazanilan: number;
  hareketler: KrediHareketi[];
}

export interface AskidakiHarcama {
  id: string;
  ay: string;
  aylik: number;
  kazanilan: number;
  tarih: number;
  // Depodaki ham değer: iade yalnız değer değişmediyse yapılır.
  ham: string;
}

export type HarcamaSonucu = { ok: true; aylik: number; kazanilan: number } | { ok: false; aylikKalan: number; kazanilan: number };

export interface KrediStore {
  oku(hesapId: string, ay: string, hareketSayisi: number): Promise<KrediKaydi>;
  // Önce aylık haktan, yetmezse kazanılandan düşer ve askıya yazar; toplam yetmezse hiçbir şey yazılmaz.
  harca(hesapId: string, ay: string, hak: number, miktar: number, tarih: number, aciklama: string, ttlMs: number, askiId: string): Promise<HarcamaSonucu>;
  // Başarılı oluşturma: harcama kesinleşir. Kayıt zaten yoksa (iade edilmişse) false.
  tamamla(hesapId: string, askiId: string): Promise<boolean>;
  askidakiler(hesapId: string): Promise<AskidakiHarcama[]>;
  // Askıdaki harcamayı düştüğü aya ve paylara göre geri verir; kayıt bu arada kapandıysa hiçbir şey yazmaz (false).
  iade(hesapId: string, aski: AskidakiHarcama, tarih: number, aciklama: string, ttlMs: number): Promise<boolean>;
  odul(hesapId: string, miktar: number, tarih: number, aciklama: string): Promise<void>;
}

const aylikKey = (id: string, ay: string) => `dersera:kredi:${id}:aylik:${ay}`;
const kazanilanKey = (id: string) => `dersera:kredi:${id}:kazanilan`;
const hareketKey = (id: string) => `dersera:kredi:${id}:hareketler`;
const askiKey = (id: string) => `dersera:kredi:${id}:aski`;
export const HAREKET_SAKLAMA = 100;

// Askı değeri: "ay|aylik|kazanilan|tarih" (Lua'da JSON ayrıştırılmadan yazılabilsin diye düz metin).
export const askiDegeri = (ay: string, a: number, k: number, tarih: number) => `${ay}|${a}|${k}|${tarih}`;
function askiOf(id: string, ham: string): AskidakiHarcama | null {
  const m = /^(\d{4}-\d{2})\|(\d+)\|(\d+)\|(\d+)$/.exec(ham);
  return m ? { id, ay: m[1], aylik: Number(m[2]), kazanilan: Number(m[3]), tarih: Number(m[4]), ham } : null;
}

export function createMemoryKrediStore(): KrediStore {
  const aylik = new Map<string, number>();
  const kazanilan = new Map<string, number>();
  const hareketler = new Map<string, KrediHareketi[]>();
  const aski = new Map<string, Map<string, string>>();
  const yaz = (id: string, h: KrediHareketi) => hareketler.set(id, [h, ...(hareketler.get(id) ?? [])].slice(0, HAREKET_SAKLAMA));
  const askiOfHesap = (id: string) => aski.get(id) ?? aski.set(id, new Map()).get(id)!;
  return {
    async oku(id, ay, n) {
      return { kullanilan: aylik.get(aylikKey(id, ay)) ?? 0, kazanilan: kazanilan.get(id) ?? 0, hareketler: (hareketler.get(id) ?? []).slice(0, n) };
    },
    async harca(id, ay, hak, miktar, tarih, aciklama, _ttl, askiId) {
      const kullanilan = aylik.get(aylikKey(id, ay)) ?? 0;
      const kaz = kazanilan.get(id) ?? 0;
      const aylikKalan = Math.max(0, hak - kullanilan);
      if (aylikKalan + kaz < miktar) return { ok: false, aylikKalan, kazanilan: kaz };
      const a = Math.min(miktar, aylikKalan);
      const k = miktar - a;
      aylik.set(aylikKey(id, ay), kullanilan + a);
      kazanilan.set(id, kaz - k);
      askiOfHesap(id).set(askiId, askiDegeri(ay, a, k, tarih));
      yaz(id, { tur: "harcama", miktar: -miktar, aylik: a, kazanilan: k, tarih, aciklama });
      return { ok: true, aylik: a, kazanilan: k };
    },
    async tamamla(id, askiId) {
      return askiOfHesap(id).delete(askiId);
    },
    async askidakiler(id) {
      return [...askiOfHesap(id).entries()].map(([aid, v]) => askiOf(aid, v)).filter((x): x is AskidakiHarcama => !!x);
    },
    async iade(id, h, tarih, aciklama) {
      const m = askiOfHesap(id);
      if (m.get(h.id) !== h.ham) return false;
      m.delete(h.id);
      aylik.set(aylikKey(id, h.ay), Math.max(0, (aylik.get(aylikKey(id, h.ay)) ?? 0) - h.aylik));
      kazanilan.set(id, (kazanilan.get(id) ?? 0) + h.kazanilan);
      yaz(id, { tur: "iade", miktar: h.aylik + h.kazanilan, aylik: h.aylik, kazanilan: h.kazanilan, tarih, aciklama });
      return true;
    },
    async odul(id, miktar, tarih, aciklama) {
      kazanilan.set(id, (kazanilan.get(id) ?? 0) + miktar);
      yaz(id, { tur: "odul", miktar, aylik: 0, kazanilan: miktar, tarih, aciklama });
    },
  };
}

// Hareket JSON'u betikte birleştirilir; açıklama JS'te JSON.stringify ile kaçırılmış olarak gelir.
// KEYS[3]: hareket listesi. a, k: Lua yerel değişkenleri.
const hareketYaz = (tur: string, miktar: string, tarihArg: number, aciklamaArg: number) =>
  `redis.call('LPUSH', KEYS[3], '{"tur":"${tur}","miktar":' .. ${miktar} .. ',"aylik":' .. a .. ',"kazanilan":' .. k .. ',"tarih":' .. ARGV[${tarihArg}] .. ',"aciklama":' .. ARGV[${aciklamaArg}] .. '}')
redis.call('LTRIM', KEYS[3], 0, ${HAREKET_SAKLAMA - 1})`;

// KEYS: aylık kullanılan, kazanılan, hareketler, askı. ARGV: hak, miktar, ttl, tarih, açıklama(JSON), askı id, ay.
// Dönüş: {ok, aylık payı, kazanılan payı} ya da {0, aylık kalan, kazanılan}.
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
redis.call('HSET', KEYS[4], ARGV[6], ARGV[7] .. '|' .. a .. '|' .. k .. '|' .. ARGV[4])
redis.call('PEXPIRE', KEYS[4], ARGV[3])
${hareketYaz("harcama", "(-miktar)", 4, 5)}
return {1, a, k}`;

// KEYS: harcamanın düştüğü ayın aylık anahtarı, kazanılan, hareketler, askı.
// ARGV: askı id, beklenen askı değeri, aylık payı, kazanılan payı, tarih, açıklama(JSON), ttl. Dönüş: 1 iade edildi, 0 kayıt kapanmış.
const IADE = `if redis.call('HGET', KEYS[4], ARGV[1]) ~= ARGV[2] then return 0 end
redis.call('HDEL', KEYS[4], ARGV[1])
local a = tonumber(ARGV[3])
local k = tonumber(ARGV[4])
if a > 0 then
  redis.call('DECRBY', KEYS[1], a)
  redis.call('PEXPIRE', KEYS[1], ARGV[7])
end
if k > 0 then redis.call('INCRBY', KEYS[2], k) end
${hareketYaz("iade", "(a + k)", 5, 6)}
return 1`;

// KEYS: kazanılan, hareketler (KEYS[3] biçimi ortak olsun diye ilk anahtar kullanılmaz). ARGV: miktar, tarih, açıklama(JSON).
const ODUL = `local a = 0
local k = tonumber(ARGV[1])
redis.call('INCRBY', KEYS[2], k)
${hareketYaz("odul", "k", 2, 3)}
return 1`;

export function createRedisKrediStore(command: RedisCommand): KrediStore {
  return {
    async oku(id, ay, n) {
      const [kul, kaz] = ((await command(["MGET", aylikKey(id, ay), kazanilanKey(id)])) as (string | null)[] | null) ?? [];
      const ham = ((await command(["LRANGE", hareketKey(id), 0, n - 1])) as string[] | null) ?? [];
      return { kullanilan: Number(kul ?? 0), kazanilan: Number(kaz ?? 0), hareketler: ham.map((h) => JSON.parse(h) as KrediHareketi) };
    },
    async harca(id, ay, hak, miktar, tarih, aciklama, ttlMs, askiId) {
      const r = (
        (await command(["EVAL", HARCA, 4, aylikKey(id, ay), kazanilanKey(id), hareketKey(id), askiKey(id), hak, miktar, Math.max(1000, ttlMs), tarih, JSON.stringify(aciklama), askiId, ay])) as number[]
      ).map(Number);
      return r[0] === 1 ? { ok: true, aylik: r[1], kazanilan: r[2] } : { ok: false, aylikKalan: r[1], kazanilan: r[2] };
    },
    async tamamla(id, askiId) {
      return Number(await command(["HDEL", askiKey(id), askiId])) === 1;
    },
    async askidakiler(id) {
      const ham = ((await command(["HGETALL", askiKey(id)])) as string[] | null) ?? [];
      const out: AskidakiHarcama[] = [];
      for (let i = 0; i + 1 < ham.length; i += 2) {
        const a = askiOf(ham[i], ham[i + 1]);
        if (a) out.push(a);
      }
      return out;
    },
    async iade(id, h, tarih, aciklama, ttlMs) {
      const r = await command([
        "EVAL", IADE, 4, aylikKey(id, h.ay), kazanilanKey(id), hareketKey(id), askiKey(id),
        h.id, h.ham, h.aylik, h.kazanilan, tarih, JSON.stringify(aciklama), Math.max(1000, ttlMs),
      ]);
      return Number(r) === 1;
    },
    async odul(id, miktar, tarih, aciklama) {
      await command(["EVAL", ODUL, 3, "-", kazanilanKey(id), hareketKey(id), miktar, tarih, JSON.stringify(aciklama)]);
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
