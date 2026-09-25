import { nicknameKey } from "@/lib/gameState";
import type { DersKonu } from "@/lib/composer/input";
import type { PublicGame } from "@/lib/games";
import { redisFromEnv, type RedisCommand } from "@/lib/redis";

export interface StoredGame extends PublicGame {
  adminTokenHash: string;
  // Oturumla yayınlayan öğretmen ("hesap:<id>"): öğrenme takibi sonuçları onun sayaçlarına yazar. Herkese açık yanıta
  // girmez (toPublicGame yalnız belirli alanları verir); oturumsuz yayında yoktur.
  sahip?: string;
  // Composer oyununun ders ve konuları: öğrenme takibi çıktının ünitesini buradan bulur (aynı kod başka ünitede de olur).
  dersler?: DersKonu[];
}

// Oyun kaydı süre dolduktan sonra bir gün daha tutulur: geç gelen sonuçlar ve öğretmen raporu için.
export const GAME_RETENTION_MS = 24 * 60 * 60 * 1000;

export interface GamesStore {
  persistent: boolean;
  create(game: StoredGame, now: number): Promise<boolean>;
  get(code: string): Promise<StoredGame | null>;
  put(game: StoredGame, now: number): Promise<void>;
  // Takma ad bu oyunda yeniyse kaydeder ve true döner; alınmışsa false.
  addPlayer(code: string, nickname: string, tokenHash: string, now: number, expiresAt: number): Promise<boolean>;
  playerTokenHash(code: string, nickname: string): Promise<string | null>;
  playerCount(code: string): Promise<number>;
}

const gameKey = (code: string) => `dersera:game:${code}`;
const playersKey = (code: string) => `dersera:game:${code}:players`;

function ttlMs(expiresAt: number, now: number): number {
  return Math.max(1000, expiresAt + GAME_RETENTION_MS - now);
}

export function createMemoryGamesStore(): GamesStore {
  const games = new Map<string, { game: StoredGame; until: number }>();
  const players = new Map<string, Map<string, string>>();
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
    async addPlayer(code, nickname, tokenHash) {
      const map = players.get(code) ?? new Map<string, string>();
      const key = nicknameKey(nickname);
      if (map.has(key)) return false;
      map.set(key, tokenHash);
      players.set(code, map);
      return true;
    },
    async playerTokenHash(code, nickname) {
      return players.get(code)?.get(nicknameKey(nickname)) ?? null;
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
    async addPlayer(code, nickname, tokenHash, now, expiresAt) {
      const added = await command(["HSETNX", playersKey(code), nicknameKey(nickname), tokenHash]);
      await command(["PEXPIRE", playersKey(code), ttlMs(expiresAt, now)]);
      return Number(added) === 1;
    },
    async playerTokenHash(code, nickname) {
      return ((await command(["HGET", playersKey(code), nicknameKey(nickname)])) as string | null) ?? null;
    },
    async playerCount(code) {
      return Number(await command(["HLEN", playersKey(code)]));
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
