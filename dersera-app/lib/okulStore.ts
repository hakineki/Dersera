import { OKUL, paylasimOzetiOf, type Okul, type OkulPaylasimi, type OkulUyesi, type PaylasimOzeti } from "@/lib/okul";
import { redisFromEnv, type RedisCommand } from "@/lib/redis";

// Anahtarlar: okul kaydı, hesap → okul (öğretmen başına tek okul; tüm üyelik değişiklikleri bu anahtarla atomik),
// okulun üye tablosu, davet kodu → okul, paylaşım özetleri (liste), paylaşımın tam kopyası ("Kullan") ve
// kaynak → paylaşım (aynı oyunun yeniden paylaşımı öncekinin yerine geçer).
export type KatilmaSonucu = "ok" | "zaten-uye" | "dolu";
export type PaylasmaSonucu = "ok" | "dolu";

export interface OkulStore {
  // Açan hesap başka okulda değilse okulu ve yönetici üyeliğini birlikte yazar.
  olustur(okul: Okul, yonetici: OkulUyesi): Promise<boolean>;
  get(okulId: string): Promise<Okul | null>;
  okulOf(hesapId: string): Promise<string | null>;
  davettenOkul(kod: string): Promise<string | null>;
  katil(okulId: string, uye: OkulUyesi): Promise<KatilmaSonucu>;
  uyeler(okulId: string): Promise<OkulUyesi[]>;
  // Yalnız hesap hâlâ bu okulun üyesiyse çıkarır.
  uyeCikar(okulId: string, hesapId: string): Promise<boolean>;
  davetYenile(okul: Okul, yeniKod: string): Promise<boolean>;
  paylas(okulId: string, p: OkulPaylasimi): Promise<PaylasmaSonucu>;
  paylasimlar(okulId: string): Promise<PaylasimOzeti[]>;
  paylasim(okulId: string, id: string): Promise<OkulPaylasimi | null>;
  paylasimKaldir(okulId: string, p: Pick<OkulPaylasimi, "id" | "kaynak">): Promise<boolean>;
  // Kaynakların (kütüphane kayıtlarının) okuldaki paylaşım kimlikleri; paylaşılmamışsa null.
  kaynakPaylasimlari(okulId: string, kaynaklar: string[]): Promise<(string | null)[]>;
}

export function createMemoryOkulStore(): OkulStore {
  const okullar = new Map<string, Okul>();
  const uyeOkulu = new Map<string, string>();
  const uyeler = new Map<string, Map<string, OkulUyesi>>();
  const davetler = new Map<string, string>();
  const paylasimlar = new Map<string, Map<string, OkulPaylasimi>>();
  const uyeTablosu = (okulId: string) => uyeler.get(okulId) ?? uyeler.set(okulId, new Map()).get(okulId)!;
  const paylasimTablosu = (okulId: string) => paylasimlar.get(okulId) ?? paylasimlar.set(okulId, new Map()).get(okulId)!;
  return {
    async olustur(okul, yonetici) {
      if (uyeOkulu.has(yonetici.hesapId)) return false;
      okullar.set(okul.id, okul);
      davetler.set(okul.davetKodu, okul.id);
      uyeOkulu.set(yonetici.hesapId, okul.id);
      uyeTablosu(okul.id).set(yonetici.hesapId, yonetici);
      return true;
    },
    async get(okulId) {
      return okullar.get(okulId) ?? null;
    },
    async okulOf(hesapId) {
      return uyeOkulu.get(hesapId) ?? null;
    },
    async davettenOkul(kod) {
      return davetler.get(kod) ?? null;
    },
    async katil(okulId, uye) {
      if (uyeOkulu.has(uye.hesapId)) return "zaten-uye";
      if (uyeTablosu(okulId).size >= OKUL.enCokUye) return "dolu";
      uyeOkulu.set(uye.hesapId, okulId);
      uyeTablosu(okulId).set(uye.hesapId, uye);
      return "ok";
    },
    async uyeler(okulId) {
      return [...uyeTablosu(okulId).values()];
    },
    async uyeCikar(okulId, hesapId) {
      if (uyeOkulu.get(hesapId) !== okulId) return false;
      uyeOkulu.delete(hesapId);
      uyeTablosu(okulId).delete(hesapId);
      return true;
    },
    async davetYenile(okul, yeniKod) {
      if (davetler.has(yeniKod)) return false;
      const eski = okullar.get(okul.id);
      if (eski) davetler.delete(eski.davetKodu);
      davetler.set(yeniKod, okul.id);
      okullar.set(okul.id, { ...okul, davetKodu: yeniKod });
      return true;
    },
    async paylas(okulId, p) {
      const t = paylasimTablosu(okulId);
      const eski = [...t.values()].find((x) => x.kaynak === p.kaynak);
      if (!eski && t.size >= OKUL.enCokPaylasim) return "dolu";
      if (eski) t.delete(eski.id);
      t.set(p.id, p);
      return "ok";
    },
    async paylasimlar(okulId) {
      return [...paylasimTablosu(okulId).values()].map(paylasimOzetiOf);
    },
    async paylasim(okulId, id) {
      return paylasimTablosu(okulId).get(id) ?? null;
    },
    async paylasimKaldir(okulId, p) {
      return paylasimTablosu(okulId).delete(p.id);
    },
    async kaynakPaylasimlari(okulId, kaynaklar) {
      const t = [...paylasimTablosu(okulId).values()];
      return kaynaklar.map((k) => t.find((x) => x.kaynak === k)?.id ?? null);
    },
  };
}

const okulKey = (id: string) => `dersera:okul:kayit:${id}`;
const uyeOkuluKey = (hesapId: string) => `dersera:okul:uye-okulu:${hesapId}`;
const uyelerKey = (okulId: string) => `dersera:okul:uyeler:${okulId}`;
const davetKey = (kod: string) => `dersera:okul:davet:${kod}`;
const ozetKey = (okulId: string) => `dersera:okul:paylasim-ozet:${okulId}`;
const kaynakKey = (okulId: string) => `dersera:okul:paylasim-kaynak:${okulId}`;
const tamKey = (id: string) => `dersera:okul:paylasim:${id}`;

// KEYS: hesap→okul, üye tablosu, okul kaydı, davet. ARGV: okulId, hesapId, üye JSON, okul JSON, davet kodu.
const OLUSTUR = `if redis.call('EXISTS', KEYS[1]) == 1 then return 0 end
if redis.call('SET', KEYS[4], ARGV[1], 'NX') == false then return -1 end
redis.call('SET', KEYS[3], ARGV[4])
redis.call('SET', KEYS[1], ARGV[1])
redis.call('HSET', KEYS[2], ARGV[2], ARGV[3])
return 1`;
// KEYS: hesap→okul, üye tablosu. ARGV: okulId, hesapId, üye JSON, en çok üye.
const KATIL = `if redis.call('EXISTS', KEYS[1]) == 1 then return 0 end
if redis.call('HLEN', KEYS[2]) >= tonumber(ARGV[4]) then return -1 end
redis.call('SET', KEYS[1], ARGV[1])
redis.call('HSET', KEYS[2], ARGV[2], ARGV[3])
return 1`;
// KEYS: hesap→okul, üye tablosu. ARGV: okulId, hesapId.
const CIKAR = `if redis.call('GET', KEYS[1]) ~= ARGV[1] then return 0 end
redis.call('DEL', KEYS[1])
redis.call('HDEL', KEYS[2], ARGV[2])
return 1`;
// KEYS: yeni davet, eski davet, okul kaydı. ARGV: okulId, okul JSON.
const DAVET_YENILE = `if redis.call('SET', KEYS[1], ARGV[1], 'NX') == false then return 0 end
redis.call('DEL', KEYS[2])
redis.call('SET', KEYS[3], ARGV[2])
return 1`;
// KEYS: özetler, kaynak→id, yeni tam kopya, eski tam kopya (yoksa yeninin aynısı). ARGV: id, kaynak, özet JSON,
// tam JSON, en çok paylaşım, okunan eski id ('' yoksa). Eski id bu arada değiştiyse -1 (yeniden denenir).
const PAYLAS = `local su = redis.call('HGET', KEYS[2], ARGV[2]) or ''
if su ~= ARGV[6] then return -1 end
if su == '' and redis.call('HLEN', KEYS[1]) >= tonumber(ARGV[5]) then return 0 end
if su ~= '' then
  redis.call('HDEL', KEYS[1], su)
  redis.call('DEL', KEYS[4])
end
redis.call('SET', KEYS[3], ARGV[4])
redis.call('HSET', KEYS[1], ARGV[1], ARGV[3])
redis.call('HSET', KEYS[2], ARGV[2], ARGV[1])
return 1`;
// KEYS: özetler, kaynak→id, tam kopya. ARGV: id, kaynak.
const KALDIR = `if redis.call('HDEL', KEYS[1], ARGV[1]) == 0 then return 0 end
if redis.call('HGET', KEYS[2], ARGV[2]) == ARGV[1] then redis.call('HDEL', KEYS[2], ARGV[2]) end
redis.call('DEL', KEYS[3])
return 1`;

export function createRedisOkulStore(command: RedisCommand): OkulStore {
  return {
    async olustur(okul, yonetici) {
      const r = Number(
        await command(["EVAL", OLUSTUR, 4, uyeOkuluKey(yonetici.hesapId), uyelerKey(okul.id), okulKey(okul.id), davetKey(okul.davetKodu), okul.id, yonetici.hesapId, JSON.stringify(yonetici), JSON.stringify(okul), okul.davetKodu])
      );
      if (r === -1) throw new Error("Davet kodu çakıştı");
      return r === 1;
    },
    async get(okulId) {
      const ham = (await command(["GET", okulKey(okulId)])) as string | null;
      return ham ? (JSON.parse(ham) as Okul) : null;
    },
    async okulOf(hesapId) {
      return ((await command(["GET", uyeOkuluKey(hesapId)])) as string | null) ?? null;
    },
    async davettenOkul(kod) {
      return ((await command(["GET", davetKey(kod)])) as string | null) ?? null;
    },
    async katil(okulId, uye) {
      const r = Number(await command(["EVAL", KATIL, 2, uyeOkuluKey(uye.hesapId), uyelerKey(okulId), okulId, uye.hesapId, JSON.stringify(uye), OKUL.enCokUye]));
      return r === 1 ? "ok" : r === 0 ? "zaten-uye" : "dolu";
    },
    async uyeler(okulId) {
      const vals = ((await command(["HVALS", uyelerKey(okulId)])) as string[] | null) ?? [];
      return vals.map((v) => JSON.parse(v) as OkulUyesi);
    },
    async uyeCikar(okulId, hesapId) {
      return Number(await command(["EVAL", CIKAR, 2, uyeOkuluKey(hesapId), uyelerKey(okulId), okulId, hesapId])) === 1;
    },
    async davetYenile(okul, yeniKod) {
      const guncel = { ...okul, davetKodu: yeniKod };
      return Number(await command(["EVAL", DAVET_YENILE, 3, davetKey(yeniKod), davetKey(okul.davetKodu), okulKey(okul.id), okul.id, JSON.stringify(guncel)])) === 1;
    },
    async paylas(okulId, p) {
      for (let deneme = 0; deneme < 3; deneme++) {
        const eski = ((await command(["HGET", kaynakKey(okulId), p.kaynak])) as string | null) ?? "";
        const r = Number(
          await command([
            "EVAL",
            PAYLAS,
            4,
            ozetKey(okulId),
            kaynakKey(okulId),
            tamKey(p.id),
            tamKey(eski || p.id),
            p.id,
            p.kaynak,
            JSON.stringify(paylasimOzetiOf(p)),
            JSON.stringify(p),
            OKUL.enCokPaylasim,
            eski,
          ])
        );
        if (r === 1) return "ok";
        if (r === 0) return "dolu";
      }
      throw new Error("Paylaşım eşzamanlı güncellendi");
    },
    async paylasimlar(okulId) {
      const vals = ((await command(["HVALS", ozetKey(okulId)])) as string[] | null) ?? [];
      return vals.map((v) => JSON.parse(v) as PaylasimOzeti);
    },
    async paylasim(okulId, id) {
      // Kimlik okulun özet tablosunda değilse (başka okulun paylaşımı) okunmaz.
      if (Number(await command(["HEXISTS", ozetKey(okulId), id])) !== 1) return null;
      const ham = (await command(["GET", tamKey(id)])) as string | null;
      return ham ? (JSON.parse(ham) as OkulPaylasimi) : null;
    },
    async paylasimKaldir(okulId, p) {
      return Number(await command(["EVAL", KALDIR, 3, ozetKey(okulId), kaynakKey(okulId), tamKey(p.id), p.id, p.kaynak])) === 1;
    },
    async kaynakPaylasimlari(okulId, kaynaklar) {
      if (kaynaklar.length === 0) return [];
      const r = ((await command(["HMGET", kaynakKey(okulId), ...kaynaklar])) as (string | null)[] | null) ?? [];
      return kaynaklar.map((_, i) => r[i] ?? null);
    },
  };
}

let store: OkulStore | null = null;
export function getOkulStore(): OkulStore {
  if (!store) {
    const command = redisFromEnv();
    store = command ? createRedisOkulStore(command) : createMemoryOkulStore();
  }
  return store;
}
