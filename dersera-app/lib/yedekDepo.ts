import { redisFromEnv, type RedisCommand } from "@/lib/redis";
import { yedekAnahtari, yedekIcerigi, yedekSifrele } from "@/lib/yedek";

// Gece yedeğinin deposu: şifreli dosya Vercel Blob'a "yedek/" altında, rastgele son ekli adla yazılır; YEDEK_SAKLAMA_GUN
// günden eski yedekler silinir. Yedek yalnız anahtarla çözülür; adres bilinse de içerik okunamaz. Her çalışmanın
// sonucu (başarı, atlanan anahtar, hata) kaydedilir ve yönetici sayfasında gösterilir: yedek sessizce bozulmasın.

export const YEDEK_SAKLAMA_GUN = 14;
const GUN_MS = 24 * 60 * 60 * 1000;
const DURUM_KEY = "dersera:yedek:durum";

export class YedekYapilandirmaHatasi extends Error {}

export interface YedekSonucu {
  anahtarSayisi: number;
  atlanan: number;
  bayt: number;
  silinen: number;
}

export interface YedekDurumu {
  tarih: number;
  basarili: boolean;
  anahtarSayisi: number;
  atlanan: number;
  hata?: string;
}

const tarihEki = (now: number) => new Date(now).toISOString().slice(0, 16).replace(/[:T]/g, "-");

export async function yedekDurumu(command: RedisCommand): Promise<YedekDurumu | null> {
  const ham = (await command(["GET", DURUM_KEY])) as string | null;
  return ham ? (JSON.parse(ham) as YedekDurumu) : null;
}

async function durumYaz(command: RedisCommand, d: YedekDurumu) {
  await command(["SET", DURUM_KEY, JSON.stringify(d)]).catch((err: unknown) => console.error("[yedek] durum yazılamadı", err instanceof Error ? err.message : err));
}

export async function yedekAl(now = Date.now()): Promise<YedekSonucu> {
  const command = redisFromEnv();
  if (!command) throw new YedekYapilandirmaHatasi("Redis tanımlı değil");
  try {
    const anahtar = yedekAnahtari();
    if (!anahtar) throw new YedekYapilandirmaHatasi("YEDEK_ANAHTARI tanımlı değil ya da 32 bayt değil");
    if (!process.env.BLOB_READ_WRITE_TOKEN?.trim()) throw new YedekYapilandirmaHatasi("BLOB_READ_WRITE_TOKEN tanımlı değil");

    const { atlanan, ...icerik } = await yedekIcerigi(command, now);
    if (atlanan.length) console.error(`[yedek] ${atlanan.length} anahtar okunamadı, atlandı: ${atlanan.slice(0, 20).join(", ")}`);
    const dosya = yedekSifrele(icerik, anahtar);
    const { put, list, del } = await import("@vercel/blob");
    await put(`yedek/dersera-${tarihEki(now)}.bin`, dosya, { access: "public", addRandomSuffix: true, contentType: "application/octet-stream" });

    // Saklama süresi: yalnız "yedek/" altındaki eski dosyalar silinir (yeni yedek yazıldıktan sonra).
    const eskiler: string[] = [];
    let imlec: string | undefined;
    do {
      const r = await list({ prefix: "yedek/", cursor: imlec, limit: 1000 });
      for (const b of r.blobs) if (now - new Date(b.uploadedAt).getTime() > YEDEK_SAKLAMA_GUN * GUN_MS) eskiler.push(b.url);
      imlec = r.hasMore ? r.cursor : undefined;
    } while (imlec);
    if (eskiler.length) await del(eskiler);
    await durumYaz(command, { tarih: now, basarili: atlanan.length === 0, anahtarSayisi: icerik.kayitlar.length, atlanan: atlanan.length });
    return { anahtarSayisi: icerik.kayitlar.length, atlanan: atlanan.length, bayt: dosya.length, silinen: eskiler.length };
  } catch (err) {
    await durumYaz(command, { tarih: now, basarili: false, anahtarSayisi: 0, atlanan: 0, hata: err instanceof Error ? err.message.slice(0, 200) : "bilinmeyen hata" });
    throw err;
  }
}
