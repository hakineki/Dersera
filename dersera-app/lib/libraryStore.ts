import type { KutuphaneKaydi } from "@/lib/library";
import { redisFromEnv, type RedisCommand } from "@/lib/redis";

// Kütüphane kayıtları süresizdir; öğretmen silene kadar kalır. Sahip = kütüphane anahtarının özeti.
export interface LibraryStore {
  persistent: boolean;
  list(owner: string): Promise<KutuphaneKaydi[]>;
  get(owner: string, id: string): Promise<KutuphaneKaydi | null>;
  put(owner: string, kayit: KutuphaneKaydi): Promise<void>;
  // Yalnız kayıt hâlâ varsa yazar; silinmiş kaydı geri getirmez.
  replace(owner: string, kayit: KutuphaneKaydi): Promise<boolean>;
  // Düzenleme kaydı: yalnız kayıt hâlâ varsa ve sürümü beklenen sürümse yazar (eşzamanlı ya da eski sekmeden gelen
  // kayıt başkasının düzenlemesini ezmesin). Sürüm alanı olmayan eski kayıt 1 sayılır.
  replaceIfSurum(owner: string, kayit: KutuphaneKaydi, beklenen: number): Promise<"ok" | "yok" | "catisma">;
  remove(owner: string, id: string): Promise<boolean>;
  count(owner: string): Promise<number>;
  // Yalnız kayıt kimlikleri (tanımları okumadan; ör. okul panosu).
  idler(owner: string): Promise<string[]>;
}

const libKey = (owner: string) => `dersera:kutuphane:${owner}`;

export function createMemoryLibraryStore(): LibraryStore {
  const data = new Map<string, Map<string, KutuphaneKaydi>>();
  const of = (owner: string) => data.get(owner) ?? data.set(owner, new Map()).get(owner)!;
  return {
    persistent: false,
    async list(owner) {
      return [...of(owner).values()];
    },
    async get(owner, id) {
      return of(owner).get(id) ?? null;
    },
    async put(owner, kayit) {
      of(owner).set(kayit.id, kayit);
    },
    async replace(owner, kayit) {
      if (!of(owner).has(kayit.id)) return false;
      of(owner).set(kayit.id, kayit);
      return true;
    },
    async replaceIfSurum(owner, kayit, beklenen) {
      const mevcut = of(owner).get(kayit.id);
      if (!mevcut) return "yok";
      if ((mevcut.surum ?? 1) !== beklenen) return "catisma";
      of(owner).set(kayit.id, kayit);
      return "ok";
    },
    async remove(owner, id) {
      return of(owner).delete(id);
    },
    async count(owner) {
      return of(owner).size;
    },
    async idler(owner) {
      return [...of(owner).keys()];
    },
  };
}

export function createRedisLibraryStore(command: RedisCommand): LibraryStore {
  return {
    persistent: true,
    async list(owner) {
      const vals = ((await command(["HVALS", libKey(owner)])) as string[] | null) ?? [];
      return vals.map((v) => JSON.parse(v) as KutuphaneKaydi);
    },
    async get(owner, id) {
      const raw = (await command(["HGET", libKey(owner), id])) as string | null;
      return raw ? (JSON.parse(raw) as KutuphaneKaydi) : null;
    },
    async put(owner, kayit) {
      await command(["HSET", libKey(owner), kayit.id, JSON.stringify(kayit)]);
    },
    async replace(owner, kayit) {
      // HSET yalnız alan varsa: Upstash REST tek komut alır; EVAL ile kontrol ve yazma atomiktir.
      const res = await command([
        "EVAL",
        "if redis.call('HEXISTS', KEYS[1], ARGV[1]) == 1 then redis.call('HSET', KEYS[1], ARGV[1], ARGV[2]) return 1 end return 0",
        1,
        libKey(owner),
        kayit.id,
        JSON.stringify(kayit),
      ]);
      return Number(res) === 1;
    },
    async replaceIfSurum(owner, kayit, beklenen) {
      // Kayıt JSON'unda üst düzey "surum" alanı bir kez geçer (tanım içindeki metinlerde tırnaklar kaçırılmıştır).
      const res = await command([
        "EVAL",
        `local v = redis.call('HGET', KEYS[1], ARGV[1])
if not v then return 0 end
local s = string.match(v, '"surum":(%d+)') or '1'
if s ~= ARGV[2] then return -1 end
redis.call('HSET', KEYS[1], ARGV[1], ARGV[3])
return 1`,
        1,
        libKey(owner),
        kayit.id,
        String(beklenen),
        JSON.stringify(kayit),
      ]);
      const r = Number(res);
      return r === 1 ? "ok" : r === 0 ? "yok" : "catisma";
    },
    async remove(owner, id) {
      return Number(await command(["HDEL", libKey(owner), id])) === 1;
    },
    async count(owner) {
      return Number(await command(["HLEN", libKey(owner)]));
    },
    async idler(owner) {
      return ((await command(["HKEYS", libKey(owner)])) as string[] | null) ?? [];
    },
  };
}

let store: LibraryStore | null = null;

export function getLibraryStore(): LibraryStore {
  if (!store) {
    const command = redisFromEnv();
    store = command ? createRedisLibraryStore(command) : createMemoryLibraryStore();
  }
  return store;
}
