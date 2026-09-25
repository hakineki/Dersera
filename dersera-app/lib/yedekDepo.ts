import { redisFromEnv } from "@/lib/redis";
import { yedekAnahtari, yedekIcerigi, yedekSifrele } from "@/lib/yedek";

// Gece yedeğinin deposu: şifreli dosya Vercel Blob'a "yedek/" altında, rastgele son ekli adla yazılır; YEDEK_SAKLAMA_GUN
// günden eski yedekler silinir. Yedek yalnız anahtarla çözülür; adres bilinse de içerik okunamaz.

export const YEDEK_SAKLAMA_GUN = 14;
const GUN_MS = 24 * 60 * 60 * 1000;

export class YedekYapilandirmaHatasi extends Error {}

export interface YedekSonucu {
  anahtarSayisi: number;
  bayt: number;
  silinen: number;
}

const tarihEki = (now: number) => new Date(now).toISOString().slice(0, 16).replace(/[:T]/g, "-");

export async function yedekAl(now = Date.now()): Promise<YedekSonucu> {
  const anahtar = yedekAnahtari();
  if (!anahtar) throw new YedekYapilandirmaHatasi("YEDEK_ANAHTARI tanımlı değil ya da 32 bayt değil");
  if (!process.env.BLOB_READ_WRITE_TOKEN?.trim()) throw new YedekYapilandirmaHatasi("BLOB_READ_WRITE_TOKEN tanımlı değil");
  const command = redisFromEnv();
  if (!command) throw new YedekYapilandirmaHatasi("Redis tanımlı değil");

  const icerik = await yedekIcerigi(command, now);
  const dosya = yedekSifrele(icerik, anahtar);
  const { put, list, del } = await import("@vercel/blob");
  await put(`yedek/dersera-${tarihEki(now)}.bin`, dosya, { access: "public", addRandomSuffix: true, contentType: "application/octet-stream" });

  // Saklama süresi: yalnız "yedek/" altındaki eski dosyalar silinir.
  const eskiler: string[] = [];
  let imlec: string | undefined;
  do {
    const r = await list({ prefix: "yedek/", cursor: imlec, limit: 1000 });
    for (const b of r.blobs) if (now - new Date(b.uploadedAt).getTime() > YEDEK_SAKLAMA_GUN * GUN_MS) eskiler.push(b.url);
    imlec = r.hasMore ? r.cursor : undefined;
  } while (imlec);
  if (eskiler.length) await del(eskiler);
  return { anahtarSayisi: icerik.kayitlar.length, bayt: dosya.length, silinen: eskiler.length };
}
