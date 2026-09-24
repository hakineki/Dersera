import { redisFromEnv, type RedisCommand } from "@/lib/redis";
import type { KrediHareketi, OkulHavuzu } from "@/lib/kredi";

// Hesap başına: ayın kullanılan aylık hakkı (ay sonunda süresi dolar), kazanılan bakiye, son hareketler ve askıdaki
// harcamalar. Harcama tek Redis betiğinde denetlenir, düşülür ve "askıya" yazılır: oluşturma başarılı olursa askıdan
// çıkar; olmazsa (hata, iade hatası ya da platformun işlevi sert kesmesi) askıdaki kayıt iadeyle kapatılır. İade askıdaki
// kaydı atomik olarak sahiplenir: aynı harcama iki kez iade edilemez.
//
// Okul havuzu (okul başına): aylık hak (platform yöneticisi atar), öğretmen başına aylık sınır (okul yöneticisi), ayın
// kullanılanı ve öğretmen başına kullanım. Harcama sırası kişisel aylık → okul havuzu → kazanılan; havuz payı ve ödeyen
// okul askı kaydına yazılır, iade o okulun o ayına yapılır (öğretmen bu arada okuldan ayrılsa da).

export interface KrediKaydi {
  kullanilan: number;
  kazanilan: number;
  hareketler: KrediHareketi[];
}

export interface AskidakiHarcama {
  id: string;
  ay: string;
  aylik: number;
  okul: number;
  kazanilan: number;
  tarih: number;
  // Havuzundan düşülen okul (okul payı yoksa null).
  okulId: string | null;
  // Depodaki ham değer: iade yalnız değer değişmediyse yapılır.
  ham: string;
}

export type HarcamaSonucu = { ok: true; aylik: number; okul: number; kazanilan: number } | { ok: false; aylikKalan: number; okulKalan: number; kazanilan: number };

export interface OkulHavuzOzeti {
  okulId: string;
  hak: number;
  kullanilan: number;
}

export interface KrediStore {
  oku(hesapId: string, ay: string, hareketSayisi: number): Promise<KrediKaydi>;
  // Önce aylık haktan, sonra (okulId verilmişse) okul havuzundan, yetmezse kazanılandan düşer ve askıya yazar; toplam
  // yetmezse hiçbir şey yazılmaz. Havuzun hakkı ve öğretmen sınırı betik içinde okunur.
  harca(hesapId: string, ay: string, hak: number, miktar: number, tarih: number, aciklama: string, ttlMs: number, askiId: string, okulId?: string | null): Promise<HarcamaSonucu>;
  // Başarılı oluşturma: harcama kesinleşir. Kayıt zaten yoksa (iade edilmişse) false.
  tamamla(hesapId: string, askiId: string): Promise<boolean>;
  askidakiler(hesapId: string): Promise<AskidakiHarcama[]>;
  // Askıdaki harcamayı düştüğü aya ve paylara göre geri verir; kayıt bu arada kapandıysa hiçbir şey yazmaz (false).
  iade(hesapId: string, aski: AskidakiHarcama, tarih: number, aciklama: string, ttlMs: number): Promise<boolean>;
  odul(hesapId: string, miktar: number, tarih: number, aciklama: string): Promise<void>;
  okulHavuzu(okulId: string, ay: string): Promise<OkulHavuzu>;
  // 0 havuzu kaldırır (bu ayki kullanım kaydı kalır).
  okulHakYaz(okulId: string, hak: number): Promise<void>;
  // 0 sınırı kaldırır.
  okulSinirYaz(okulId: string, sinir: number): Promise<void>;
  // Havuz atanmış okullar ve bu ayki kullanımları.
  okulHavuzlari(ay: string): Promise<OkulHavuzOzeti[]>;
}

const aylikKey = (id: string, ay: string) => `dersera:kredi:${id}:aylik:${ay}`;
const kazanilanKey = (id: string) => `dersera:kredi:${id}:kazanilan`;
const hareketKey = (id: string) => `dersera:kredi:${id}:hareketler`;
const askiKey = (id: string) => `dersera:kredi:${id}:aski`;
const okulHakKey = (okulId: string) => `dersera:kredi:okul:${okulId}:hak`;
const okulSinirKey = (okulId: string) => `dersera:kredi:okul:${okulId}:sinir`;
const okulAylikKey = (okulId: string, ay: string) => `dersera:kredi:okul:${okulId}:aylik:${ay}`;
const okulOgretmenKey = (okulId: string, ay: string) => `dersera:kredi:okul:${okulId}:ogretmen:${ay}`;
const HAVUZLAR_KEY = "dersera:kredi:okul-havuzlari";
// Okul havuzu kullanılmayan betik çağrılarında anahtar yerine (hiç okunmaz, yazılmaz).
const BOS = "-";
export const HAREKET_SAKLAMA = 100;

// Askı değeri: "ay|aylik|kazanilan|tarih|okul|okulId" (Lua'da JSON ayrıştırılmadan yazılabilsin diye düz metin). Okul
// havuzundan önceki kayıtlar "ay|aylik|kazanilan|tarih" biçimindedir ve okul payı 0 okunur.
export const askiDegeri = (ay: string, a: number, k: number, tarih: number, o = 0, okulId: string | null = null) => `${ay}|${a}|${k}|${tarih}|${o}|${okulId ?? ""}`;
function askiOf(id: string, ham: string): AskidakiHarcama | null {
  const m = /^(\d{4}-\d{2})\|(\d+)\|(\d+)\|(\d+)(?:\|(\d+)\|([0-9a-f-]{0,36}))?$/.exec(ham);
  if (!m) return null;
  const okul = Number(m[5] ?? 0);
  const okulId = m[6] || null;
  // Okul payı olup okulu olmayan kayıt bozuktur: iadesi hangi havuza yapılacağını bilemez.
  if (okul > 0 && !okulId) return null;
  return { id, ay: m[1], aylik: Number(m[2]), okul, kazanilan: Number(m[3]), tarih: Number(m[4]), okulId, ham };
}

export function createMemoryKrediStore(): KrediStore {
  const aylik = new Map<string, number>();
  const kazanilan = new Map<string, number>();
  const hareketler = new Map<string, KrediHareketi[]>();
  const aski = new Map<string, Map<string, string>>();
  const okulHak = new Map<string, number>();
  const okulSinir = new Map<string, number>();
  const okulAylik = new Map<string, number>();
  const okulOgretmen = new Map<string, Map<string, number>>();
  const yaz = (id: string, h: KrediHareketi) => hareketler.set(id, [h, ...(hareketler.get(id) ?? [])].slice(0, HAREKET_SAKLAMA));
  const askiOfHesap = (id: string) => aski.get(id) ?? aski.set(id, new Map()).get(id)!;
  const ogretmenTablosu = (okulId: string, ay: string) => okulOgretmen.get(okulAylikKey(okulId, ay)) ?? okulOgretmen.set(okulAylikKey(okulId, ay), new Map()).get(okulAylikKey(okulId, ay))!;
  const havuzOf = (okulId: string, ay: string): OkulHavuzu => ({
    hak: okulHak.get(okulId) ?? 0,
    sinir: okulSinir.get(okulId) ?? 0,
    kullanilan: okulAylik.get(okulAylikKey(okulId, ay)) ?? 0,
    ogretmenler: Object.fromEntries(ogretmenTablosu(okulId, ay)),
  });
  return {
    async oku(id, ay, n) {
      return { kullanilan: aylik.get(aylikKey(id, ay)) ?? 0, kazanilan: kazanilan.get(id) ?? 0, hareketler: (hareketler.get(id) ?? []).slice(0, n) };
    },
    async harca(id, ay, hak, miktar, tarih, aciklama, _ttl, askiId, okulId = null) {
      const kullanilan = aylik.get(aylikKey(id, ay)) ?? 0;
      const kaz = kazanilan.get(id) ?? 0;
      const aylikKalan = Math.max(0, hak - kullanilan);
      let okulKalan = 0;
      if (okulId) {
        const h = havuzOf(okulId, ay);
        okulKalan = Math.max(0, h.hak - h.kullanilan);
        if (h.sinir > 0) okulKalan = Math.min(okulKalan, Math.max(0, h.sinir - (h.ogretmenler[id] ?? 0)));
      }
      if (aylikKalan + okulKalan + kaz < miktar) return { ok: false, aylikKalan, okulKalan, kazanilan: kaz };
      const a = Math.min(miktar, aylikKalan);
      const o = Math.min(miktar - a, okulKalan);
      const k = miktar - a - o;
      aylik.set(aylikKey(id, ay), kullanilan + a);
      if (o > 0 && okulId) {
        okulAylik.set(okulAylikKey(okulId, ay), (okulAylik.get(okulAylikKey(okulId, ay)) ?? 0) + o);
        const t = ogretmenTablosu(okulId, ay);
        t.set(id, (t.get(id) ?? 0) + o);
      }
      kazanilan.set(id, kaz - k);
      askiOfHesap(id).set(askiId, askiDegeri(ay, a, k, tarih, o, okulId));
      yaz(id, { tur: "harcama", miktar: -miktar, aylik: a, okul: o, kazanilan: k, tarih, aciklama });
      return { ok: true, aylik: a, okul: o, kazanilan: k };
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
      if (h.okul > 0 && h.okulId) {
        okulAylik.set(okulAylikKey(h.okulId, h.ay), Math.max(0, (okulAylik.get(okulAylikKey(h.okulId, h.ay)) ?? 0) - h.okul));
        const t = ogretmenTablosu(h.okulId, h.ay);
        t.set(id, Math.max(0, (t.get(id) ?? 0) - h.okul));
      }
      kazanilan.set(id, (kazanilan.get(id) ?? 0) + h.kazanilan);
      yaz(id, { tur: "iade", miktar: h.aylik + h.okul + h.kazanilan, aylik: h.aylik, okul: h.okul, kazanilan: h.kazanilan, tarih, aciklama });
      return true;
    },
    async odul(id, miktar, tarih, aciklama) {
      kazanilan.set(id, (kazanilan.get(id) ?? 0) + miktar);
      yaz(id, { tur: "odul", miktar, aylik: 0, okul: 0, kazanilan: miktar, tarih, aciklama });
    },
    async okulHavuzu(okulId, ay) {
      return havuzOf(okulId, ay);
    },
    async okulHakYaz(okulId, hak) {
      if (hak > 0) okulHak.set(okulId, hak);
      else okulHak.delete(okulId);
    },
    async okulSinirYaz(okulId, sinir) {
      if (sinir > 0) okulSinir.set(okulId, sinir);
      else okulSinir.delete(okulId);
    },
    async okulHavuzlari(ay) {
      return [...okulHak.entries()].map(([okulId, hak]) => ({ okulId, hak, kullanilan: okulAylik.get(okulAylikKey(okulId, ay)) ?? 0 }));
    },
  };
}

// Hareket JSON'u betikte birleştirilir; açıklama JS'te JSON.stringify ile kaçırılmış olarak gelir.
// KEYS[3]: hareket listesi. a, o, k: Lua yerel değişkenleri (aylık, okul, kazanılan payları).
const hareketYaz = (tur: string, miktar: string, tarihArg: number, aciklamaArg: number) =>
  `redis.call('LPUSH', KEYS[3], '{"tur":"${tur}","miktar":' .. ${miktar} .. ',"aylik":' .. a .. ',"okul":' .. o .. ',"kazanilan":' .. k .. ',"tarih":' .. ARGV[${tarihArg}] .. ',"aciklama":' .. ARGV[${aciklamaArg}] .. '}')
redis.call('LTRIM', KEYS[3], 0, ${HAREKET_SAKLAMA - 1})`;

// KEYS: aylık kullanılan, kazanılan, hareketler, askı, okul hakkı, okul öğretmen sınırı, okulun ayın kullanılanı, okulun
// ayın öğretmen kullanımı (okul yoksa son dördü "-" ve hiç dokunulmaz).
// ARGV: hak, miktar, ttl, tarih, açıklama(JSON), askı id, ay, hesap id, okul id ('' yoksa).
// Dönüş: {1, aylık payı, okul payı, kazanılan payı} ya da {0, aylık kalan, okul kalan, kazanılan}.
const HARCA = `local kullanilan = tonumber(redis.call('GET', KEYS[1]) or '0')
local kaz = tonumber(redis.call('GET', KEYS[2]) or '0')
local miktar = tonumber(ARGV[2])
local aylikKalan = math.max(0, tonumber(ARGV[1]) - kullanilan)
local okulKalan = 0
if ARGV[9] ~= '' then
  okulKalan = math.max(0, tonumber(redis.call('GET', KEYS[5]) or '0') - tonumber(redis.call('GET', KEYS[7]) or '0'))
  local sinir = tonumber(redis.call('GET', KEYS[6]) or '0')
  if sinir > 0 then
    okulKalan = math.min(okulKalan, math.max(0, sinir - tonumber(redis.call('HGET', KEYS[8], ARGV[8]) or '0')))
  end
end
if aylikKalan + okulKalan + kaz < miktar then return {0, aylikKalan, okulKalan, kaz} end
local a = math.min(miktar, aylikKalan)
local o = math.min(miktar - a, okulKalan)
local k = miktar - a - o
if a > 0 then
  redis.call('INCRBY', KEYS[1], a)
  redis.call('PEXPIRE', KEYS[1], ARGV[3])
end
if o > 0 then
  redis.call('INCRBY', KEYS[7], o)
  redis.call('PEXPIRE', KEYS[7], ARGV[3])
  redis.call('HINCRBY', KEYS[8], ARGV[8], o)
  redis.call('PEXPIRE', KEYS[8], ARGV[3])
end
if k > 0 then redis.call('DECRBY', KEYS[2], k) end
redis.call('HSET', KEYS[4], ARGV[6], ARGV[7] .. '|' .. a .. '|' .. k .. '|' .. ARGV[4] .. '|' .. o .. '|' .. ARGV[9])
redis.call('PEXPIRE', KEYS[4], ARGV[3])
${hareketYaz("harcama", "(-miktar)", 4, 5)}
return {1, a, o, k}`;

// KEYS: harcamanın düştüğü ayın aylık anahtarı, kazanılan, hareketler, askı, ödeyen okulun o ayki kullanılanı ve
// öğretmen kullanımı (okul payı yoksa "-"). ARGV: askı id, beklenen askı değeri, aylık payı, kazanılan payı, tarih,
// açıklama(JSON), ttl, okul payı, hesap id. Dönüş: 1 iade edildi, 0 kayıt kapanmış.
const IADE = `if redis.call('HGET', KEYS[4], ARGV[1]) ~= ARGV[2] then return 0 end
redis.call('HDEL', KEYS[4], ARGV[1])
local a = tonumber(ARGV[3])
local k = tonumber(ARGV[4])
local o = tonumber(ARGV[8])
if a > 0 then
  redis.call('DECRBY', KEYS[1], a)
  redis.call('PEXPIRE', KEYS[1], ARGV[7])
end
if o > 0 then
  redis.call('DECRBY', KEYS[5], o)
  redis.call('PEXPIRE', KEYS[5], ARGV[7])
  redis.call('HINCRBY', KEYS[6], ARGV[9], -o)
  redis.call('PEXPIRE', KEYS[6], ARGV[7])
end
if k > 0 then redis.call('INCRBY', KEYS[2], k) end
${hareketYaz("iade", "(a + o + k)", 5, 6)}
return 1`;

// KEYS: kazanılan, hareketler (KEYS[3] biçimi ortak olsun diye ilk anahtar kullanılmaz). ARGV: miktar, tarih, açıklama(JSON).
const ODUL = `local a = 0
local o = 0
local k = tonumber(ARGV[1])
redis.call('INCRBY', KEYS[2], k)
${hareketYaz("odul", "k", 2, 3)}
return 1`;

// KEYS: okul hakkı, havuzlu okullar tablosu. ARGV: okul id, hak (0: kaldır). Hak ile tablo birlikte değişir.
const HAK_YAZ = `if tonumber(ARGV[2]) > 0 then
  redis.call('SET', KEYS[1], ARGV[2])
  redis.call('HSET', KEYS[2], ARGV[1], ARGV[2])
else
  redis.call('DEL', KEYS[1])
  redis.call('HDEL', KEYS[2], ARGV[1])
end
return 1`;

const sayiTablosu = (ham: string[] | null): Record<string, number> => {
  const out: Record<string, number> = {};
  for (let i = 0; ham && i + 1 < ham.length; i += 2) out[ham[i]] = Number(ham[i + 1]);
  return out;
};

export function createRedisKrediStore(command: RedisCommand): KrediStore {
  return {
    async oku(id, ay, n) {
      const [kul, kaz] = ((await command(["MGET", aylikKey(id, ay), kazanilanKey(id)])) as (string | null)[] | null) ?? [];
      const ham = ((await command(["LRANGE", hareketKey(id), 0, n - 1])) as string[] | null) ?? [];
      return { kullanilan: Number(kul ?? 0), kazanilan: Number(kaz ?? 0), hareketler: ham.map((h) => JSON.parse(h) as KrediHareketi) };
    },
    async harca(id, ay, hak, miktar, tarih, aciklama, ttlMs, askiId, okulId = null) {
      const okulAnahtarlari = okulId ? [okulHakKey(okulId), okulSinirKey(okulId), okulAylikKey(okulId, ay), okulOgretmenKey(okulId, ay)] : [BOS, BOS, BOS, BOS];
      const r = (
        (await command([
          "EVAL", HARCA, 8, aylikKey(id, ay), kazanilanKey(id), hareketKey(id), askiKey(id), ...okulAnahtarlari,
          hak, miktar, Math.max(1000, ttlMs), tarih, JSON.stringify(aciklama), askiId, ay, id, okulId ?? "",
        ])) as number[]
      ).map(Number);
      return r[0] === 1 ? { ok: true, aylik: r[1], okul: r[2], kazanilan: r[3] } : { ok: false, aylikKalan: r[1], okulKalan: r[2], kazanilan: r[3] };
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
      const okulAnahtarlari = h.okul > 0 && h.okulId ? [okulAylikKey(h.okulId, h.ay), okulOgretmenKey(h.okulId, h.ay)] : [BOS, BOS];
      const r = await command([
        "EVAL", IADE, 6, aylikKey(id, h.ay), kazanilanKey(id), hareketKey(id), askiKey(id), ...okulAnahtarlari,
        h.id, h.ham, h.aylik, h.kazanilan, tarih, JSON.stringify(aciklama), Math.max(1000, ttlMs), h.okulId ? h.okul : 0, id,
      ]);
      return Number(r) === 1;
    },
    async odul(id, miktar, tarih, aciklama) {
      await command(["EVAL", ODUL, 3, BOS, kazanilanKey(id), hareketKey(id), miktar, tarih, JSON.stringify(aciklama)]);
    },
    async okulHavuzu(okulId, ay) {
      const [degerler, ogretmenler] = await Promise.all([
        command(["MGET", okulHakKey(okulId), okulSinirKey(okulId), okulAylikKey(okulId, ay)]) as Promise<(string | null)[] | null>,
        command(["HGETALL", okulOgretmenKey(okulId, ay)]) as Promise<string[] | null>,
      ]);
      const [hak, sinir, kullanilan] = degerler ?? [];
      return { hak: Number(hak ?? 0), sinir: Number(sinir ?? 0), kullanilan: Number(kullanilan ?? 0), ogretmenler: sayiTablosu(ogretmenler) };
    },
    async okulHakYaz(okulId, hak) {
      await command(["EVAL", HAK_YAZ, 2, okulHakKey(okulId), HAVUZLAR_KEY, okulId, hak]);
    },
    async okulSinirYaz(okulId, sinir) {
      await command(sinir > 0 ? ["SET", okulSinirKey(okulId), sinir] : ["DEL", okulSinirKey(okulId)]);
    },
    async okulHavuzlari(ay) {
      const haklar = sayiTablosu((await command(["HGETALL", HAVUZLAR_KEY])) as string[] | null);
      const idler = Object.keys(haklar);
      if (idler.length === 0) return [];
      const kullanilan = ((await command(["MGET", ...idler.map((o) => okulAylikKey(o, ay))])) as (string | null)[] | null) ?? [];
      return idler.map((okulId, i) => ({ okulId, hak: haklar[okulId], kullanilan: Number(kullanilan[i] ?? 0) }));
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
