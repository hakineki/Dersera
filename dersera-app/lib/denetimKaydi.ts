import { redisFromEnv, type RedisCommand } from "@/lib/redis";

// Denetim kayıtları: öğretmenin başkasına ait oyunun tam içeriğini (topluluk ya da okul kütüphanesinden) açması ve
// kullanım koşulları onayı. Sızan içeriğin kaynağı bulunabilsin, onay hukuki dayanak olsun diye tutulur.

export type KopyaTuru = "topluluk" | "okul";

export interface KopyaKaydi {
  tarih: number;
  hesapId: string;
  kullaniciAdi: string;
  tur: KopyaTuru;
  oyunId: string;
  baslik: string;
}

export interface KosulOnayi {
  surum: string;
  tarih: number;
}

// Son kayıtlar yönetici panelinde görülür; eskiler düşer.
export const KOPYA_SAKLAMA = 5000;

export interface DenetimKaydiStore {
  kopyaEkle(k: KopyaKaydi): Promise<void>;
  kopyalar(adet: number): Promise<KopyaKaydi[]>;
  kosulOnayiYaz(hesapId: string, o: KosulOnayi): Promise<void>;
  kosulOnayi(hesapId: string): Promise<KosulOnayi | null>;
}

export function createMemoryDenetimKaydiStore(): DenetimKaydiStore {
  let kopyalar: KopyaKaydi[] = [];
  const onaylar = new Map<string, KosulOnayi>();
  return {
    async kopyaEkle(k) {
      kopyalar = [k, ...kopyalar].slice(0, KOPYA_SAKLAMA);
    },
    async kopyalar(adet) {
      return kopyalar.slice(0, adet);
    },
    async kosulOnayiYaz(hesapId, o) {
      onaylar.set(hesapId, o);
    },
    async kosulOnayi(hesapId) {
      return onaylar.get(hesapId) ?? null;
    },
  };
}

const KOPYA_KEY = "dersera:denetim:kopya";
const onayKey = (hesapId: string) => `dersera:denetim:kosul-onayi:${hesapId}`;

export function createRedisDenetimKaydiStore(command: RedisCommand): DenetimKaydiStore {
  return {
    async kopyaEkle(k) {
      await command(["EVAL", "redis.call('LPUSH', KEYS[1], ARGV[1]) redis.call('LTRIM', KEYS[1], 0, tonumber(ARGV[2]) - 1) return 1", 1, KOPYA_KEY, JSON.stringify(k), KOPYA_SAKLAMA]);
    },
    async kopyalar(adet) {
      const ham = ((await command(["LRANGE", KOPYA_KEY, 0, adet - 1])) as string[] | null) ?? [];
      return ham.map((h) => JSON.parse(h) as KopyaKaydi);
    },
    async kosulOnayiYaz(hesapId, o) {
      await command(["SET", onayKey(hesapId), JSON.stringify(o)]);
    },
    async kosulOnayi(hesapId) {
      const ham = (await command(["GET", onayKey(hesapId)])) as string | null;
      return ham ? (JSON.parse(ham) as KosulOnayi) : null;
    },
  };
}

let store: DenetimKaydiStore | null = null;
export function getDenetimKaydiStore(): DenetimKaydiStore {
  if (!store) {
    const command = redisFromEnv();
    store = command ? createRedisDenetimKaydiStore(command) : createMemoryDenetimKaydiStore();
  }
  return store;
}

// Kayıt yan etkidir: yazılamazsa içerik yine verilir (öğretmen engellenmez), hata loglanır.
export async function kopyaKaydet(k: KopyaKaydi): Promise<void> {
  try {
    await getDenetimKaydiStore().kopyaEkle(k);
  } catch (err) {
    console.error("[denetim] kopya kaydı yazılamadı", err instanceof Error ? err.message : err);
  }
}
