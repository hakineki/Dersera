import { redisFromEnv, type RedisCommand } from "@/lib/redis";
import { BOS_PUAN_SAYACI, kovaliPuanEkle, PUAN_KOVASI, type PuanSayaci } from "@/lib/istatistik";

// Kütüphane oyunlarının saha istatistikleri. Oyun kodu yayın anında kütüphane kaydına ("sahip:kutuphaneId") bağlanır.
// Öğrenci sayısı = oyunu BİTİRİP sonucu kaydedilen oyuncular (katılım sayılmaz). Puan yalnız bitiren oyuncudan alınır.
// Anonimlik: oyuncu, koda göre tuzlanmış takma ad özetiyle ("oyuncu") tutulur; puan değerinin kendisi saklanmaz,
// yalnız toplam ve sayı birikir ve dışarıya yalnız PUAN_KOVASI oyda bir alınan anlık görüntü verilir.
// Tutarlılık: kayıt ve sayaç artışları tek bir Redis betiğinde yapılır (yarım yazılmış oy/sayaç kalmaz).

// Dışarı verilen değerler: öğrenci sayısı ve puanın son kova anlık görüntüsü.
export interface Istatistik {
  ogrenci: number;
  puanToplam: number;
  puanSayisi: number;
}

export type BitirenSonucu = "yeni-sayildi" | "yeni-sayilmadi" | "zaten";
// Oyuncunun bu koddaki bitiriş durumu; yalnız sayılan bitirişin puanı toplamlara eklenir.
export type BitirisDurumu = "yok" | "sayildi" | "sayilmadi";

export interface IstatistikStore {
  kodBagla(kod: string, kutuphaneKaynagi: string, ttlMs: number): Promise<void>;
  kodunKaynagi(kod: string): Promise<string | null>;
  // Oyuncu bu kodda ilk kez bitirdiyse kaydeder. sayilsin ve kod sınırı aşılmadıysa "yeni-sayildi" döner ve
  // (kaynak varsa) kaynağın öğrenci sayısını artırır.
  bitirenKaydet(kod: string, oyuncu: string, kaynak: string | null, sayilsin: boolean, kodBasinaEnCok: number, ttlMs: number): Promise<BitirenSonucu>;
  bitirisDurumu(kod: string, oyuncu: string): Promise<BitirisDurumu>;
  // Oyuncu ilk kez oy veriyorsa kaydeder; sayilsin ise kaynağın puan sayaçları artar. İlk oy ise true.
  puanKaydet(kod: string, oyuncu: string, kaynak: string | null, puan: number, sayilsin: boolean, ttlMs: number): Promise<boolean>;
  istatistikler(kaynaklar: string[]): Promise<Istatistik[]>;
  sil(kaynak: string): Promise<void>;
}

type Alan = "ogrenci" | "puanToplam" | "puanSayisi" | "puanToplamGoster" | "puanSayisiGoster";
const kodKey = (kod: string) => `dersera:istatistik:kod:${kod}`;
const sayacKey = (kaynak: string, alan: Alan) => `dersera:istatistik:kutuphane:${kaynak}:${alan}`;
const bitirenKey = (kod: string) => `dersera:istatistik:bitiren:${kod}`;
const oyKey = (kod: string) => `dersera:istatistik:oy:${kod}`;
const PUAN_ALANLARI: Alan[] = ["puanToplam", "puanSayisi", "puanToplamGoster", "puanSayisiGoster"];
const TUM_ALANLAR: Alan[] = ["ogrenci", ...PUAN_ALANLARI];
// Liste okuması: öğrenci sayısı ve anlık görüntü (canlı puan sayaçları dışarı çıkmaz).
const OKUNAN_ALANLAR: Alan[] = ["ogrenci", "puanToplamGoster", "puanSayisiGoster"];
// Kaynağı olmayan kodda sayaç yazılmaz; betiğe yine geçerli bir anahtar verilir.
const YOK = "-";

// Kovalı puan artışı (Lua parçası). KEYS[k..k+3]: canlı toplam, canlı sayı, gösterim toplamı, gösterim sayısı.
// ARGV[p]: puan, ARGV[p+1]: kova. Sayı kovanın katına geldiğinde anlık görüntü yazılır.
export function kovaliPuanLua(k: number, p: number) {
  return `local t = redis.call('INCRBY', KEYS[${k}], ARGV[${p}])
local n = redis.call('INCR', KEYS[${k + 1}])
if n % tonumber(ARGV[${p + 1}]) == 0 then redis.call('MSET', KEYS[${k + 2}], t, KEYS[${k + 3}], n) end`;
}

export function createMemoryIstatistikStore(): IstatistikStore {
  const kodlar = new Map<string, string>();
  const ogrenci = new Map<string, number>();
  const puanlar = new Map<string, PuanSayaci>();
  const bitirenler = new Map<string, Map<string, boolean>>();
  const oylar = new Map<string, Set<string>>();
  return {
    async kodBagla(kod, kaynak) {
      kodlar.set(kod, kaynak);
    },
    async kodunKaynagi(kod) {
      return kodlar.get(kod) ?? null;
    },
    async bitirenKaydet(kod, oyuncu, kaynak, sayilsin, kodBasinaEnCok) {
      const m = bitirenler.get(kod) ?? bitirenler.set(kod, new Map()).get(kod)!;
      if (m.has(oyuncu)) return "zaten";
      const sayildi = sayilsin && m.size < kodBasinaEnCok;
      m.set(oyuncu, sayildi);
      if (!sayildi) return "yeni-sayilmadi";
      if (kaynak) ogrenci.set(kaynak, (ogrenci.get(kaynak) ?? 0) + 1);
      return "yeni-sayildi";
    },
    async bitirisDurumu(kod, oyuncu) {
      const d = bitirenler.get(kod)?.get(oyuncu);
      return d === undefined ? "yok" : d ? "sayildi" : "sayilmadi";
    },
    async puanKaydet(kod, oyuncu, kaynak, puan, sayilsin) {
      const s = oylar.get(kod) ?? oylar.set(kod, new Set()).get(kod)!;
      if (s.has(oyuncu)) return false;
      s.add(oyuncu);
      if (kaynak && sayilsin) puanlar.set(kaynak, kovaliPuanEkle(puanlar.get(kaynak) ?? BOS_PUAN_SAYACI, puan));
      return true;
    },
    async istatistikler(kaynaklar) {
      return kaynaklar.map((k) => {
        const p = puanlar.get(k) ?? BOS_PUAN_SAYACI;
        return { ogrenci: ogrenci.get(k) ?? 0, puanToplam: p.gosterToplam, puanSayisi: p.gosterSayi };
      });
    },
    async sil(kaynak) {
      ogrenci.delete(kaynak);
      puanlar.delete(kaynak);
    },
  };
}

// KEYS: bitiren hash, öğrenci sayacı. ARGV: oyuncu, ttl, kod başına sınır, sayılsın (1/0), kaynak var (1/0).
// Hash değeri: '1' sayıldı, '0' sayılmadı. Dönüş: 0 zaten bitirmiş, 1 yeni ve sayıldı, 2 yeni ama sayılmadı.
const BITIREN = `if redis.call('HEXISTS', KEYS[1], ARGV[1]) == 1 then return 0 end
local sayildi = ARGV[4] == '1' and redis.call('HLEN', KEYS[1]) < tonumber(ARGV[3])
redis.call('HSET', KEYS[1], ARGV[1], sayildi and '1' or '0')
redis.call('PEXPIRE', KEYS[1], ARGV[2])
if not sayildi then return 2 end
if ARGV[5] == '1' then redis.call('INCR', KEYS[2]) end
return 1`;

// KEYS: oy hash, ardından kaynağın dört puan sayacı. ARGV: oyuncu, ttl, sayılsın (1/0), puan, kova. Dönüş: 1 ilk oy, 0 tekrar.
const PUAN = `if redis.call('HSETNX', KEYS[1], ARGV[1], '1') == 0 then return 0 end
redis.call('PEXPIRE', KEYS[1], ARGV[2])
if ARGV[3] == '1' then
${kovaliPuanLua(2, 4)}
end
return 1`;

export function createRedisIstatistikStore(command: RedisCommand): IstatistikStore {
  return {
    async kodBagla(kod, kaynak, ttlMs) {
      await command(["SET", kodKey(kod), kaynak, "PX", Math.max(1000, ttlMs)]);
    },
    async kodunKaynagi(kod) {
      return ((await command(["GET", kodKey(kod)])) as string | null) ?? null;
    },
    async bitirenKaydet(kod, oyuncu, kaynak, sayilsin, kodBasinaEnCok, ttlMs) {
      const r = Number(
        await command(["EVAL", BITIREN, 2, bitirenKey(kod), sayacKey(kaynak ?? YOK, "ogrenci"), oyuncu, Math.max(1000, ttlMs), kodBasinaEnCok, sayilsin ? "1" : "0", kaynak ? "1" : "0"])
      );
      return r === 0 ? "zaten" : r === 1 ? "yeni-sayildi" : "yeni-sayilmadi";
    },
    async bitirisDurumu(kod, oyuncu) {
      const d = (await command(["HGET", bitirenKey(kod), oyuncu])) as string | null;
      return d === null || d === undefined ? "yok" : d === "1" ? "sayildi" : "sayilmadi";
    },
    async puanKaydet(kod, oyuncu, kaynak, puan, sayilsin, ttlMs) {
      const k = kaynak ?? YOK;
      const r = await command([
        "EVAL",
        PUAN,
        1 + PUAN_ALANLARI.length,
        oyKey(kod),
        ...PUAN_ALANLARI.map((a) => sayacKey(k, a)),
        oyuncu,
        Math.max(1000, ttlMs),
        kaynak && sayilsin ? "1" : "0",
        puan,
        PUAN_KOVASI,
      ]);
      return Number(r) === 1;
    },
    async istatistikler(kaynaklar) {
      if (kaynaklar.length === 0) return [];
      const n = OKUNAN_ALANLAR.length;
      const degerler = ((await command(["MGET", ...kaynaklar.flatMap((k) => OKUNAN_ALANLAR.map((a) => sayacKey(k, a)))])) as (string | null)[] | null) ?? [];
      return kaynaklar.map((_, i) => ({
        ogrenci: Number(degerler[i * n] ?? 0),
        puanToplam: Number(degerler[i * n + 1] ?? 0),
        puanSayisi: Number(degerler[i * n + 2] ?? 0),
      }));
    },
    async sil(kaynak) {
      await command(["DEL", ...TUM_ALANLAR.map((a) => sayacKey(kaynak, a))]);
    },
  };
}

let store: IstatistikStore | null = null;

export function getIstatistikStore(): IstatistikStore {
  if (!store) {
    const command = redisFromEnv();
    store = command ? createRedisIstatistikStore(command) : createMemoryIstatistikStore();
  }
  return store;
}
