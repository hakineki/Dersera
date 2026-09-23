import type { LeaderboardEntry } from "@/lib/gameState";

export const NICKNAME_PATTERN = /^[a-zA-ZÇçĞğİıÖöŞşÜü0-9_-]{2,20}$/;
const STOP_ID_PATTERN = /^[a-z0-9-]{1,40}$/;
const MAX_SECONDS = 24 * 60 * 60;
const MAX_HINTS = 1000;
const MAX_STOPS = 50;

function isCount(value: unknown, max: number): value is number {
  return Number.isInteger(value) && (value as number) >= 0 && (value as number) <= max;
}

function isTimestamp(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// Bilinmeyen alanlar kopyalanmaz; yalnızca şemadaki alanlar yeni nesneye alınır.
export function parseLeaderboardEntry(body: unknown): LeaderboardEntry | null {
  if (!isPlainObject(body)) return null;

  const nickname = typeof body.nickname === "string" ? body.nickname.trim() : "";
  if (!NICKNAME_PATTERN.test(nickname)) return null;

  const { netSeconds, penaltySeconds, hintsUsed, completedAt, stopDetails } = body;
  if (
    !isCount(netSeconds, MAX_SECONDS) ||
    !isCount(penaltySeconds, MAX_SECONDS) ||
    !isCount(hintsUsed, MAX_HINTS) ||
    !isTimestamp(completedAt)
  ) {
    return null;
  }

  const entry: LeaderboardEntry = { nickname, netSeconds, penaltySeconds, hintsUsed, completedAt };

  if (stopDetails !== undefined) {
    if (!isPlainObject(stopDetails)) return null;
    const details = Object.entries(stopDetails);
    if (details.length > MAX_STOPS) return null;

    const parsed: NonNullable<LeaderboardEntry["stopDetails"]> = {};
    for (const [stopId, detail] of details) {
      if (!STOP_ID_PATTERN.test(stopId) || !isPlainObject(detail)) return null;
      if (!isCount(detail.hintsUsed, MAX_HINTS) || !isTimestamp(detail.completedAt)) return null;
      parsed[stopId] = { hintsUsed: detail.hintsUsed, completedAt: detail.completedAt };
    }
    entry.stopDetails = parsed;
  }

  return entry;
}
