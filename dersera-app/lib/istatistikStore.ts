import { redisFromEnv, type RedisCommand } from "@/lib/redis";

// Kütüphane oyunlarının saha istatistikleri: kaç öğrenci oynadı, öğrencilerin verdiği puanların toplamı ve sayısı.
// Oyun kodu yayın anında kütüphane kaydına ("sahip:kutuphaneId") bağlanır; katılım ve puan bu bağ üzerinden sayılır.
// Öğrenci puanı anonimdir: takma ad → puan eşlemesi yalnız aynı oyuncunun ikinci kez oy vermesini engellemek için,
// oyunun saklama süresi kadar tutulur; hiçbir uç nokta tek tek puanları döndürmez.

export interface Istatistik {
  ogrenci: number;
  puanToplam: number;
  puanSayisi: number;
}

export interface IstatistikStore {
  kodBagla(kod: string, kutuphaneKaynagi: string, ttlMs: number): Promise<void>;
  kodunKaynagi(kod: string): Promise<string | null>;
  ogrenciEkle(kaynak: string): Promise<void>;
  puanEkle(kaynak: string, puan: number): Promise<void>;
  // Takma ad bu oyunda ilk kez oy veriyorsa kaydeder ve true döner.
  oyKaydet(kod: string, nicknameKey: string, ttlMs: number): Promise<boolean>;
  istatistikler(kaynaklar: string[]): Promise<Istatistik[]>;
}

const kodKey = (kod: string) => `dersera:istatistik:kod:${kod}`;
const sayacKey = (kaynak: string, alan: keyof Istatistik) => `dersera:istatistik:kutuphane:${kaynak}:${alan}`;
const oyKey = (kod: string) => `dersera:istatistik:oy:${kod}`;

export function createMemoryIstatistikStore(): IstatistikStore {
  const kodlar = new Map<string, string>();
  const sayac = new Map<string, number>();
  const oylar = new Map<string, Set<string>>();
  const artir = (k: string, n: number) => sayac.set(k, (sayac.get(k) ?? 0) + n);
  return {
    async kodBagla(kod, kaynak) {
      kodlar.set(kod, kaynak);
    },
    async kodunKaynagi(kod) {
      return kodlar.get(kod) ?? null;
    },
    async ogrenciEkle(kaynak) {
      artir(sayacKey(kaynak, "ogrenci"), 1);
    },
    async puanEkle(kaynak, puan) {
      artir(sayacKey(kaynak, "puanToplam"), puan);
      artir(sayacKey(kaynak, "puanSayisi"), 1);
    },
    async oyKaydet(kod, nick) {
      const s = oylar.get(kod) ?? new Set<string>();
      if (s.has(nick)) return false;
      s.add(nick);
      oylar.set(kod, s);
      return true;
    },
    async istatistikler(kaynaklar) {
      return kaynaklar.map((k) => ({
        ogrenci: sayac.get(sayacKey(k, "ogrenci")) ?? 0,
        puanToplam: sayac.get(sayacKey(k, "puanToplam")) ?? 0,
        puanSayisi: sayac.get(sayacKey(k, "puanSayisi")) ?? 0,
      }));
    },
  };
}

export function createRedisIstatistikStore(command: RedisCommand): IstatistikStore {
  return {
    async kodBagla(kod, kaynak, ttlMs) {
      await command(["SET", kodKey(kod), kaynak, "PX", Math.max(1000, ttlMs)]);
    },
    async kodunKaynagi(kod) {
      return ((await command(["GET", kodKey(kod)])) as string | null) ?? null;
    },
    async ogrenciEkle(kaynak) {
      await command(["INCR", sayacKey(kaynak, "ogrenci")]);
    },
    async puanEkle(kaynak, puan) {
      await command(["INCRBY", sayacKey(kaynak, "puanToplam"), puan]);
      await command(["INCR", sayacKey(kaynak, "puanSayisi")]);
    },
    async oyKaydet(kod, nick, ttlMs) {
      // Puanın kendisi saklanmaz; yalnız "bu takma ad oy verdi" bilgisi süreli tutulur.
      const eklendi = Number(await command(["HSETNX", oyKey(kod), nick, "1"])) === 1;
      await command(["PEXPIRE", oyKey(kod), Math.max(1000, ttlMs)]);
      return eklendi;
    },
    async istatistikler(kaynaklar) {
      if (kaynaklar.length === 0) return [];
      const alanlar: (keyof Istatistik)[] = ["ogrenci", "puanToplam", "puanSayisi"];
      const degerler = ((await command(["MGET", ...kaynaklar.flatMap((k) => alanlar.map((a) => sayacKey(k, a)))])) as (string | null)[] | null) ?? [];
      return kaynaklar.map((_, i) => ({
        ogrenci: Number(degerler[i * 3] ?? 0),
        puanToplam: Number(degerler[i * 3 + 1] ?? 0),
        puanSayisi: Number(degerler[i * 3 + 2] ?? 0),
      }));
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
