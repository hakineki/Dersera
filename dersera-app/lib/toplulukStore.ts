import { redisFromEnv, type RedisCommand } from "@/lib/redis";
import type { ToplulukKaydi, ToplulukOzeti } from "@/lib/topluluk";
import { BOS_PUAN_SAYACI, gosterilecekOrtalama, kovaliPuanEkle, PUAN_KOVASI, type PuanSayaci } from "@/lib/istatistik";
import { kovaliPuanLua } from "@/lib/istatistikStore";

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
  icerikId(icerikOzeti: string): Promise<string | null>;
  get(id: string): Promise<ToplulukKaydi | null>;
  // yayin_tarihi azalan; imleç: bir önceki sayfanın son skoru (hariç).
  sirali(imlec: number | null, adet: number): Promise<SiraliOge[]>;
  // Kaynağın (ör. hesap + kütüphane kaydı) güncel topluluk kaydını yazar; öncekini döner.
  kaynakGuncelle(kaynak: string, id: string): Promise<string | null>;
  pasiflestir(id: string): Promise<void>;
  etkinlestir(id: string): Promise<void>;
  kodBagla(kod: string, id: string, ttlMs: number): Promise<void>;
  kodunOyunu(kod: string): Promise<string | null>;
  oynanmaArtir(id: string): Promise<void>;
  // Öğrenci puanı: özette yalnız son kova anlık görüntüsü puan_ortalama/puan_sayisi olarak görünür.
  puanEkle(id: string, puan: number): Promise<void>;
  // Kaydı açan hesap (tam kaydı okumadan); sayımda sahibi ayırmak için.
  olusturani(id: string): Promise<string | null>;
}

const ozetKey = (id: string) => `dersera:topluluk:ozet:${id}`;
const kayitKey = (id: string) => `dersera:topluluk:oyun:${id}`;
const oynanmaKey = (id: string) => `dersera:topluluk:oynanma:${id}`;
const puanToplamKey = (id: string) => `dersera:topluluk:puan-toplam:${id}`;
const puanSayisiKey = (id: string) => `dersera:topluluk:puan-sayisi:${id}`;
const puanToplamGosterKey = (id: string) => `dersera:topluluk:puan-toplam-goster:${id}`;
const puanSayisiGosterKey = (id: string) => `dersera:topluluk:puan-sayisi-goster:${id}`;
const olusturanKey = (id: string) => `dersera:topluluk:olusturan:${id}`;
const PUAN_EKLE = `${kovaliPuanLua(1, 1)}
return 1`;

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
  const puanlar = new Map<string, PuanSayaci>();
  return {
    persistent: false,
    async ekle(k, h) {
      const mevcut = icerik.get(h);
      if (mevcut) return mevcut;
      icerik.set(h, k.oyun_id);
      kayitlar.set(k.oyun_id, k);
      return k.oyun_id;
    },
    async icerikId(h) {
      return icerik.get(h) ?? null;
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
        .map((x) => {
          const p = puanlar.get(x.k.oyun_id) ?? BOS_PUAN_SAYACI;
          const ozet = ozetOf(x.k, oynanma.get(x.k.oyun_id) ?? 0);
          return { skor: x.skor, ozet: { ...ozet, puan_ortalama: gosterilecekOrtalama(p.gosterToplam, p.gosterSayi), puan_sayisi: p.gosterSayi } };
        });
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
    async etkinlestir(id) {
      const k = kayitlar.get(id);
      if (k) kayitlar.set(id, { ...k, aktif: true });
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
    async puanEkle(id, puan) {
      puanlar.set(id, kovaliPuanEkle(puanlar.get(id) ?? BOS_PUAN_SAYACI, puan));
    },
    async olusturani(id) {
      return kayitlar.get(id)?.olusturan ?? null;
    },
  };
}

export function createRedisToplulukStore(command: RedisCommand): ToplulukStore {
  const aktifYaz = async (id: string, aktif: boolean): Promise<ToplulukKaydi | null> => {
    let kayit: ToplulukKaydi | null = null;
    for (const key of [kayitKey(id), ozetKey(id)]) {
      const raw = (await command(["GET", key])) as string | null;
      if (!raw) continue;
      const guncel = { ...JSON.parse(raw), aktif };
      if (key === kayitKey(id)) kayit = guncel;
      await command(["SET", key, JSON.stringify(guncel)]);
    }
    return kayit;
  };
  return {
    persistent: true,
    async ekle(k, h) {
      // Önce kayıt yazılır, içerik anahtarı en son NX ile alınır: ara adımda hata olursa içerik anahtarı
      // var olmayan bir kaydı göstermez. Yarışı kaybeden yeni kayıt geri alınır ve mevcut id döner.
      await command(["SET", kayitKey(k.oyun_id), JSON.stringify(k)]);
      await command(["SET", ozetKey(k.oyun_id), JSON.stringify(ozetOf(k, 0))]);
      await command(["SET", olusturanKey(k.oyun_id), k.olusturan]);
      await command(["ZADD", SIRA, siraSkoru(k.yayin_tarihi, k.oyun_id), k.oyun_id]);
      if ((await command(["SET", icerikKey(h), k.oyun_id, "NX"])) === "OK") return k.oyun_id;
      await command(["ZREM", SIRA, k.oyun_id]);
      await command(["DEL", kayitKey(k.oyun_id), ozetKey(k.oyun_id), olusturanKey(k.oyun_id)]);
      return ((await command(["GET", icerikKey(h)])) as string | null) ?? k.oyun_id;
    },
    async icerikId(h) {
      return ((await command(["GET", icerikKey(h)])) as string | null) ?? null;
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
      const sayilar = ((await command(["MGET", ...idler.flatMap((id) => [oynanmaKey(id), puanToplamGosterKey(id), puanSayisiGosterKey(id)])])) as (string | null)[] | null) ?? [];
      return idler.map((_, i) => {
        const sayi = Number(sayilar[i * 3 + 2] ?? 0);
        return {
          skor: skorlar[i],
          ozet: ozetler[i]
            ? {
                ...(JSON.parse(ozetler[i]!) as ToplulukOzeti),
                oynanma_sayisi: Number(sayilar[i * 3] ?? 0),
                puan_ortalama: gosterilecekOrtalama(Number(sayilar[i * 3 + 1] ?? 0), sayi),
                puan_sayisi: sayi,
              }
            : null,
        };
      });
    },
    async kaynakGuncelle(kaynak, id) {
      // SET ... GET: yeni değeri yazar, eskisini döndürür (tek komut).
      return ((await command(["SET", kaynakKey(kaynak), id, "GET"])) as string | null) ?? null;
    },
    async pasiflestir(id) {
      await command(["ZREM", SIRA, id]);
      await aktifYaz(id, false);
    },
    async etkinlestir(id) {
      const k = await aktifYaz(id, true);
      if (k) await command(["ZADD", SIRA, siraSkoru(k.yayin_tarihi, id), id]);
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
    async puanEkle(id, puan) {
      // Canlı sayaçlar ve kova anlık görüntüsü tek betikte (yarım yazılmış ortalama olmaz).
      await command(["EVAL", PUAN_EKLE, 4, puanToplamKey(id), puanSayisiKey(id), puanToplamGosterKey(id), puanSayisiGosterKey(id), puan, PUAN_KOVASI]);
    },
    async olusturani(id) {
      const o = (await command(["GET", olusturanKey(id)])) as string | null;
      if (o) return o;
      // Bu anahtardan önce açılmış kayıt: bir kez tam kayıttan okunup yazılır.
      const k = await this.get(id);
      if (k?.olusturan) await command(["SET", olusturanKey(id), k.olusturan]);
      return k?.olusturan ?? null;
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
