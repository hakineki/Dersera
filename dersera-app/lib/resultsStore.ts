import {
  mergeLeaderboardEntry,
  nicknameKey,
  sortLeaderboard,
  type LeaderboardEntry,
} from "@/lib/gameState";
import { depoKomutu, type RedisCommand } from "@/lib/redis";

export const RESULTS_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

export const resultsKey = (gameCode: string) => `dersera:results:${gameCode}`;
const yetkiKey = (gameCode: string) => `dersera:results:${gameCode}:yetki`;

export interface ResultsStore {
  persistent: boolean;
  save(gameCode: string, entry: LeaderboardEntry): Promise<void>;
  list(gameCode: string): Promise<LeaderboardEntry[]>;
  // Bu takma adın sonucu kayıtlı mı (tüm tabloyu okumadan).
  has(gameCode: string, nickname: string): Promise<boolean>;
  // Sonuç listesini okuma yetkisi: yayındaki yönetici anahtarının özeti. Oyun kaydı süre +1 gün tutulur, sonuçlar
  // 7 gün; öğretmen sonuçları bu süre boyunca görebilsin diye özet sonuçlarla aynı süre saklanır.
  yetkiYaz(gameCode: string, adminTokenHash: string): Promise<void>;
  yetki(gameCode: string): Promise<string | null>;
}

export function createMemoryStore(): ResultsStore {
  const byGame = new Map<string, LeaderboardEntry[]>();
  const yetkiler = new Map<string, string>();
  return {
    persistent: false,
    async save(gameCode, entry) {
      byGame.set(gameCode, mergeLeaderboardEntry(byGame.get(gameCode) ?? [], entry));
    },
    async list(gameCode) {
      return [...(byGame.get(gameCode) ?? [])];
    },
    async has(gameCode, nickname) {
      const anahtar = nicknameKey(nickname);
      return (byGame.get(gameCode) ?? []).some((e) => nicknameKey(e.nickname) === anahtar);
    },
    async yetkiYaz(gameCode, adminTokenHash) {
      yetkiler.set(gameCode, adminTokenHash);
    },
    async yetki(gameCode) {
      return yetkiler.get(gameCode) ?? null;
    },
  };
}

export function createRedisStore(command: RedisCommand): ResultsStore {
  return {
    persistent: true,
    async save(gameCode, entry) {
      const key = resultsKey(gameCode);
      await command(["HSET", key, nicknameKey(entry.nickname), JSON.stringify(entry)]);
      await command(["PEXPIRE", key, RESULTS_RETENTION_MS]);
    },
    async list(gameCode) {
      const raw = (await command(["HVALS", resultsKey(gameCode)])) as string[];
      return sortLeaderboard(raw.map((r) => JSON.parse(r) as LeaderboardEntry));
    },
    async has(gameCode, nickname) {
      return Number(await command(["HEXISTS", resultsKey(gameCode), nicknameKey(nickname)])) === 1;
    },
    async yetkiYaz(gameCode, adminTokenHash) {
      await command(["SET", yetkiKey(gameCode), adminTokenHash, "PX", RESULTS_RETENTION_MS]);
    },
    async yetki(gameCode) {
      return ((await command(["GET", yetkiKey(gameCode)])) as string | null) ?? null;
    },
  };
}

let store: ResultsStore | null = null;

export function getResultsStore(): ResultsStore {
  if (!store) {
    const command = depoKomutu("sonuçlar");
    store = command ? createRedisStore(command) : createMemoryStore();
  }
  return store;
}
