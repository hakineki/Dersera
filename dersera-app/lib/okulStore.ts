import { OKUL, paylasimOzetiOf, type Okul, type OkulPaylasimi, type OkulUyesi, type PaylasimOzeti } from "@/lib/okul";
import { anahtarlariTara, depoKomutu, type RedisCommand } from "@/lib/redis";

// Anahtarlar: okul kaydı, hesap → okul (öğretmen başına tek okul; tüm üyelik değişiklikleri bu anahtarla atomik),
// okulun üye tablosu, davet kodu → okul, paylaşım özetleri (liste), paylaşımın tam kopyası ("Kullan") ve
// kaynak → paylaşım (aynı oyunun yeniden paylaşımı öncekinin yerine geçer).
// "yok": okul kapatıldı ya da kapatılıyor.
export type KatilmaSonucu = "ok" | "zaten-uye" | "dolu" | "yok";
export type PaylasmaSonucu = "ok" | "dolu" | "yok";
// "degisti": kod bu arada başka bir istekle yenilendi (öksüz kod bırakılmaz); "cakisma": yeni kod başka okulda.
export type DavetYenilemeSonucu = "ok" | "degisti" | "cakisma";

export interface OkulStore {
  // Açan hesap başka okulda değilse okulu ve yönetici üyeliğini birlikte yazar.
  olustur(okul: Okul, yonetici: OkulUyesi): Promise<boolean>;
  get(okulId: string): Promise<Okul | null>;
  // Birden çok okul tek okumada (sıra korunur; olmayan null).
  okullar(okulIdler: string[]): Promise<(Okul | null)[]>;
  okulOf(hesapId: string): Promise<string | null>;
  davettenOkul(kod: string): Promise<string | null>;
  katil(okulId: string, uye: OkulUyesi): Promise<KatilmaSonucu>;
  uyeler(okulId: string): Promise<OkulUyesi[]>;
  // Yalnız hesap hâlâ bu okulun üyesiyse çıkarır.
  uyeCikar(okulId: string, hesapId: string): Promise<boolean>;
  // Yalnız okulun kodu hâlâ okul.davetKodu ise yeniler.
  davetYenile(okul: Okul, yeniKod: string): Promise<DavetYenilemeSonucu>;
  paylas(okulId: string, p: OkulPaylasimi): Promise<PaylasmaSonucu>;
  paylasimlar(okulId: string): Promise<PaylasimOzeti[]>;
  paylasim(okulId: string, id: string): Promise<OkulPaylasimi | null>;
  paylasimKaldir(okulId: string, p: Pick<OkulPaylasimi, "id" | "kaynak">): Promise<boolean>;
  // Kaynakların (kütüphane kayıtlarının) okuldaki paylaşım kimlikleri; paylaşılmamışsa null.
  kaynakPaylasimlari(okulId: string, kaynaklar: string[]): Promise<(string | null)[]>;
  // Hesabın bütün okullardaki paylaşımları (ayrıldığı ya da çıkarıldığı okullar dahil; hesap silme için, seyrek).
  hesabinPaylasimlari(hesapId: string): Promise<{ okulId: string; paylasim: OkulPaylasimi }[]>;
  // Toplam okul sayısı (yönetim özeti; tarama, seyrek).
  okulSayisi(): Promise<number>;
  // Bütün okulların kimlikleri (yönetim listesi; tarama, seyrek).
  okulIdleri(): Promise<string[]>;
  // Okul yöneticiliğini üyeler arasında atomik olarak devreder: eski hâlâ yönetici, yeni hâlâ öğretmen üye olmalı;
  // okul kaydındaki yönetici de değişir. Koşul tutmazsa hiçbir şey yazılmaz (false).
  yoneticiDevret(okulId: string, eskiId: string, yeniId: string): Promise<boolean>;
  // Kapatmanın ilk adımı: davet kodu silinir, kayıt "kapanıyor" olur (yeni katılma ve paylaşma yok). Kayıt bu arada
  // değiştiyse (davet yenilendi, yönetici devredildi) false.
  kapatmaBaslat(okul: Okul): Promise<boolean>;
  // Son adım (üyeler ve paylaşımlar kaldırıldıktan sonra): okul kaydı ve kalan tablolar silinir.
  kapatmaBitir(okulId: string): Promise<void>;
}

export function createMemoryOkulStore(): OkulStore {
  const okullar = new Map<string, Okul>();
  const uyeOkulu = new Map<string, string>();
  const uyeler = new Map<string, Map<string, OkulUyesi>>();
  const davetler = new Map<string, string>();
  const paylasimlar = new Map<string, Map<string, OkulPaylasimi>>();
  const uyeTablosu = (okulId: string) => uyeler.get(okulId) ?? uyeler.set(okulId, new Map()).get(okulId)!;
  const paylasimTablosu = (okulId: string) => paylasimlar.get(okulId) ?? paylasimlar.set(okulId, new Map()).get(okulId)!;
  const acik = (okulId: string) => {
    const o = okullar.get(okulId);
    return !!o && !o.kapaniyor;
  };
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
    async okullar(okulIdler) {
      return okulIdler.map((id) => okullar.get(id) ?? null);
    },
    async okulOf(hesapId) {
      return uyeOkulu.get(hesapId) ?? null;
    },
    async davettenOkul(kod) {
      return davetler.get(kod) ?? null;
    },
    async katil(okulId, uye) {
      if (!acik(okulId)) return "yok";
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
      const su = okullar.get(okul.id);
      if (!su || su.davetKodu !== okul.davetKodu) return "degisti";
      if (davetler.has(yeniKod)) return "cakisma";
      davetler.delete(su.davetKodu);
      davetler.set(yeniKod, okul.id);
      okullar.set(okul.id, { ...su, davetKodu: yeniKod });
      return "ok";
    },
    async paylas(okulId, p) {
      if (!acik(okulId)) return "yok";
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
    async okulSayisi() {
      return okullar.size;
    },
    async okulIdleri() {
      return [...okullar.keys()];
    },
    async yoneticiDevret(okulId, eskiId, yeniId) {
      const t = uyeTablosu(okulId);
      const [e, y, o] = [t.get(eskiId), t.get(yeniId), okullar.get(okulId)];
      if (!o || uyeOkulu.get(eskiId) !== okulId || uyeOkulu.get(yeniId) !== okulId || e?.rol !== "yonetici" || y?.rol !== "ogretmen") return false;
      t.set(eskiId, { ...e, rol: "ogretmen" });
      t.set(yeniId, { ...y, rol: "yonetici" });
      if (o.olusturan === eskiId) okullar.set(okulId, { ...o, olusturan: yeniId });
      return true;
    },
    async kapatmaBaslat(okul) {
      const su = okullar.get(okul.id);
      if (!su || su.davetKodu !== okul.davetKodu || su.olusturan !== okul.olusturan) return false;
      davetler.delete(su.davetKodu);
      okullar.set(okul.id, { ...su, kapaniyor: true });
      return true;
    },
    async kapatmaBitir(okulId) {
      okullar.delete(okulId);
      uyeler.delete(okulId);
      paylasimlar.delete(okulId);
    },
    async hesabinPaylasimlari(hesapId) {
      return [...paylasimlar].flatMap(([okulId, t]) => [...t.values()].filter((p) => p.paylasan === hesapId).map((paylasim) => ({ okulId, paylasim })));
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

// KEYS: hesap→okul, üye tablosu, okul kaydı, davet. ARGV: okulId, hesapId, üye JSON, okul JSON.
const OLUSTUR = `if redis.call('EXISTS', KEYS[1]) == 1 then return 0 end
if redis.call('SET', KEYS[4], ARGV[1], 'NX') == false then return -1 end
redis.call('SET', KEYS[3], ARGV[4])
redis.call('SET', KEYS[1], ARGV[1])
redis.call('HSET', KEYS[2], ARGV[2], ARGV[3])
return 1`;
// Okul kaydı yoksa ya da kapanıyorsa (KEYS[n] okul kaydı) -2.
const acikDegil = (n: number) => `local okulKaydi = redis.call('GET', KEYS[${n}])
if not okulKaydi or string.find(okulKaydi, '"kapaniyor":true', 1, true) then return -2 end`;
// KEYS: hesap→okul, üye tablosu, okul kaydı. ARGV: okulId, hesapId, üye JSON, en çok üye.
const KATIL = `${acikDegil(3)}
if redis.call('EXISTS', KEYS[1]) == 1 then return 0 end
if redis.call('HLEN', KEYS[2]) >= tonumber(ARGV[4]) then return -1 end
redis.call('SET', KEYS[1], ARGV[1])
redis.call('HSET', KEYS[2], ARGV[2], ARGV[3])
return 1`;
// KEYS: hesap→okul, üye tablosu. ARGV: okulId, hesapId.
const CIKAR = `if redis.call('GET', KEYS[1]) ~= ARGV[1] then return 0 end
redis.call('DEL', KEYS[1])
redis.call('HDEL', KEYS[2], ARGV[2])
return 1`;
// KEYS: yeni davet, eski davet, okul kaydı. ARGV: okulId, yeni okul JSON, beklenen eski kod. Okul kaydındaki kod
// beklenenden farklıysa (eşzamanlı yenileme) -1: hiçbir şey yazılmaz, öksüz kod kalmaz. Yeni kod doluysa 0.
const DAVET_YENILE = `local v = redis.call('GET', KEYS[3])
if not v or not string.find(v, '"davetKodu":"' .. ARGV[3] .. '"', 1, true) then return -1 end
if redis.call('SET', KEYS[1], ARGV[1], 'NX') == false then return 0 end
redis.call('DEL', KEYS[2])
redis.call('SET', KEYS[3], ARGV[2])
return 1`;
// KEYS: özetler, kaynak→id, yeni tam kopya, eski tam kopya (yoksa yeninin aynısı), okul kaydı. ARGV: id, kaynak, özet
// JSON, tam JSON, en çok paylaşım, okunan eski id ('' yoksa). Eski id bu arada değiştiyse -1 (yeniden denenir).
const PAYLAS = `${acikDegil(5)}
local su = redis.call('HGET', KEYS[2], ARGV[2]) or ''
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
// Rol ve yönetici alanları düz metin olarak değiştirilir (JSON ayrıştırılmaz); kimlikler yalnız harf, rakam ve tire.
const degistir = `local function degistir(s, eski, yeni)
  local i = string.find(s, eski, 1, true)
  if not i then return nil end
  return string.sub(s, 1, i - 1) .. yeni .. string.sub(s, i + #eski)
end`;
// KEYS: üye tablosu, eski yöneticinin okulu, yeni yöneticinin okulu, okul kaydı. ARGV: okulId, eskiId, yeniId.
const DEVRET = `${degistir}
if redis.call('GET', KEYS[2]) ~= ARGV[1] or redis.call('GET', KEYS[3]) ~= ARGV[1] then return 0 end
local okul = redis.call('GET', KEYS[4])
local e = redis.call('HGET', KEYS[1], ARGV[2])
local y = redis.call('HGET', KEYS[1], ARGV[3])
if not okul or not e or not y then return 0 end
local e2 = degistir(e, '"rol":"yonetici"', '"rol":"ogretmen"')
local y2 = degistir(y, '"rol":"ogretmen"', '"rol":"yonetici"')
if not e2 or not y2 then return 0 end
redis.call('HSET', KEYS[1], ARGV[2], e2, ARGV[3], y2)
local o2 = degistir(okul, '"olusturan":"' .. ARGV[2] .. '"', '"olusturan":"' .. ARGV[3] .. '"')
if o2 then redis.call('SET', KEYS[4], o2) end
return 1`;
// KEYS: okul kaydı, davet. ARGV: beklenen davet kodu, beklenen yönetici.
const KAPATMA_BASLAT = `local okul = redis.call('GET', KEYS[1])
if not okul or not string.find(okul, '"davetKodu":"' .. ARGV[1] .. '"', 1, true) or not string.find(okul, '"olusturan":"' .. ARGV[2] .. '"', 1, true) then return 0 end
if not string.find(okul, '"kapaniyor":true', 1, true) then
  redis.call('SET', KEYS[1], string.sub(okul, 1, #okul - 1) .. ',"kapaniyor":true}')
end
redis.call('DEL', KEYS[2])
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
        await command(["EVAL", OLUSTUR, 4, uyeOkuluKey(yonetici.hesapId), uyelerKey(okul.id), okulKey(okul.id), davetKey(okul.davetKodu), okul.id, yonetici.hesapId, JSON.stringify(yonetici), JSON.stringify(okul)])
      );
      if (r === -1) throw new Error("Davet kodu çakıştı");
      return r === 1;
    },
    async get(okulId) {
      const ham = (await command(["GET", okulKey(okulId)])) as string | null;
      return ham ? (JSON.parse(ham) as Okul) : null;
    },
    async okullar(okulIdler) {
      if (okulIdler.length === 0) return [];
      const ham = ((await command(["MGET", ...okulIdler.map(okulKey)])) as (string | null)[] | null) ?? [];
      return okulIdler.map((_, i) => (ham[i] ? (JSON.parse(ham[i]!) as Okul) : null));
    },
    async okulOf(hesapId) {
      return ((await command(["GET", uyeOkuluKey(hesapId)])) as string | null) ?? null;
    },
    async davettenOkul(kod) {
      return ((await command(["GET", davetKey(kod)])) as string | null) ?? null;
    },
    async katil(okulId, uye) {
      const r = Number(await command(["EVAL", KATIL, 3, uyeOkuluKey(uye.hesapId), uyelerKey(okulId), okulKey(okulId), okulId, uye.hesapId, JSON.stringify(uye), OKUL.enCokUye]));
      return r === 1 ? "ok" : r === 0 ? "zaten-uye" : r === -2 ? "yok" : "dolu";
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
      const r = Number(await command(["EVAL", DAVET_YENILE, 3, davetKey(yeniKod), davetKey(okul.davetKodu), okulKey(okul.id), okul.id, JSON.stringify(guncel), okul.davetKodu]));
      return r === 1 ? "ok" : r === 0 ? "cakisma" : "degisti";
    },
    async paylas(okulId, p) {
      for (let deneme = 0; deneme < 3; deneme++) {
        const eski = ((await command(["HGET", kaynakKey(okulId), p.kaynak])) as string | null) ?? "";
        const r = Number(
          await command([
            "EVAL",
            PAYLAS,
            5,
            ozetKey(okulId),
            kaynakKey(okulId),
            tamKey(p.id),
            tamKey(eski || p.id),
            okulKey(okulId),
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
        if (r === -2) return "yok";
      }
      throw new Error("Paylaşım eşzamanlı güncellendi");
    },
    async paylasimlar(okulId) {
      const vals = ((await command(["HVALS", ozetKey(okulId)])) as string[] | null) ?? [];
      return vals.map((v) => JSON.parse(v) as PaylasimOzeti);
    },
    async okulSayisi() {
      return (await anahtarlariTara(command, okulKey("*"))).length;
    },
    async okulIdleri() {
      return (await anahtarlariTara(command, okulKey("*"))).map((k) => k.slice(okulKey("").length));
    },
    async yoneticiDevret(okulId, eskiId, yeniId) {
      return Number(await command(["EVAL", DEVRET, 4, uyelerKey(okulId), uyeOkuluKey(eskiId), uyeOkuluKey(yeniId), okulKey(okulId), okulId, eskiId, yeniId])) === 1;
    },
    async kapatmaBaslat(okul) {
      return Number(await command(["EVAL", KAPATMA_BASLAT, 2, okulKey(okul.id), davetKey(okul.davetKodu), okul.davetKodu, okul.olusturan])) === 1;
    },
    async kapatmaBitir(okulId) {
      await command(["DEL", okulKey(okulId), uyelerKey(okulId), ozetKey(okulId), kaynakKey(okulId)]);
    },
    async hesabinPaylasimlari(hesapId) {
      const out: { okulId: string; paylasim: OkulPaylasimi }[] = [];
      for (const anahtar of await anahtarlariTara(command, ozetKey("*"))) {
        const okulId = anahtar.slice(ozetKey("").length);
        const ozetler = (((await command(["HVALS", anahtar])) as string[] | null) ?? []).map((v) => JSON.parse(v) as PaylasimOzeti);
        for (const o of ozetler.filter((x) => x.paylasan === hesapId)) {
          const ham = (await command(["GET", tamKey(o.id)])) as string | null;
          if (ham) out.push({ okulId, paylasim: JSON.parse(ham) as OkulPaylasimi });
        }
      }
      return out;
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
    const command = depoKomutu("okullar");
    store = command ? createRedisOkulStore(command) : createMemoryOkulStore();
  }
  return store;
}
