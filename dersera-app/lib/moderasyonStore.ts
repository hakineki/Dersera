import { MODERASYON, type ModerasyonKaydi, type ModerasyonSonucu } from "@/lib/moderasyon";
import { redisFromEnv, type RedisCommand } from "@/lib/redis";

// Anahtarlar: kayıt (JSON, süreli), tekillik (aynı içerik/oyun kuyruğa bir kez), bekleyen ve kapatılan sıralı
// kümeler (tarih azalan okunur) ve karar kilidi. Karar kilidi kaydın kapalı sayılmasının tek doğruluk kaynağıdır:
// kilit varsa kayıt, kilitteki sonuçla kapatılmış okunur (sonraki yazımlar yarıda kalsa bile).
export interface ModerasyonStore {
  // Tekillik anahtarı daha önce görüldüyse yazmaz, false döner. Kuyruk sınırını aşan en eski kayıtlar düşer ve
  // tekillik anahtarları silinir (aynı içerik yeniden gelirse kuyruğa girer).
  ekle(k: ModerasyonKaydi, tekil: string): Promise<boolean>;
  liste(durum: ModerasyonKaydi["durum"], adet: number): Promise<ModerasyonKaydi[]>;
  get(id: string): Promise<ModerasyonKaydi | null>;
  // İlk karar kilidi alır; kilit alınmışsa false.
  kilitle(id: string, sonuc: ModerasyonSonucu): Promise<boolean>;
  // Eylem yapılamadıysa kilit bırakılır, kayıt yeniden karar bekler.
  kilidiBirak(id: string): Promise<void>;
  // Kilitteki sonuçla kaydı kapalı yazar ve listeleri günceller.
  tamamla(id: string): Promise<ModerasyonKaydi | null>;
}

const SAKLAMA_MS = MODERASYON.saklamaGun * 24 * 60 * 60 * 1000;

// Kayıt + kilit → okunan hâl.
const birlestir = (k: ModerasyonKaydi, kilit: ModerasyonSonucu | null): ModerasyonKaydi => (kilit ? { ...k, durum: "kapatildi", sonuc: kilit } : k);

export function createMemoryModerasyonStore(): ModerasyonStore {
  const kayitlar = new Map<string, ModerasyonKaydi>();
  const tekilOf = new Map<string, string>(); // kayıt id → tekillik anahtarı
  const tekiller = new Set<string>();
  const kilitler = new Map<string, ModerasyonSonucu>();
  const oku = (id: string) => {
    const k = kayitlar.get(id);
    return k ? birlestir(k, kilitler.get(id) ?? null) : null;
  };
  const sirali = (durum: ModerasyonKaydi["durum"]) => [...kayitlar.values()].filter((k) => k.durum === durum).sort((a, b) => b.tarih - a.tarih);
  return {
    async ekle(k, tekil) {
      if (tekiller.has(tekil)) return false;
      tekiller.add(tekil);
      tekilOf.set(k.id, tekil);
      kayitlar.set(k.id, k);
      for (const eski of sirali("bekliyor").slice(MODERASYON.enCokKayit)) {
        kayitlar.delete(eski.id);
        tekiller.delete(tekilOf.get(eski.id)!);
        tekilOf.delete(eski.id);
      }
      return true;
    },
    async liste(durum, adet) {
      return sirali(durum)
        .slice(0, adet)
        .map((k) => oku(k.id)!);
    },
    async get(id) {
      return oku(id);
    },
    async kilitle(id, sonuc) {
      if (!kayitlar.has(id) || kilitler.has(id)) return false;
      kilitler.set(id, sonuc);
      return true;
    },
    async kilidiBirak(id) {
      kilitler.delete(id);
    },
    async tamamla(id) {
      const k = oku(id);
      if (!k || !k.sonuc) return null;
      kayitlar.set(id, k);
      return k;
    },
  };
}

const kayitKey = (id: string) => `dersera:moderasyon:kayit:${id}`;
const tekilKey = (t: string) => `dersera:moderasyon:tekil:${t}`;
const kilitKey = (id: string) => `dersera:moderasyon:karar:${id}`;
const BEKLEYEN = "dersera:moderasyon:bekleyen";
const KAPALI = "dersera:moderasyon:kapali";

type Saklanan = ModerasyonKaydi & { tekil?: string };

export function createRedisModerasyonStore(command: RedisCommand): ModerasyonStore {
  const ham = async (ids: string[]): Promise<(Saklanan | null)[]> => {
    if (ids.length === 0) return [];
    const [kayitlar, kilitler] = await Promise.all([
      command(["MGET", ...ids.map(kayitKey)]) as Promise<(string | null)[] | null>,
      command(["MGET", ...ids.map(kilitKey)]) as Promise<(string | null)[] | null>,
    ]);
    return ids.map((_, i) => {
      const k = kayitlar?.[i];
      if (!k) return null;
      const kilit = kilitler?.[i];
      return birlestir(JSON.parse(k) as Saklanan, kilit ? (JSON.parse(kilit) as ModerasyonSonucu) : null);
    });
  };
  const disa = (k: Saklanan): ModerasyonKaydi => {
    const o = { ...k };
    delete o.tekil;
    return o;
  };
  return {
    async ekle(k, tekil) {
      // Kayıt önce yazılır; tekillik alınamazsa geri alınır. Sonraki adım yarıda kalırsa tekillik de bırakılır.
      await command(["SET", kayitKey(k.id), JSON.stringify({ ...k, tekil }), "PX", SAKLAMA_MS]);
      if ((await command(["SET", tekilKey(tekil), k.id, "NX", "PX", SAKLAMA_MS])) !== "OK") {
        await command(["DEL", kayitKey(k.id)]);
        return false;
      }
      try {
        await command(["ZADD", BEKLEYEN, k.tarih, k.id]);
      } catch (err) {
        await command(["DEL", tekilKey(tekil), kayitKey(k.id)]).catch(() => undefined);
        throw err;
      }
      // Kuyruk sınırı: en eskiler düşer, tekillikleri silinir.
      const dusen = ((await command(["ZRANGE", BEKLEYEN, 0, -(MODERASYON.enCokKayit + 1)])) as string[] | null) ?? [];
      if (dusen.length) {
        const eskiler = (await ham(dusen)).filter((x): x is Saklanan => !!x);
        await command(["ZREM", BEKLEYEN, ...dusen]);
        await command(["DEL", ...dusen.map(kayitKey), ...eskiler.flatMap((x) => (x.tekil ? [tekilKey(x.tekil)] : []))]);
      }
      return true;
    },
    async liste(durum, adet) {
      // Bekleyen listesi, kilidi alınmış ama tamamlanamamış kaydı kapatılmış (sonuçlu) gösterir.
      const ids = ((await command(["ZREVRANGE", durum === "bekliyor" ? BEKLEYEN : KAPALI, 0, adet - 1])) as string[] | null) ?? [];
      return (await ham(ids)).flatMap((k) => (k ? [disa(k)] : []));
    },
    async get(id) {
      const [k] = await ham([id]);
      return k ? disa(k) : null;
    },
    async kilitle(id, sonuc) {
      return (await command(["SET", kilitKey(id), JSON.stringify(sonuc), "NX", "PX", SAKLAMA_MS])) === "OK";
    },
    async kilidiBirak(id) {
      await command(["DEL", kilitKey(id)]);
    },
    async tamamla(id) {
      const [k] = await ham([id]);
      if (!k || !k.sonuc) return null;
      await command(["SET", kayitKey(id), JSON.stringify(k), "PX", SAKLAMA_MS]);
      await command(["ZREM", BEKLEYEN, id]);
      await command(["ZADD", KAPALI, k.sonuc.tarih, id]);
      await command(["ZREMRANGEBYRANK", KAPALI, 0, -(MODERASYON.enCokKayit + 1)]);
      return disa(k);
    },
  };
}

let store: ModerasyonStore | null = null;
export function getModerasyonStore(): ModerasyonStore {
  if (!store) {
    const command = redisFromEnv();
    store = command ? createRedisModerasyonStore(command) : createMemoryModerasyonStore();
  }
  return store;
}
