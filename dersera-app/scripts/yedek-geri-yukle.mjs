#!/usr/bin/env node
// Gece yedeğini geri yükler (lib/yedek.ts biçimi: "DRSY1" + iv + etiket + AES-256-GCM(gzip(JSON))).
// Yalnız platform yöneticisi, kendi bilgisayarında elle çalıştırır. Varsayılan KURU ÇALIŞMA: yalnız özet yazar.
//
//   YEDEK_ANAHTARI=... node scripts/yedek-geri-yukle.mjs <dosya-ya-da-https-adresi>            # özet
//   YEDEK_ANAHTARI=... KV_REST_API_URL=... KV_REST_API_TOKEN=... \
//     node scripts/yedek-geri-yukle.mjs <dosya> --uygula [--uzerine-yaz]                     # geri yükle
//
// --uygula hedef veritabanı boş değilse durur; dolu veritabanına yazmak için ayrıca --uzerine-yaz gerekir
// (yedekteki anahtarlar silinip yeniden yazılır, yedekte olmayan anahtarlara dokunulmaz).
import { createDecipheriv } from "node:crypto";
import { readFile } from "node:fs/promises";
import { gunzipSync } from "node:zlib";

const BICIM = "DRSY1";
const IV = 12;
const ETIKET = 16;
const PARCA = 100;

function coz(dosya, anahtar) {
  const b = BICIM.length;
  if (dosya.subarray(0, b).toString() !== BICIM) throw new Error("Yedek biçimi tanınmadı");
  const d = createDecipheriv("aes-256-gcm", anahtar, dosya.subarray(b, b + IV));
  d.setAuthTag(dosya.subarray(b + IV, b + IV + ETIKET));
  return JSON.parse(gunzipSync(Buffer.concat([d.update(dosya.subarray(b + IV + ETIKET)), d.final()])).toString());
}

function redis() {
  const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) throw new Error("KV_REST_API_URL ve KV_REST_API_TOKEN gerekli");
  return async (komut) => {
    const res = await fetch(url, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify(komut) });
    const json = await res.json();
    if (!res.ok || json.error) throw new Error(`Redis: ${json.error ?? res.status}`);
    return json.result;
  };
}

// Değeri türüne göre yazan komutlar (büyük tablolar parçalı).
function yazmaKomutlari(k) {
  const parcala = (dizi, adim) => Array.from({ length: Math.ceil(dizi.length / adim) }, (_, i) => dizi.slice(i * adim, (i + 1) * adim));
  switch (k.t) {
    case "string":
      return [["SET", k.k, k.v]];
    case "hash":
      return parcala(k.v, PARCA * 2).map((p) => ["HSET", k.k, ...p]);
    case "list":
      return parcala(k.v, PARCA).map((p) => ["RPUSH", k.k, ...p]);
    case "set":
      return parcala(k.v, PARCA).map((p) => ["SADD", k.k, ...p]);
    case "zset": {
      // ZRANGE WITHSCORES: üye, puan, üye, puan…  → ZADD puan üye …
      const ciftler = [];
      for (let i = 0; i + 1 < k.v.length; i += 2) ciftler.push(k.v[i + 1], k.v[i]);
      return parcala(ciftler, PARCA * 2).map((p) => ["ZADD", k.k, ...p]);
    }
    default:
      return [];
  }
}

async function main() {
  const [kaynak, ...bayraklar] = process.argv.slice(2);
  if (!kaynak) throw new Error("Kullanım: node scripts/yedek-geri-yukle.mjs <dosya-ya-da-https-adresi> [--uygula] [--uzerine-yaz]");
  const anahtar = Buffer.from(process.env.YEDEK_ANAHTARI ?? "", "base64");
  if (anahtar.length !== 32) throw new Error("YEDEK_ANAHTARI (32 bayt, base64) gerekli");
  const ham = kaynak.startsWith("https://") ? Buffer.from(await (await fetch(kaynak)).arrayBuffer()) : await readFile(kaynak);
  const icerik = coz(ham, anahtar);
  const turler = {};
  for (const k of icerik.kayitlar) turler[k.t] = (turler[k.t] ?? 0) + 1;
  const ozet = { tarih: new Date(icerik.tarih).toISOString(), anahtarSayisi: icerik.kayitlar.length, turler };
  console.log(JSON.stringify(ozet));
  if (!bayraklar.includes("--uygula")) {
    console.error("Kuru çalışma: hiçbir şey yazılmadı. Geri yüklemek için --uygula ekleyin.");
    return;
  }
  const komut = redis();
  const boyut = Number(await komut(["DBSIZE"]));
  if (boyut > 0 && !bayraklar.includes("--uzerine-yaz")) throw new Error(`Hedef veritabanı boş değil (DBSIZE=${boyut}). Emin misiniz? --uzerine-yaz ekleyin.`);
  let yazilan = 0;
  for (const k of icerik.kayitlar) {
    await komut(["DEL", k.k]);
    for (const c of yazmaKomutlari(k)) await komut(c);
    if (k.pttl > 0) await komut(["PEXPIRE", k.k, k.pttl]);
    yazilan++;
  }
  console.error(`Geri yüklendi: ${yazilan} anahtar.`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
