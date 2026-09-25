import { createCipheriv, createDecipheriv, randomBytes } from "crypto";
import { gunzipSync, gzipSync } from "zlib";
import type { RedisCommand } from "@/lib/redis";

// Gece yedeği: tüm "dersera:" anahtarları türüne göre okunur (TTL'leriyle), sıkıştırılır ve şifrelenir. Dosya yalnız
// YEDEK_ANAHTARI ile çözülür (scripts/yedek-geri-yukle.mjs aynı biçimi okur). Redis komut bütçesi için anahtarlar
// SCAN ile toplanır, değerler tek betikte toplu okunur (her okuma ayrı HTTP çağrısıdır).

export const YEDEK_BICIMI = "DRSY1";
const IV_BOYU = 12;
const ETIKET_BOYU = 16;
// Tek betik yanıtı sınırlı kalsın (kütüphane tablosu öğretmen başına ~1 MB olabilir).
export const OKUMA_PARCASI = 10;

export type AnahtarTuru = "string" | "hash" | "list" | "set" | "zset";

export interface YedekKaydi {
  k: string;
  t: AnahtarTuru;
  // Kalan ömür (ms); -1: süresiz.
  pttl: number;
  v: string | string[];
}

export interface YedekIcerigi {
  bicim: typeof YEDEK_BICIMI;
  tarih: number;
  kayitlar: YedekKaydi[];
}

// 32 baytlık anahtar (base64). Yoksa ya da geçersizse null: yedek alınmaz (şifresiz yedek yazılmaz).
export function yedekAnahtari(): Buffer | null {
  const ham = process.env.YEDEK_ANAHTARI?.trim();
  if (!ham) return null;
  const a = Buffer.from(ham, "base64");
  return a.length === 32 ? a : null;
}

// KEYS: okunacak anahtarlar. Her anahtar için {tür, pttl, değer}; arada silinen anahtarın türü "none" döner.
const OKU = `local r = {}
for i, k in ipairs(KEYS) do
  local t = redis.call('TYPE', k)['ok']
  local v = ''
  if t == 'string' then v = redis.call('GET', k)
  elseif t == 'hash' then v = redis.call('HGETALL', k)
  elseif t == 'list' then v = redis.call('LRANGE', k, 0, -1)
  elseif t == 'set' then v = redis.call('SMEMBERS', k)
  elseif t == 'zset' then v = redis.call('ZRANGE', k, 0, -1, 'WITHSCORES') end
  r[i] = {t, redis.call('PTTL', k), v}
end
return r`;

const TURLER = new Set<string>(["string", "hash", "list", "set", "zset"]);

export async function anahtarlariTopla(command: RedisCommand): Promise<string[]> {
  const bulunan = new Set<string>();
  let imlec = "0";
  do {
    const [sonraki, anahtarlar] = (await command(["SCAN", imlec, "MATCH", "dersera:*", "COUNT", 1000])) as [string | number, string[]];
    imlec = String(sonraki);
    for (const k of anahtarlar ?? []) bulunan.add(k);
  } while (imlec !== "0");
  return [...bulunan].sort();
}

export async function yedekIcerigi(command: RedisCommand, now = Date.now()): Promise<YedekIcerigi> {
  const anahtarlar = await anahtarlariTopla(command);
  const kayitlar: YedekKaydi[] = [];
  for (let i = 0; i < anahtarlar.length; i += OKUMA_PARCASI) {
    const parca = anahtarlar.slice(i, i + OKUMA_PARCASI);
    const r = ((await command(["EVAL", OKU, parca.length, ...parca])) as [string, number, string | string[]][] | null) ?? [];
    parca.forEach((k, j) => {
      const [t, pttl, v] = r[j] ?? [];
      // Okuma sırasında silinen anahtar (tür "none" ya da değer yok) atlanır.
      if (TURLER.has(t) && v !== undefined && v !== null) kayitlar.push({ k, t: t as AnahtarTuru, pttl: Number(pttl), v });
    });
  }
  return { bicim: YEDEK_BICIMI, tarih: now, kayitlar };
}

// Biçim: "DRSY1" + iv(12) + etiket(16) + AES-256-GCM(gzip(JSON)).
export function yedekSifrele(icerik: YedekIcerigi, anahtar: Buffer): Buffer {
  const iv = randomBytes(IV_BOYU);
  const c = createCipheriv("aes-256-gcm", anahtar, iv);
  const govde = Buffer.concat([c.update(gzipSync(JSON.stringify(icerik))), c.final()]);
  return Buffer.concat([Buffer.from(YEDEK_BICIMI), iv, c.getAuthTag(), govde]);
}

// Yanlış anahtar ya da bozulmuş dosya hata fırlatır (GCM etiketi).
export function yedekCoz(dosya: Buffer, anahtar: Buffer): YedekIcerigi {
  const bas = YEDEK_BICIMI.length;
  if (dosya.subarray(0, bas).toString() !== YEDEK_BICIMI) throw new Error("Yedek biçimi tanınmadı");
  const iv = dosya.subarray(bas, bas + IV_BOYU);
  const etiket = dosya.subarray(bas + IV_BOYU, bas + IV_BOYU + ETIKET_BOYU);
  const d = createDecipheriv("aes-256-gcm", anahtar, iv);
  d.setAuthTag(etiket);
  const acik = Buffer.concat([d.update(dosya.subarray(bas + IV_BOYU + ETIKET_BOYU)), d.final()]);
  return JSON.parse(gunzipSync(acik).toString()) as YedekIcerigi;
}
