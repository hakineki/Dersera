import { redisFromEnv, type RedisCommand } from "@/lib/redis";
import type { ToplulukKaydi, ToplulukOzeti } from "@/lib/topluluk";

// Anahtarlar: özet (liste), tam kayıt (Oyunu Kullan), yayın zamanına göre sıralı küme, içerik özeti → id
// (aynı oyun tekrar yayınlanınca yeni kayıt açılmaz), oyun kodu → id ve oynanma sayacı.
export interface ToplulukStore {
  persistent: boolean;
  // İçerik özeti daha önce görüldüyse mevcut id döner, kayıt yazılmaz.
  ekle(kayit: ToplulukKaydi, icerikOzeti: string): Promise<string>;
  get(id: string): Promise<ToplulukKaydi | null>;
  // yayin_tarihi azalan; imleç: bir önceki sayfanın son skoru (hariç).
  sirali(imlec: number | null, adet: number): Promise<{ ozetler: ToplulukOzeti[]; skorlar: number[] }>;
  kodBagla(kod: string, id: string, ttlMs: number): Promise<void>;
  kodunOyunu(kod: string): Promise<string | null>;
  oynanmaArtir(id: string): Promise<void>;
}

const ozetKey = (id: string) => `dersera:topluluk:ozet:${id}`;
const kayitKey = (id: string) => `dersera:topluluk:oyun:${id}`;
const oynanmaKey = (id: string) => `dersera:topluluk:oynanma:${id}`;
const icerikKey = (h: string) => `dersera:topluluk:icerik:${h}`;
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
  const kodlar = new Map<string, string>();
  const oynanma = new Map<string, number>();
  return {
    persistent: false,
    async ekle(k, h) {
      const var_ = icerik.get(h);
      if (var_) return var_;
      icerik.set(h, k.oyun_id);
      kayitlar.set(k.oyun_id, k);
      return k.oyun_id;
    },
    async get(id) {
      return kayitlar.get(id) ?? null;
    },
    async sirali(imlec, adet) {
      const hepsi = [...kayitlar.values()]
        .map((k) => ({ k, skor: siraSkoru(k.yayin_tarihi, k.oyun_id) }))
        .filter((x) => imlec === null || x.skor < imlec)
        .sort((a, b) => b.skor - a.skor)
        .slice(0, adet);
      return { ozetler: hepsi.map((x) => ozetOf(x.k, oynanma.get(x.k.oyun_id) ?? 0)), skorlar: hepsi.map((x) => x.skor) };
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
      // İçerik anahtarı NX ile alınır: aynı oyun eşzamanlı iki kez yayınlansa da tek kayıt açılır.
      if ((await command(["SET", icerikKey(h), k.oyun_id, "NX"])) !== "OK") {
        return ((await command(["GET", icerikKey(h)])) as string | null) ?? k.oyun_id;
      }
      await command(["SET", kayitKey(k.oyun_id), JSON.stringify(k)]);
      await command(["SET", ozetKey(k.oyun_id), JSON.stringify(ozetOf(k, 0))]);
      await command(["ZADD", SIRA, siraSkoru(k.yayin_tarihi, k.oyun_id), k.oyun_id]);
      return k.oyun_id;
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
      if (idler.length === 0) return { ozetler: [], skorlar: [] };
      const ozetler = ((await command(["MGET", ...idler.map(ozetKey)])) as (string | null)[]) ?? [];
      const sayilar = ((await command(["MGET", ...idler.map(oynanmaKey)])) as (string | null)[]) ?? [];
      const out: ToplulukOzeti[] = [];
      const outSkor: number[] = [];
      ozetler.forEach((raw, i) => {
        if (!raw) return;
        out.push({ ...(JSON.parse(raw) as ToplulukOzeti), oynanma_sayisi: Number(sayilar[i] ?? 0) });
        outSkor.push(skorlar[i]);
      });
      return { ozetler: out, skorlar: outSkor };
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
