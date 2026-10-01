import { depoKomutu, type RedisCommand } from "@/lib/redis";

// Öğretmenin e-postası (kayıtta zorunlu) ve tek kullanımlık bağlantı belirteçleri. Anahtarlar:
//   hesap → e-posta kaydı; doğrulanmış adresin özeti → hesap (bir adres yalnız bir hesapta doğrulanır);
//   belirteç özeti → belirteç (süreli, alınınca silinir). Belirtecin ve adresin kendisi anahtarda durmaz, özeti durur.

export interface EpostaKaydi {
  adres: string;
  dogrulandi: boolean;
  zaman: number;
}

export type Belirtec = { tur: "dogrulama"; hesapId: string; adres: string } | { tur: "sifirlama"; hesapId: string; surum: number };

export interface EpostaStore {
  oku(hesapId: string): Promise<EpostaKaydi | null>;
  // Doğrulanmamış yeni adres yazar; önceki doğrulanmış adresin dizini (hâlâ bu hesaba aitse) kaldırılır.
  yaz(hesapId: string, kayit: EpostaKaydi, eskiAdresOzeti: string | null): Promise<void>;
  // Kayıt hâlâ bu adresteyse doğrular ve dizine yazar. "alinmis": adres başka hesapta doğrulanmış; "degisti": kayıt değişti.
  dogrula(hesapId: string, adres: string, adresOzeti: string, zaman: number): Promise<"ok" | "alinmis" | "degisti">;
  // Kaydı ve (bu hesaba aitse) dizini siler.
  kaldir(hesapId: string, adresOzeti: string | null): Promise<void>;
  adrestenHesap(adresOzeti: string): Promise<string | null>;
  belirtecYaz(ozet: string, b: Belirtec, ttlMs: number): Promise<void>;
  // Belirteci atomik olarak alır ve siler (tek kullanım); yoksa ya da süresi geçtiyse null.
  belirtecAl(ozet: string): Promise<Belirtec | null>;
}

const kayitKey = (hesapId: string) => `dersera:eposta:hesap:${hesapId}`;
const dizinKey = (adresOzeti: string) => `dersera:eposta:adres:${adresOzeti}`;
const belirtecKey = (ozet: string) => `dersera:eposta:belirtec:${ozet}`;
// Dizin anahtarı yokken betiğe verilen yer tutucu (hiç yazılmaz, yalnız okunur).
const BOS = "dersera:eposta:yok";

export function createMemoryEpostaStore(now: () => number = Date.now): EpostaStore {
  const kayitlar = new Map<string, EpostaKaydi>();
  const dizin = new Map<string, string>();
  const belirtecler = new Map<string, { b: Belirtec; until: number }>();
  const dizindenCikar = (hesapId: string, ozet: string | null) => {
    if (ozet && dizin.get(ozet) === hesapId) dizin.delete(ozet);
  };
  return {
    async oku(hesapId) {
      return kayitlar.get(hesapId) ?? null;
    },
    async yaz(hesapId, kayit, eskiOzet) {
      dizindenCikar(hesapId, eskiOzet);
      kayitlar.set(hesapId, kayit);
    },
    async dogrula(hesapId, adres, ozet, zaman) {
      const k = kayitlar.get(hesapId);
      if (!k || k.adres !== adres) return "degisti";
      const sahip = dizin.get(ozet);
      if (sahip && sahip !== hesapId) return "alinmis";
      dizin.set(ozet, hesapId);
      kayitlar.set(hesapId, { adres, dogrulandi: true, zaman });
      return "ok";
    },
    async kaldir(hesapId, ozet) {
      dizindenCikar(hesapId, ozet);
      kayitlar.delete(hesapId);
    },
    async adrestenHesap(ozet) {
      return dizin.get(ozet) ?? null;
    },
    async belirtecYaz(ozet, b, ttlMs) {
      belirtecler.set(ozet, { b, until: now() + ttlMs });
    },
    async belirtecAl(ozet) {
      const v = belirtecler.get(ozet);
      belirtecler.delete(ozet);
      return v && v.until > now() ? v.b : null;
    },
  };
}

// KEYS: kayıt, eski dizin. ARGV: hesapId, yeni kayıt JSON.
const YAZ = `if redis.call('GET', KEYS[2]) == ARGV[1] then redis.call('DEL', KEYS[2]) end
redis.call('SET', KEYS[1], ARGV[2])
return 1`;
// KEYS: kayıt, dizin. ARGV: hesapId, beklenen adres (JSON dizesi olarak), doğrulanmış kayıt JSON. Kayıt JSON'u her
// zaman {adres, dogrulandi, zaman} sırasıyla yazılır; desen bu sıraya ("adres" ilk alan, ardından virgül) dayanır.
const DOGRULA = `local k = redis.call('GET', KEYS[1])
if not k or not string.find(k, '"adres":' .. ARGV[2] .. ',', 1, true) then return -1 end
local sahip = redis.call('GET', KEYS[2])
if sahip and sahip ~= ARGV[1] then return 0 end
redis.call('SET', KEYS[2], ARGV[1])
redis.call('SET', KEYS[1], ARGV[3])
return 1`;
// KEYS: kayıt, dizin. ARGV: hesapId.
const KALDIR = `if redis.call('GET', KEYS[2]) == ARGV[1] then redis.call('DEL', KEYS[2]) end
redis.call('DEL', KEYS[1])
return 1`;
// KEYS: belirteç.
const AL = `local v = redis.call('GET', KEYS[1])
if v then redis.call('DEL', KEYS[1]) end
return v`;

export function createRedisEpostaStore(command: RedisCommand): EpostaStore {
  return {
    async oku(hesapId) {
      const ham = (await command(["GET", kayitKey(hesapId)])) as string | null;
      return ham ? (JSON.parse(ham) as EpostaKaydi) : null;
    },
    async yaz(hesapId, kayit, eskiOzet) {
      await command(["EVAL", YAZ, 2, kayitKey(hesapId), eskiOzet ? dizinKey(eskiOzet) : BOS, hesapId, JSON.stringify(kayit)]);
    },
    async dogrula(hesapId, adres, ozet, zaman) {
      const kayit: EpostaKaydi = { adres, dogrulandi: true, zaman };
      const r = Number(await command(["EVAL", DOGRULA, 2, kayitKey(hesapId), dizinKey(ozet), hesapId, JSON.stringify(adres), JSON.stringify(kayit)]));
      return r === 1 ? "ok" : r === 0 ? "alinmis" : "degisti";
    },
    async kaldir(hesapId, ozet) {
      await command(["EVAL", KALDIR, 2, kayitKey(hesapId), ozet ? dizinKey(ozet) : BOS, hesapId]);
    },
    async adrestenHesap(ozet) {
      return ((await command(["GET", dizinKey(ozet)])) as string | null) ?? null;
    },
    async belirtecYaz(ozet, b, ttlMs) {
      await command(["SET", belirtecKey(ozet), JSON.stringify(b), "PX", ttlMs]);
    },
    async belirtecAl(ozet) {
      const ham = (await command(["EVAL", AL, 1, belirtecKey(ozet)])) as string | null;
      return ham ? (JSON.parse(ham) as Belirtec) : null;
    },
  };
}

let store: EpostaStore | null = null;
export function getEpostaStore(): EpostaStore {
  if (!store) {
    const command = depoKomutu("e-posta");
    store = command ? createRedisEpostaStore(command) : createMemoryEpostaStore();
  }
  return store;
}
