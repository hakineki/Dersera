import { depoKomutu, type RedisCommand } from "@/lib/redis";

// Platform yöneticisinin öğretmen hesaplarına yaptığı işlemlerin kaydı (askıya alma, geri açma, silme): kim, ne zaman,
// kime, hangi gerekçeyle. Yalnız hesap kimlikleri tutulur; adlar okurken çözülür. Silinen hesabın kimliği hiçbir
// hesapla eşleşmediği için "silinmiş hesap" görünür (KVKK: ad saklanmaz).

export type YonetimIslemi = "askiya-al" | "geri-ac" | "sil";

export interface YonetimIslemKaydi {
  tarih: number;
  yoneticiId: string;
  islem: YonetimIslemi;
  hedefId: string;
  neden: string;
}

export const ISLEM_SAKLAMA = 500;

export interface YonetimIslemKaydiStore {
  ekle(k: YonetimIslemKaydi): Promise<void>;
  // En yeniler önce.
  son(adet: number): Promise<YonetimIslemKaydi[]>;
}

export function createMemoryYonetimIslemKaydiStore(): YonetimIslemKaydiStore {
  let kayitlar: YonetimIslemKaydi[] = [];
  return {
    async ekle(k) {
      kayitlar = [k, ...kayitlar].slice(0, ISLEM_SAKLAMA);
    },
    async son(adet) {
      return kayitlar.slice(0, adet);
    },
  };
}

const KEY = "dersera:yonetim:islemler";

export function createRedisYonetimIslemKaydiStore(command: RedisCommand): YonetimIslemKaydiStore {
  return {
    async ekle(k) {
      await command(["LPUSH", KEY, JSON.stringify(k)]);
      await command(["LTRIM", KEY, 0, ISLEM_SAKLAMA - 1]);
    },
    async son(adet) {
      const r = ((await command(["LRANGE", KEY, 0, adet - 1])) as string[] | null) ?? [];
      return r.map((s) => JSON.parse(s) as YonetimIslemKaydi);
    },
  };
}

let store: YonetimIslemKaydiStore | null = null;
export function getYonetimIslemKaydiStore(): YonetimIslemKaydiStore {
  if (!store) {
    const command = depoKomutu("yönetim işlem kaydı");
    store = command ? createRedisYonetimIslemKaydiStore(command) : createMemoryYonetimIslemKaydiStore();
  }
  return store;
}
