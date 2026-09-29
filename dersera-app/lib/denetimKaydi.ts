import { depoKomutu, type RedisCommand } from "@/lib/redis";

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
  // Hesap silme: koşul onayı silinir; kopya kayıtları kalır ama kimlik ve ad "silindi" olur (kayıt sayıları korunur).
  hesabiUnut(hesapId: string, kullaniciAdi: string): Promise<void>;
}

export const SILINMIS_HESAP = { hesapId: "silindi", kullaniciAdi: "silinmiş hesap" } as const;

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
    async hesabiUnut(hesapId) {
      onaylar.delete(hesapId);
      kopyalar = kopyalar.map((k) => (k.hesapId === hesapId ? { ...k, ...SILINMIS_HESAP } : k));
    },
  };
}

const KOPYA_KEY = "dersera:denetim:kopya";
const onayKey = (hesapId: string) => `dersera:denetim:kosul-onayi:${hesapId}`;

// Kopya listesinde bu hesabın kayıtlarındaki kimlik ve ad alanlarını değiştirir (JSON ayrıştırmadan, düz metin
// eşleştirmeyle: hesap kimliği onaltılıktır). ARGV: kimlik alanı, yenisi, ad alanı, yenisi.
const KOPYA_UNUT = `local function degistir(s, a, b)
  local i, j = string.find(s, a, 1, true)
  if not i then return s end
  return string.sub(s, 1, i - 1) .. b .. string.sub(s, j + 1)
end
local n = 0
for i, v in ipairs(redis.call('LRANGE', KEYS[1], 0, -1)) do
  if string.find(v, ARGV[1], 1, true) then
    redis.call('LSET', KEYS[1], i - 1, degistir(degistir(v, ARGV[1], ARGV[2]), ARGV[3], ARGV[4]))
    n = n + 1
  end
end
return n`;

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
    async hesabiUnut(hesapId, kullaniciAdi) {
      await command(["DEL", onayKey(hesapId)]);
      const alan = (ad: string, deger: string) => `"${ad}":${JSON.stringify(deger)}`;
      await command(["EVAL", KOPYA_UNUT, 1, KOPYA_KEY, alan("hesapId", hesapId), alan("hesapId", SILINMIS_HESAP.hesapId), alan("kullaniciAdi", kullaniciAdi), alan("kullaniciAdi", SILINMIS_HESAP.kullaniciAdi)]);
    },
  };
}

let store: DenetimKaydiStore | null = null;
export function getDenetimKaydiStore(): DenetimKaydiStore {
  if (!store) {
    const command = depoKomutu("denetim kaydı");
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
