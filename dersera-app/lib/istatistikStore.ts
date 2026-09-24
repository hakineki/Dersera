import { redisFromEnv, type RedisCommand } from "@/lib/redis";

// Kütüphane oyunlarının saha istatistikleri. Oyun kodu yayın anında kütüphane kaydına ("sahip:kutuphaneId") bağlanır.
// Öğrenci sayısı = oyunu BİTİRİP sonucu kaydedilen oyuncular (katılım sayılmaz). Puan yalnız bitiren oyuncudan alınır.
// Anonimlik: oyuncu, takma adın SHA-256 özetiyle ("oyuncu") tutulur; puan değerinin kendisi hiçbir yerde saklanmaz,
// yalnız toplam ve sayı birikir. Kod başına kayıtlar oyunun saklama süresi kadar tutulur.
// Tutarlılık: kayıt ve sayaç artışları tek bir Redis betiğinde yapılır (yarım yazılmış oy/sayaç kalmaz).

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
  // Oyuncu ilk kez oy veriyorsa kaydeder; sayilsin ise kaynağın puan toplamı ve sayısı artar. İlk oy ise true.
  puanKaydet(kod: string, oyuncu: string, kaynak: string | null, puan: number, sayilsin: boolean, ttlMs: number): Promise<boolean>;
  istatistikler(kaynaklar: string[]): Promise<Istatistik[]>;
  sil(kaynak: string): Promise<void>;
}

const kodKey = (kod: string) => `dersera:istatistik:kod:${kod}`;
const sayacKey = (kaynak: string, alan: keyof Istatistik) => `dersera:istatistik:kutuphane:${kaynak}:${alan}`;
const bitirenKey = (kod: string) => `dersera:istatistik:bitiren:${kod}`;
const oyKey = (kod: string) => `dersera:istatistik:oy:${kod}`;
const ALANLAR: (keyof Istatistik)[] = ["ogrenci", "puanToplam", "puanSayisi"];
// Kaynağı olmayan kodda sayaç yazılmaz; betiğe yine geçerli bir anahtar verilir.
const YOK = "-";

export function createMemoryIstatistikStore(): IstatistikStore {
  const kodlar = new Map<string, string>();
  const sayac = new Map<string, number>();
  const bitirenler = new Map<string, Map<string, boolean>>();
  const oylar = new Map<string, Set<string>>();
  const artir = (k: string, n: number) => sayac.set(k, (sayac.get(k) ?? 0) + n);
  const oyKumesi = (k: string) => oylar.get(k) ?? oylar.set(k, new Set()).get(k)!;
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
      if (kaynak) artir(sayacKey(kaynak, "ogrenci"), 1);
      return "yeni-sayildi";
    },
    async bitirisDurumu(kod, oyuncu) {
      const d = bitirenler.get(kod)?.get(oyuncu);
      return d === undefined ? "yok" : d ? "sayildi" : "sayilmadi";
    },
    async puanKaydet(kod, oyuncu, kaynak, puan, sayilsin) {
      const s = oyKumesi(kod);
      if (s.has(oyuncu)) return false;
      s.add(oyuncu);
      if (kaynak && sayilsin) {
        artir(sayacKey(kaynak, "puanToplam"), puan);
        artir(sayacKey(kaynak, "puanSayisi"), 1);
      }
      return true;
    },
    async istatistikler(kaynaklar) {
      return kaynaklar.map((k) => ({
        ogrenci: sayac.get(sayacKey(k, "ogrenci")) ?? 0,
        puanToplam: sayac.get(sayacKey(k, "puanToplam")) ?? 0,
        puanSayisi: sayac.get(sayacKey(k, "puanSayisi")) ?? 0,
      }));
    },
    async sil(kaynak) {
      ALANLAR.forEach((a) => sayac.delete(sayacKey(kaynak, a)));
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

// KEYS: oy hash, puan toplamı, puan sayısı. ARGV: oyuncu, ttl, puan, sayılsın (1/0). Dönüş: 1 ilk oy, 0 tekrar.
const PUAN = `if redis.call('HSETNX', KEYS[1], ARGV[1], '1') == 0 then return 0 end
redis.call('PEXPIRE', KEYS[1], ARGV[2])
if ARGV[4] == '1' then
  redis.call('INCRBY', KEYS[2], ARGV[3])
  redis.call('INCR', KEYS[3])
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
      const r = await command(["EVAL", PUAN, 3, oyKey(kod), sayacKey(k, "puanToplam"), sayacKey(k, "puanSayisi"), oyuncu, Math.max(1000, ttlMs), puan, kaynak && sayilsin ? "1" : "0"]);
      return Number(r) === 1;
    },
    async istatistikler(kaynaklar) {
      if (kaynaklar.length === 0) return [];
      const degerler = ((await command(["MGET", ...kaynaklar.flatMap((k) => ALANLAR.map((a) => sayacKey(k, a)))])) as (string | null)[] | null) ?? [];
      return kaynaklar.map((_, i) => ({
        ogrenci: Number(degerler[i * 3] ?? 0),
        puanToplam: Number(degerler[i * 3 + 1] ?? 0),
        puanSayisi: Number(degerler[i * 3 + 2] ?? 0),
      }));
    },
    async sil(kaynak) {
      await command(["DEL", ...ALANLAR.map((a) => sayacKey(kaynak, a))]);
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
