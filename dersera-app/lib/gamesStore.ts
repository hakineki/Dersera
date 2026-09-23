import { nicknameKey } from "@/lib/gameState";
import type { PublicGame } from "@/lib/games";
import { redisFromEnv, type RedisCommand } from "@/lib/redis";

export interface StoredGame extends PublicGame {
  adminTokenHash: string;
}

// Oyun kaydı süre dolduktan sonra bir gün daha tutulur: geç gelen sonuçlar ve öğretmen raporu için.
export const GAME_RETENTION_MS = 24 * 60 * 60 * 1000;

export interface GamesStore {
  persistent: boolean;
  create(game: StoredGame, now: number): Promise<boolean>;
  get(code: string): Promise<StoredGame | null>;
  put(game: StoredGame, now: number): Promise<void>;
  addPlayer(code: string, nickname: string, now: number, expiresAt: number): Promise<void>;
  playerCount(code: string): Promise<number>;
}

const gameKey = (code: string) => `dersera:game:${code}`;
const playersKey = (code: string) => `dersera:game:${code}:players`;

function ttlMs(expiresAt: number, now: number): number {
  return Math.max(1000, expiresAt + GAME_RETENTION_MS - now);
}

export function createMemoryGamesStore(): GamesStore {
  const games = new Map<string, { game: StoredGame; until: number }>();
  const players = new Map<string, Set<string>>();
  const live = (code: string) => {
    const hit = games.get(code);
    if (hit && hit.until <= Date.now()) {
      games.delete(code);
      players.delete(code);
      return undefined;
    }
    return hit;
  };
  return {
    persistent: false,
    async create(game, now) {
      if (live(game.code)) return false;
      games.set(game.code, { game, until: now + ttlMs(game.expiresAt, now) });
      return true;
    },
    async get(code) {
      return live(code)?.game ?? null;
    },
    async put(game, now) {
      games.set(game.code, { game, until: now + ttlMs(game.expiresAt, now) });
    },
    async addPlayer(code, nickname) {
      const set = players.get(code) ?? new Set<string>();
      set.add(nicknameKey(nickname));
      players.set(code, set);
    },
    async playerCount(code) {
      return players.get(code)?.size ?? 0;
    },
  };
}

export function createRedisGamesStore(command: RedisCommand): GamesStore {
  return {
    persistent: true,
    async create(game, now) {
      const res = await command(["SET", gameKey(game.code), JSON.stringify(game), "NX", "PX", ttlMs(game.expiresAt, now)]);
      return res === "OK";
    },
    async get(code) {
      const raw = (await command(["GET", gameKey(code)])) as string | null;
      return raw ? (JSON.parse(raw) as StoredGame) : null;
    },
    async put(game, now) {
      await command(["SET", gameKey(game.code), JSON.stringify(game), "PX", ttlMs(game.expiresAt, now)]);
    },
    async addPlayer(code, nickname, now, expiresAt) {
      await command(["SADD", playersKey(code), nicknameKey(nickname)]);
      await command(["PEXPIRE", playersKey(code), ttlMs(expiresAt, now)]);
    },
    async playerCount(code) {
      return Number(await command(["SCARD", playersKey(code)]));
    },
  };
}

let store: GamesStore | null = null;

export function getGamesStore(): GamesStore {
  if (!store) {
    const command = redisFromEnv();
    store = command ? createRedisGamesStore(command) : createMemoryGamesStore();
  }
  return store;
}
