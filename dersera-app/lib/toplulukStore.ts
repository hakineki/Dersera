import { redisFromEnv, type RedisCommand } from "@/lib/redis";
import type { Inceleme, ToplulukDurumu, ToplulukKaydi, ToplulukOzeti } from "@/lib/topluluk";
import { BOS_PUAN_SAYACI, gosterilecekOrtalama, kovaliPuanEkle, kovaliPuanLua, PUAN_KOVASI, type PuanSayaci } from "@/lib/istatistik";

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
  // İçerik özeti daha önce görüldüyse mevcut id döner, kayıt yazılmaz. Aktif olmayan kayıt listeye girmez.
  ekle(kayit: ToplulukKaydi, icerikOzeti: string): Promise<string>;
  icerikId(icerikOzeti: string): Promise<string | null>;
  get(id: string): Promise<ToplulukKaydi | null>;
  // yayin_tarihi azalan; imleç: bir önceki sayfanın son skoru (hariç).
  sirali(imlec: number | null, adet: number): Promise<SiraliOge[]>;
  // Kaynağın (ör. hesap + kütüphane kaydı) güncel topluluk kaydını yazar; öncekini döner.
  kaynakGuncelle(kaynak: string, id: string): Promise<string | null>;
  kaynakOku(kaynak: string): Promise<string | null>;
  // "yayinda" kaydı listeye alır (yayinTarihi verilirse sıradaki yeri de güncellenir); diğer durumlar listeden çıkarır.
  durumYaz(id: string, durum: ToplulukDurumu, yayinTarihi?: number): Promise<void>;
  // İnceleme kuyruğu: gönderim sırasına göre (eskiden yeniye).
  kuyrugaEkle(id: string, skor: number): Promise<void>;
  kuyruktanCikar(id: string): Promise<void>;
  kuyruk(adet: number): Promise<string[]>;
  // Hesap başına tek inceleme; ikinci kez yazılamaz (false döner).
  incelemeEkle(id: string, inceleme: Inceleme): Promise<boolean>;
  incelemeler(id: string): Promise<Inceleme[]>;
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
const incelemeKey = (id: string) => `dersera:topluluk:inceleme:${id}`;
const SIRA = "dersera:topluluk:sira";
const KUYRUK = "dersera:topluluk:inceleme-kuyrugu";

// Durum değişince kayıt ve özetin ortak alanları (özete gizli alan yazılmaz).
function durumlu<T extends { aktif: boolean; yayin_tarihi: number; durum?: ToplulukDurumu }>(k: T, durum: ToplulukDurumu, yayinTarihi?: number, ozet = false): T {
  const ortak = { ...k, aktif: durum === "yayinda", yayin_tarihi: yayinTarihi ?? k.yayin_tarihi };
  return ozet ? ortak : { ...ortak, durum };
}

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
  const kuyrukSkor = new Map<string, number>();
  const incelemeler = new Map<string, Map<string, Inceleme>>();
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
    async kaynakOku(kaynak) {
      return kaynaklar.get(kaynak) ?? null;
    },
    async durumYaz(id, durum, yayinTarihi) {
      const k = kayitlar.get(id);
      if (k) kayitlar.set(id, durumlu(k, durum, yayinTarihi));
    },
    async kuyrugaEkle(id, skor) {
      kuyrukSkor.set(id, skor);
    },
    async kuyruktanCikar(id) {
      kuyrukSkor.delete(id);
    },
    async kuyruk(adet) {
      return [...kuyrukSkor.entries()].sort((a, b) => a[1] - b[1]).slice(0, adet).map(([id]) => id);
    },
    async incelemeEkle(id, inc) {
      const m = incelemeler.get(id) ?? incelemeler.set(id, new Map()).get(id)!;
      if (m.has(inc.inceleyen)) return false;
      m.set(inc.inceleyen, inc);
      return true;
    },
    async incelemeler(id) {
      return [...(incelemeler.get(id)?.values() ?? [])];
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
  const kayitOku = async (id: string): Promise<ToplulukKaydi | null> => {
    const raw = (await command(["GET", kayitKey(id)])) as string | null;
    return raw ? (JSON.parse(raw) as ToplulukKaydi) : null;
  };
  const durumuYaz = async (id: string, durum: ToplulukDurumu, yayinTarihi?: number): Promise<ToplulukKaydi | null> => {
    let kayit: ToplulukKaydi | null = null;
    for (const key of [kayitKey(id), ozetKey(id)]) {
      const raw = (await command(["GET", key])) as string | null;
      if (!raw) continue;
      const guncel = durumlu(JSON.parse(raw), durum, yayinTarihi, key === ozetKey(id));
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
      if (k.aktif) await command(["ZADD", SIRA, siraSkoru(k.yayin_tarihi, k.oyun_id), k.oyun_id]);
      if ((await command(["SET", icerikKey(h), k.oyun_id, "NX"])) === "OK") return k.oyun_id;
      await command(["ZREM", SIRA, k.oyun_id]);
      await command(["DEL", kayitKey(k.oyun_id), ozetKey(k.oyun_id), olusturanKey(k.oyun_id)]);
      return ((await command(["GET", icerikKey(h)])) as string | null) ?? k.oyun_id;
    },
    async icerikId(h) {
      return ((await command(["GET", icerikKey(h)])) as string | null) ?? null;
    },
    get: kayitOku,
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
    async kaynakOku(kaynak) {
      return ((await command(["GET", kaynakKey(kaynak)])) as string | null) ?? null;
    },
    async durumYaz(id, durum, yayinTarihi) {
      // Listeden çıkarma önce: yazım yarıda kalırsa kayıt listede kalmaz.
      if (durum !== "yayinda") await command(["ZREM", SIRA, id]);
      const k = await durumuYaz(id, durum, yayinTarihi);
      if (k && durum === "yayinda") await command(["ZADD", SIRA, siraSkoru(k.yayin_tarihi, id), id]);
    },
    async kuyrugaEkle(id, skor) {
      await command(["ZADD", KUYRUK, skor, id]);
    },
    async kuyruktanCikar(id) {
      await command(["ZREM", KUYRUK, id]);
    },
    async kuyruk(adet) {
      return ((await command(["ZRANGE", KUYRUK, 0, adet - 1])) as string[] | null) ?? [];
    },
    async incelemeEkle(id, inc) {
      return Number(await command(["HSETNX", incelemeKey(id), inc.inceleyen, JSON.stringify(inc)])) === 1;
    },
    async incelemeler(id) {
      const degerler = ((await command(["HVALS", incelemeKey(id)])) as string[] | null) ?? [];
      return degerler.map((d) => JSON.parse(d) as Inceleme);
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
      const k = await kayitOku(id);
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
