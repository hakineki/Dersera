import type { KutuphaneKaydi } from "@/lib/library";
import { redisFromEnv, type RedisCommand } from "@/lib/redis";

// Kütüphane kayıtları süresizdir; öğretmen silene kadar kalır. Sahip = kütüphane anahtarının özeti.
export interface LibraryStore {
  persistent: boolean;
  list(owner: string): Promise<KutuphaneKaydi[]>;
  get(owner: string, id: string): Promise<KutuphaneKaydi | null>;
  put(owner: string, kayit: KutuphaneKaydi): Promise<void>;
  remove(owner: string, id: string): Promise<boolean>;
  count(owner: string): Promise<number>;
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
    async remove(owner, id) {
      return of(owner).delete(id);
    },
    async count(owner) {
      return of(owner).size;
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
    async remove(owner, id) {
      return Number(await command(["HDEL", libKey(owner), id])) === 1;
    },
    async count(owner) {
      return Number(await command(["HLEN", libKey(owner)]));
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
