import { kullaniciAdiNormal } from "@/lib/auth";
import type { Hesap } from "@/lib/authStore";
import { redisFromEnv, type RedisCommand } from "@/lib/redis";

// Yönetici rolü (moderasyon): DERSERA_YONETICILER="ad1,ad2" ortam değişkenindeki kullanıcı adları. Kodda sabit
// yönetici yoktur. Ad ilk girişte hesap kimliğine bağlanır ve bir daha değişmez: yönetici adını değiştirir ya da ad
// sonradan boşa çıkarsa, o adı alan başka hesap yönetici olamaz. Listedeki ad, yapılandırmadan ÖNCE yöneticinin
// kendisi tarafından alınmış olmalıdır (pilotta kayıt davet koduyla kapalıdır).

export interface YoneticiStore {
  // Ad henüz bağlı değilse bu kimliğe bağlar; adın bağlı olduğu kimliği döner.
  bagla(ad: string, hesapId: string): Promise<string>;
}

export function createMemoryYoneticiStore(): YoneticiStore {
  const m = new Map<string, string>();
  return {
    async bagla(ad, hesapId) {
      if (!m.has(ad)) m.set(ad, hesapId);
      return m.get(ad)!;
    },
  };
}

const bagKey = (ad: string) => `dersera:yonetici:${ad}`;

export function createRedisYoneticiStore(command: RedisCommand): YoneticiStore {
  return {
    async bagla(ad, hesapId) {
      await command(["SET", bagKey(ad), hesapId, "NX"]);
      return String(await command(["GET", bagKey(ad)]));
    },
  };
}

let store: YoneticiStore | null = null;
export function getYoneticiStore(): YoneticiStore {
  if (!store) {
    const command = redisFromEnv();
    store = command ? createRedisYoneticiStore(command) : createMemoryYoneticiStore();
  }
  return store;
}

export function yoneticiAdlari(): Set<string> {
  return new Set(
    (process.env.DERSERA_YONETICILER ?? "")
      .split(",")
      .map(kullaniciAdiNormal)
      .filter((a): a is string => !!a)
  );
}

export async function yoneticiMi(hesap: Hesap | null, s: YoneticiStore = getYoneticiStore()): Promise<boolean> {
  if (!hesap || !yoneticiAdlari().has(hesap.kullaniciAdi)) return false;
  return (await s.bagla(hesap.kullaniciAdi, hesap.id)) === hesap.id;
}
