import { redisFromEnv, type RedisCommand } from "@/lib/redis";
import { durumOf, ogretmenOrtalamasi, type Inceleme, type ToplulukDurumu, type ToplulukKaydi, type ToplulukOzeti } from "@/lib/topluluk";
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
  // Toplu okuma (kütüphane listesi ve inceleme kuyruğu): sırası korunur, olmayan kayıt null.
  getMany(ids: string[]): Promise<(ToplulukKaydi | null)[]>;
  // Yalnız özetler (tam kayıt okumadan ön süzme için): sırası korunur, olmayan null.
  ozetleriOku(ids: string[]): Promise<(ToplulukOzeti | null)[]>;
  // yayin_tarihi azalan; imleç: bir önceki sayfanın son skoru (hariç).
  sirali(imlec: number | null, adet: number): Promise<SiraliOge[]>;
  // Listede (yayında) olan oyun sayısı.
  yayindaSayisi(): Promise<number>;
  // Kaynağın (ör. hesap + kütüphane kaydı) güncel topluluk kaydını yazar; öncekini döner.
  kaynakGuncelle(kaynak: string, id: string): Promise<string | null>;
  kaynakOku(kaynak: string): Promise<string | null>;
  kaynaklariOku(kaynaklar: string[]): Promise<(string | null)[]>;
  // Atomik durum geçişi: kaydın o anki durumu izinli listesindeyse yeni duruma geçer ve true döner; değilse
  // (ör. eşzamanlı geri çekme) hiçbir şey yazılmaz. mevcut: durum anahtarı olmayan eski kayıtta kayıttan okunan durum.
  // "yayinda" kaydı listeye alır (yayinTarihi verilirse sıradaki yeri güncellenir); diğer durumlar listeden çıkarır.
  durumGecis(id: string, izinli: ToplulukDurumu[], yeni: ToplulukDurumu, mevcut: ToplulukDurumu, yayinTarihi?: number): Promise<boolean>;
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
  // Oyun kodunu yayınlayan öğretmen (öğretmen puanı uygunluğu için) ve öğretmen başına bitiren öğrenci sayısı.
  kodYayinlayanBagla(kod: string, sahip: string, ttlMs: number): Promise<void>;
  kodYayinlayani(kod: string): Promise<string | null>;
  ogretmenKullanimArtir(id: string, sahip: string): Promise<void>;
  ogretmenKullanimi(id: string, sahip: string): Promise<number>;
  // Öğretmen başına tek puan (güncellenebilir); toplam ve sayı aynı betikte güncellenir.
  ogretmenPuanla(id: string, sahip: string, puan: number): Promise<void>;
  ogretmenPuani(id: string, sahip: string): Promise<number | null>;
  ogretmenPuanOzeti(id: string): Promise<{ toplam: number; sayi: number }>;
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
const kodYayinlayanKey = (kod: string) => `dersera:topluluk:kod-yayinlayan:${kod}`;
const ogretmenKullanimKey = (id: string) => `dersera:topluluk:ogretmen-kullanim:${id}`;
const ogretmenPuanKey = (id: string) => `dersera:topluluk:ogretmen-puan:${id}`;
const ogretmenToplamKey = (id: string) => `dersera:topluluk:ogretmen-puan-toplam:${id}`;
const ogretmenSayiKey = (id: string) => `dersera:topluluk:ogretmen-puan-sayi:${id}`;
// KEYS: puan hash, toplam, sayı. ARGV: öğretmen, puan. Güncellemede fark eklenir, sayı artmaz.
const OGRETMEN_PUANLA = `local eski = redis.call('HGET', KEYS[1], ARGV[1])
redis.call('HSET', KEYS[1], ARGV[1], ARGV[2])
if eski then
  redis.call('INCRBY', KEYS[2], tonumber(ARGV[2]) - tonumber(eski))
else
  redis.call('INCRBY', KEYS[2], ARGV[2])
  redis.call('INCR', KEYS[3])
end
return 1`;
const PUAN_EKLE = `${kovaliPuanLua(1, 1)}
return 1`;

const icerikKey = (h: string) => `dersera:topluluk:icerik:${h}`;
const kaynakKey = (k: string) => `dersera:topluluk:kaynak:${k}`;
const kodKey = (kod: string) => `dersera:topluluk:kod:${kod}`;
const incelemeKey = (id: string) => `dersera:topluluk:inceleme:${id}`;
// Durum geçişlerinin tek doğruluk kaynağı (JSON kayıttaki durum bunun ardından yazılır).
const durumKey = (id: string) => `dersera:topluluk:durum:${id}`;
// KEYS: durum anahtarı. ARGV: yeni, mevcut (anahtar yoksa), izinli durumlar... Dönüş: 1 geçti, 0 geçmedi.
const GECIS = `local d = redis.call('GET', KEYS[1])
if not d then d = ARGV[2] end
for i = 3, #ARGV do
  if d == ARGV[i] then
    redis.call('SET', KEYS[1], ARGV[1])
    return 1
  end
end
return 0`;
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
  // Öğretmen puanı sayaçlardan okunur (sirali); yazılan özette boş.
  ogretmen_puan_ortalama: null,
  ogretmen_puan_sayisi: 0,
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
  const kodYayinlayan = new Map<string, string>();
  const ogretmenKullanim = new Map<string, number>();
  const ogretmenPuan = new Map<string, Map<string, number>>();
  const ogretmenOzet = (id: string) => {
    const p = [...(ogretmenPuan.get(id)?.values() ?? [])];
    return { toplam: p.reduce((a, b) => a + b, 0), sayi: p.length };
  };
  const durumlar = new Map<string, ToplulukDurumu>();
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
    async getMany(ids) {
      return ids.map((id) => kayitlar.get(id) ?? null);
    },
    async ozetleriOku(ids) {
      return ids.map((id) => {
        const k = kayitlar.get(id);
        return k ? ozetOf(k, oynanma.get(id) ?? 0) : null;
      });
    },
    async yayindaSayisi() {
      return [...kayitlar.values()].filter((k) => k.aktif).length;
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
          const o = ogretmenOzet(x.k.oyun_id);
          return {
            skor: x.skor,
            ozet: {
              ...ozet,
              puan_ortalama: gosterilecekOrtalama(p.gosterToplam, p.gosterSayi),
              puan_sayisi: p.gosterSayi,
              ogretmen_puan_ortalama: ogretmenOrtalamasi(o.toplam, o.sayi),
              ogretmen_puan_sayisi: o.sayi,
            },
          };
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
    async kaynaklariOku(ks) {
      return ks.map((k) => kaynaklar.get(k) ?? null);
    },
    async durumGecis(id, izinli, yeni, mevcut, yayinTarihi) {
      if (!izinli.includes(durumlar.get(id) ?? mevcut)) return false;
      durumlar.set(id, yeni);
      const k = kayitlar.get(id);
      if (k) kayitlar.set(id, durumlu(k, yeni, yayinTarihi));
      return true;
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
    async kodYayinlayanBagla(kod, sahip) {
      kodYayinlayan.set(kod, sahip);
    },
    async kodYayinlayani(kod) {
      return kodYayinlayan.get(kod) ?? null;
    },
    async ogretmenKullanimArtir(id, sahip) {
      ogretmenKullanim.set(`${id}|${sahip}`, (ogretmenKullanim.get(`${id}|${sahip}`) ?? 0) + 1);
    },
    async ogretmenKullanimi(id, sahip) {
      return ogretmenKullanim.get(`${id}|${sahip}`) ?? 0;
    },
    async ogretmenPuanla(id, sahip, puan) {
      (ogretmenPuan.get(id) ?? ogretmenPuan.set(id, new Map()).get(id)!).set(sahip, puan);
    },
    async ogretmenPuani(id, sahip) {
      return ogretmenPuan.get(id)?.get(sahip) ?? null;
    },
    async ogretmenPuanOzeti(id) {
      return ogretmenOzet(id);
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
      await command(["SET", durumKey(k.oyun_id), durumOf(k)]);
      if (k.aktif) await command(["ZADD", SIRA, siraSkoru(k.yayin_tarihi, k.oyun_id), k.oyun_id]);
      if ((await command(["SET", icerikKey(h), k.oyun_id, "NX"])) === "OK") return k.oyun_id;
      await command(["ZREM", SIRA, k.oyun_id]);
      await command(["DEL", kayitKey(k.oyun_id), ozetKey(k.oyun_id), olusturanKey(k.oyun_id), durumKey(k.oyun_id)]);
      return ((await command(["GET", icerikKey(h)])) as string | null) ?? k.oyun_id;
    },
    async icerikId(h) {
      return ((await command(["GET", icerikKey(h)])) as string | null) ?? null;
    },
    get: kayitOku,
    async getMany(ids) {
      if (ids.length === 0) return [];
      const ham = ((await command(["MGET", ...ids.map(kayitKey)])) as (string | null)[] | null) ?? [];
      return ids.map((_, i) => (ham[i] ? (JSON.parse(ham[i]!) as ToplulukKaydi) : null));
    },
    async ozetleriOku(ids) {
      if (ids.length === 0) return [];
      const ham = ((await command(["MGET", ...ids.map(ozetKey)])) as (string | null)[] | null) ?? [];
      return ids.map((_, i) => (ham[i] ? (JSON.parse(ham[i]!) as ToplulukOzeti) : null));
    },
    async yayindaSayisi() {
      return Number(await command(["ZCARD", SIRA]));
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
      const S = 5;
      const sayilar =
        ((await command(["MGET", ...idler.flatMap((id) => [oynanmaKey(id), puanToplamGosterKey(id), puanSayisiGosterKey(id), ogretmenToplamKey(id), ogretmenSayiKey(id)])])) as (string | null)[] | null) ?? [];
      return idler.map((_, i) => {
        const sayi = Number(sayilar[i * S + 2] ?? 0);
        const oSayi = Number(sayilar[i * S + 4] ?? 0);
        return {
          skor: skorlar[i],
          ozet: ozetler[i]
            ? {
                ...(JSON.parse(ozetler[i]!) as ToplulukOzeti),
                oynanma_sayisi: Number(sayilar[i * S] ?? 0),
                puan_ortalama: gosterilecekOrtalama(Number(sayilar[i * S + 1] ?? 0), sayi),
                puan_sayisi: sayi,
                ogretmen_puan_ortalama: ogretmenOrtalamasi(Number(sayilar[i * S + 3] ?? 0), oSayi),
                ogretmen_puan_sayisi: oSayi,
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
    async kaynaklariOku(ks) {
      if (ks.length === 0) return [];
      const ham = ((await command(["MGET", ...ks.map(kaynakKey)])) as (string | null)[] | null) ?? [];
      return ks.map((_, i) => ham[i] ?? null);
    },
    async durumGecis(id, izinli, yeni, mevcut, yayinTarihi) {
      if (Number(await command(["EVAL", GECIS, 1, durumKey(id), yeni, mevcut, ...izinli])) !== 1) return false;
      // Listeden çıkarma önce: yazım yarıda kalırsa kayıt listede kalmaz.
      if (yeni !== "yayinda") await command(["ZREM", SIRA, id]);
      const k = await durumuYaz(id, yeni, yayinTarihi);
      if (k && yeni === "yayinda") await command(["ZADD", SIRA, siraSkoru(k.yayin_tarihi, id), id]);
      return true;
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
    async kodYayinlayanBagla(kod, sahip, ttlMs) {
      await command(["SET", kodYayinlayanKey(kod), sahip, "PX", Math.max(1000, ttlMs)]);
    },
    async kodYayinlayani(kod) {
      return ((await command(["GET", kodYayinlayanKey(kod)])) as string | null) ?? null;
    },
    async ogretmenKullanimArtir(id, sahip) {
      await command(["HINCRBY", ogretmenKullanimKey(id), sahip, 1]);
    },
    async ogretmenKullanimi(id, sahip) {
      return Number((await command(["HGET", ogretmenKullanimKey(id), sahip])) ?? 0);
    },
    async ogretmenPuanla(id, sahip, puan) {
      await command(["EVAL", OGRETMEN_PUANLA, 3, ogretmenPuanKey(id), ogretmenToplamKey(id), ogretmenSayiKey(id), sahip, puan]);
    },
    async ogretmenPuani(id, sahip) {
      const v = (await command(["HGET", ogretmenPuanKey(id), sahip])) as string | null;
      return v === null || v === undefined ? null : Number(v);
    },
    async ogretmenPuanOzeti(id) {
      const [t, s] = ((await command(["MGET", ogretmenToplamKey(id), ogretmenSayiKey(id)])) as (string | null)[] | null) ?? [];
      return { toplam: Number(t ?? 0), sayi: Number(s ?? 0) };
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
