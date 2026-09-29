import type { AuthStore } from "@/lib/authStore";
import { depoKomutu, type RedisCommand } from "@/lib/redis";

// Platform yöneticisinin öğretmen hesaplarına ve okullara yaptığı işlemlerin kaydı (askıya alma, geri açma, silme;
// okul yöneticiliğini devretme, okulu kapatma): kim, ne zaman, kime, hangi gerekçeyle. Hesaplar için yalnız kimlik
// tutulur; adlar okurken çözülür. Silinen hesabın kimliği hiçbir hesapla eşleşmediği için "silinmiş hesap" görünür
// (KVKK: ad saklanmaz). Okulun adı (kişisel veri değil) kapatıldıktan sonra da okunabilsin diye kayda yazılır.

export type YonetimIslemi = "askiya-al" | "geri-ac" | "sil" | "sifirlama-baglantisi" | "okul-devret" | "okul-kapat";

export interface YonetimIslemKaydi {
  tarih: number;
  yoneticiId: string;
  islem: YonetimIslemi;
  // Hesap işlemlerinde hedef hesap; okul işlemlerinde yeni yönetici (devret) ya da kapatılan okulun yöneticisi.
  hedefId: string;
  neden: string;
  okul?: { id: string; ad: string };
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

// Son işlemler, adlar çözülmüş (silinmiş hesap null).
export async function sonIslemler(d: { auth: Pick<AuthStore, "kullaniciAdlari">; islemler: YonetimIslemKaydiStore }, adet: number) {
  const kayitlar = await d.islemler.son(adet);
  const ids = [...new Set(kayitlar.flatMap((k) => [k.yoneticiId, k.hedefId]))];
  const bulunan = await d.auth.kullaniciAdlari(ids);
  const adlar = new Map(ids.map((id, i) => [id, bulunan[i] ?? null]));
  return kayitlar.map((k) => ({
    tarih: k.tarih,
    islem: k.islem,
    neden: k.neden,
    yonetici: adlar.get(k.yoneticiId) ?? null,
    hedef: adlar.get(k.hedefId) ?? null,
    okulAdi: k.okul?.ad ?? null,
  }));
}
export type SonIslem = Awaited<ReturnType<typeof sonIslemler>>[number];

let store: YonetimIslemKaydiStore | null = null;
export function getYonetimIslemKaydiStore(): YonetimIslemKaydiStore {
  if (!store) {
    const command = depoKomutu("yönetim işlem kaydı");
    store = command ? createRedisYonetimIslemKaydiStore(command) : createMemoryYonetimIslemKaydiStore();
  }
  return store;
}
