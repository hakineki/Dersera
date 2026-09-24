import { redisFromEnv, type RedisCommand } from "@/lib/redis";
import type { ToplulukKaydi, ToplulukOzeti } from "@/lib/topluluk";

// Anahtarlar: özet (liste), tam kayıt (Oyunu Kullan), yayın zamanına göre sıralı küme, içerik özeti → id
// (aynı oyun tekrar yayınlanınca yeni kayıt açılmaz), kaynak → son id (kütüphanede düzenlenip yeniden yayınlanan
// oyunun eski sürümü pasife alınır), oyun kodu → id ve oynanma sayacı.
export interface SiraliOge {
  skor: number;
  // Özet okunamadıysa null; imleç yine ilerler.
  ozet: ToplulukOzeti | null;
}

export interface ToplulukStore {
  persistent: boolean;
  // İçerik özeti daha önce görüldüyse mevcut id döner, kayıt yazılmaz.
  ekle(kayit: ToplulukKaydi, icerikOzeti: string): Promise<string>;
  get(id: string): Promise<ToplulukKaydi | null>;
  // yayin_tarihi azalan; imleç: bir önceki sayfanın son skoru (hariç).
  sirali(imlec: number | null, adet: number): Promise<SiraliOge[]>;
  // Kaynağın (ör. hesap + kütüphane kaydı) güncel topluluk kaydını yazar; öncekini döner.
  kaynakGuncelle(kaynak: string, id: string): Promise<string | null>;
  pasiflestir(id: string): Promise<void>;
  kodBagla(kod: string, id: string, ttlMs: number): Promise<void>;
  kodunOyunu(kod: string): Promise<string | null>;
  oynanmaArtir(id: string): Promise<void>;
}

const ozetKey = (id: string) => `dersera:topluluk:ozet:${id}`;
const kayitKey = (id: string) => `dersera:topluluk:oyun:${id}`;
const oynanmaKey = (id: string) => `dersera:topluluk:oynanma:${id}`;
const icerikKey = (h: string) => `dersera:topluluk:icerik:${h}`;
const kaynakKey = (k: string) => `dersera:topluluk:kaynak:${k}`;
const kodKey = (kod: string) => `dersera:topluluk:kod:${kod}`;
const SIRA = "dersera:topluluk:sira";

const ozetOf = (k: ToplulukKaydi, oynanma: number): ToplulukOzeti => ({
  oyun_id: k.oyun_id,
  baslik: k.baslik,
  ders: k.ders,
  konu: k.konu,
  sinif: k.sinif,
  sure_dk: k.sure_dk,
  alan: k.alan,
  deneyim: k.deneyim,
  yayin_tarihi: k.yayin_tarihi,
  oynanma_sayisi: oynanma,
  puan_ortalama: k.puan_ortalama,
  puan_sayisi: k.puan_sayisi,
  aktif: k.aktif,
});

// Aynı milisaniyede yayınlanan iki oyun sırada çakışmasın: skora kimlikten türetilen küçük bir kesir eklenir.
export function siraSkoru(yayinTarihi: number, id: string): number {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) % 1000;
  return yayinTarihi + h / 1000;
}

export function createMemoryToplulukStore(): ToplulukStore {
  const kayitlar = new Map<string, ToplulukKaydi>();
  const icerik = new Map<string, string>();
  const kaynaklar = new Map<string, string>();
  const kodlar = new Map<string, string>();
  const oynanma = new Map<string, number>();
  return {
    persistent: false,
    async ekle(k, h) {
      const mevcut = icerik.get(h);
      if (mevcut) return mevcut;
      icerik.set(h, k.oyun_id);
      kayitlar.set(k.oyun_id, k);
      return k.oyun_id;
    },
    async get(id) {
      return kayitlar.get(id) ?? null;
    },
    async sirali(imlec, adet) {
      return [...kayitlar.values()]
        .filter((k) => k.aktif)
        .map((k) => ({ k, skor: siraSkoru(k.yayin_tarihi, k.oyun_id) }))
        .filter((x) => imlec === null || x.skor < imlec)
        .sort((a, b) => b.skor - a.skor)
        .slice(0, adet)
        .map((x) => ({ skor: x.skor, ozet: ozetOf(x.k, oynanma.get(x.k.oyun_id) ?? 0) }));
    },
    async kaynakGuncelle(kaynak, id) {
      const onceki = kaynaklar.get(kaynak) ?? null;
      kaynaklar.set(kaynak, id);
      return onceki;
    },
    async pasiflestir(id) {
      const k = kayitlar.get(id);
      if (k) kayitlar.set(id, { ...k, aktif: false });
    },
    async kodBagla(kod, id) {
      kodlar.set(kod, id);
    },
    async kodunOyunu(kod) {
      return kodlar.get(kod) ?? null;
    },
    async oynanmaArtir(id) {
      oynanma.set(id, (oynanma.get(id) ?? 0) + 1);
    },
  };
}

export function createRedisToplulukStore(command: RedisCommand): ToplulukStore {
  return {
    persistent: true,
    async ekle(k, h) {
      // Önce kayıt yazılır, içerik anahtarı en son NX ile alınır: ara adımda hata olursa içerik anahtarı
      // var olmayan bir kaydı göstermez. Yarışı kaybeden yeni kayıt geri alınır ve mevcut id döner.
      await command(["SET", kayitKey(k.oyun_id), JSON.stringify(k)]);
      await command(["SET", ozetKey(k.oyun_id), JSON.stringify(ozetOf(k, 0))]);
      await command(["ZADD", SIRA, siraSkoru(k.yayin_tarihi, k.oyun_id), k.oyun_id]);
      if ((await command(["SET", icerikKey(h), k.oyun_id, "NX"])) === "OK") return k.oyun_id;
      await command(["ZREM", SIRA, k.oyun_id]);
      await command(["DEL", kayitKey(k.oyun_id), ozetKey(k.oyun_id)]);
      return ((await command(["GET", icerikKey(h)])) as string | null) ?? k.oyun_id;
    },
    async get(id) {
      const raw = (await command(["GET", kayitKey(id)])) as string | null;
      return raw ? (JSON.parse(raw) as ToplulukKaydi) : null;
    },
    async sirali(imlec, adet) {
      const ust = imlec === null ? "+inf" : `(${imlec}`;
      const yanit = ((await command(["ZREVRANGEBYSCORE", SIRA, ust, "-inf", "WITHSCORES", "LIMIT", 0, adet])) as string[] | null) ?? [];
      const idler: string[] = [];
      const skorlar: number[] = [];
      for (let i = 0; i < yanit.length; i += 2) {
        idler.push(yanit[i]);
        skorlar.push(Number(yanit[i + 1]));
      }
      if (idler.length === 0) return [];
      const ozetler = ((await command(["MGET", ...idler.map(ozetKey)])) as (string | null)[] | null) ?? [];
      const sayilar = ((await command(["MGET", ...idler.map(oynanmaKey)])) as (string | null)[] | null) ?? [];
      return idler.map((_, i) => ({
        skor: skorlar[i],
        ozet: ozetler[i] ? { ...(JSON.parse(ozetler[i]!) as ToplulukOzeti), oynanma_sayisi: Number(sayilar[i] ?? 0) } : null,
      }));
    },
    async kaynakGuncelle(kaynak, id) {
      // SET ... GET: yeni değeri yazar, eskisini döndürür (tek komut).
      return ((await command(["SET", kaynakKey(kaynak), id, "GET"])) as string | null) ?? null;
    },
    async pasiflestir(id) {
      await command(["ZREM", SIRA, id]);
      for (const key of [kayitKey(id), ozetKey(id)]) {
        const raw = (await command(["GET", key])) as string | null;
        if (raw) await command(["SET", key, JSON.stringify({ ...JSON.parse(raw), aktif: false })]);
      }
    },
    async kodBagla(kod, id, ttlMs) {
      await command(["SET", kodKey(kod), id, "PX", Math.max(1000, ttlMs)]);
    },
    async kodunOyunu(kod) {
      return ((await command(["GET", kodKey(kod)])) as string | null) ?? null;
    },
    async oynanmaArtir(id) {
      await command(["INCR", oynanmaKey(id)]);
    },
  };
}

let store: ToplulukStore | null = null;

export function getToplulukStore(): ToplulukStore {
  if (!store) {
    const command = redisFromEnv();
    store = command ? createRedisToplulukStore(command) : createMemoryToplulukStore();
  }
  return store;
}
