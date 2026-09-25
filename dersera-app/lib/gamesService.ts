import type { DersKonu } from "@/lib/composer/input";
import type { PublicGame, PublishRequest } from "@/lib/games";
import type { GamesStore, StoredGame } from "@/lib/gamesStore";

// I, O, Q, W, X çıkarıldı: tahtaya yazılırken 1/0 ile karışmasın, Türk klavyesinde sorun çıkarmasın.
const CODE_LETTERS = "ABCDEFGHJKLMNPRSTUVYZ";
const MAX_CODE_ATTEMPTS = 8;

function randomInt(max: number): number {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return buf[0] % max;
}

export function generateGameCode(rand: (max: number) => number = randomInt): string {
  const letters = Array.from({ length: 3 }, () => CODE_LETTERS[rand(CODE_LETTERS.length)]).join("");
  const digits = String(rand(1000)).padStart(3, "0");
  return `${letters}-${digits}`;
}

function toBase64Url(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64url");
}

export function createAdminToken(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return toBase64Url(bytes);
}

export async function hashToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return toBase64Url(new Uint8Array(digest));
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// icerik false: Composer oyununun tanımı gönderilmez (kod bilen ama katılmamış biri ya da bitmiş oyun).
export function toPublicGame(game: StoredGame, icerik = true): PublicGame {
  const { code, stops, aylar, createdAt, expiresAt, endedAt, definition } = game;
  return { code, stops, aylar, createdAt, expiresAt, endedAt, ...(definition ? (icerik ? { definition } : { icerikKilitli: true as const }) : {}) };
}

// sahip sunucuda oturumdan, dersler doğrulanmış yayın isteğinden belirlenir; istemci gövdesinden doğrudan okunmaz.
export async function publishGame(
  store: GamesStore,
  req: PublishRequest & { sahip?: string | null; dersler?: DersKonu[] | null },
  now = Date.now(),
  nextCode: () => string = generateGameCode
): Promise<{ game: PublicGame; adminToken: string } | null> {
  const adminToken = createAdminToken();
  const adminTokenHash = await hashToken(adminToken);
  for (let attempt = 0; attempt < MAX_CODE_ATTEMPTS; attempt++) {
    const game: StoredGame = {
      code: nextCode(),
      stops: req.stops,
      aylar: req.aylar,
      createdAt: now,
      expiresAt: now + req.durationMinutes * 60 * 1000,
      endedAt: null,
      adminTokenHash,
      ...(req.definition ? { definition: req.definition } : {}),
      ...(req.sahip ? { sahip: req.sahip } : {}),
      ...(req.definition && req.dersler ? { dersler: req.dersler } : {}),
    };
    if (await store.create(game, now)) return { game: toPublicGame(game), adminToken };
  }
  return null;
}

export type JoinResult = { status: "joined"; playerToken: string } | { status: "taken" | "not-found" };

export async function joinGame(
  store: GamesStore,
  code: string,
  nickname: string,
  now = Date.now()
): Promise<JoinResult> {
  const game = await store.get(code);
  if (!game) return { status: "not-found" };
  // Bitmiş oyuna da katılım kabul edilir: çevrimdışı bitiren öğrenci sonucunu sonradan gönderebilsin.
  // Yeni oyuncunun soru açması ise istemcide kod ekranında engellenir.
  const playerToken = createAdminToken();
  const added = await store.addPlayer(code, nickname, await hashToken(playerToken), now, game.expiresAt);
  return added ? { status: "joined", playerToken } : { status: "taken" };
}

// Sonuç yalnızca o takma adla katılan cihazın anahtarıyla kabul edilir: başkasının sonucu ezilemez.
export async function verifyPlayer(
  store: GamesStore,
  code: string,
  nickname: string,
  playerToken: string
): Promise<boolean> {
  const stored = await store.playerTokenHash(code, nickname);
  return stored !== null && constantTimeEqual(await hashToken(playerToken), stored);
}

export type EndResult = "ended" | "not-found" | "forbidden";

export async function endGame(
  store: GamesStore,
  code: string,
  adminToken: string,
  now = Date.now()
): Promise<EndResult> {
  const game = await store.get(code);
  if (!game) return "not-found";
  if (!constantTimeEqual(await hashToken(adminToken), game.adminTokenHash)) return "forbidden";
  if (game.endedAt === null) await store.put({ ...game, endedAt: now }, now);
  return "ended";
}
