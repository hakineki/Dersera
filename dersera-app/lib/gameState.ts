export const STORAGE_KEYS = {
  NICKNAME: "dersera:nickname",
  START_TIME: "dersera:startTime",
  PROGRESS: "dersera:progress",
  END_TIME: "dersera:endTime",
  CUSTOM_STOPS: "dersera:custom-stops",
  PENALTY: "dersera:penalty",
  LEADERBOARD: "dersera:leaderboard",
} as const;

export interface StopProgress {
  completedAt: number;
  hintsUsed: number;
}

export type GameProgress = Record<string, StopProgress>;

export interface CustomStop {
  id: string;
  order: number;
  name: string;
  emoji: string;
  subject: string;
  dersKey: string;
  nextStopId: string | null;
  nextClue: string;
}

export interface LeaderboardEntry {
  nickname: string;
  netSeconds: number;
  penaltySeconds: number;
  hintsUsed: number;
  completedAt: number;
  stopDetails?: Record<string, { hintsUsed: number; completedAt: number }>;
}

function safeGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSet(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* ignore */
  }
}

export function loadNickname(): string | null {
  return safeGet(STORAGE_KEYS.NICKNAME);
}

export function saveNickname(nickname: string): void {
  safeSet(STORAGE_KEYS.NICKNAME, nickname);
}

export function loadStartTime(): number | null {
  const v = safeGet(STORAGE_KEYS.START_TIME);
  return v ? Number(v) : null;
}

export function saveStartTime(ts: number): void {
  safeSet(STORAGE_KEYS.START_TIME, String(ts));
}

export function loadProgress(): GameProgress {
  try {
    const raw = safeGet(STORAGE_KEYS.PROGRESS);
    return raw ? (JSON.parse(raw) as GameProgress) : {};
  } catch {
    return {};
  }
}

export function markStopComplete(stopId: string, hintsUsed: number): void {
  const progress = loadProgress();
  progress[stopId] = { completedAt: Date.now(), hintsUsed };
  safeSet(STORAGE_KEYS.PROGRESS, JSON.stringify(progress));
}

export function loadEndTime(): number | null {
  const v = safeGet(STORAGE_KEYS.END_TIME);
  return v ? Number(v) : null;
}

export function saveEndTime(ts: number): void {
  safeSet(STORAGE_KEYS.END_TIME, String(ts));
}

export function loadPenaltySeconds(): number {
  const v = safeGet(STORAGE_KEYS.PENALTY);
  return v ? Number(v) : 0;
}

export function addPenalty(seconds: number): void {
  const current = loadPenaltySeconds();
  safeSet(STORAGE_KEYS.PENALTY, String(current + seconds));
}

export function loadLeaderboard(): LeaderboardEntry[] {
  try {
    const raw = safeGet(STORAGE_KEYS.LEADERBOARD);
    return raw ? (JSON.parse(raw) as LeaderboardEntry[]) : [];
  } catch {
    return [];
  }
}

export function nicknameKey(nickname: string): string {
  return nickname.trim().toLocaleLowerCase("tr-TR");
}

export function sortLeaderboard(board: LeaderboardEntry[]): LeaderboardEntry[] {
  return [...board].sort(
    (a, b) => (a.netSeconds + a.penaltySeconds) - (b.netSeconds + b.penaltySeconds)
  );
}

// Aynı takma adın önceki girişi silinir: en iyi skor değil, en son skor geçerli.
export function mergeLeaderboardEntry(
  board: LeaderboardEntry[],
  entry: LeaderboardEntry
): LeaderboardEntry[] {
  const key = nicknameKey(entry.nickname);
  return sortLeaderboard([...board.filter((e) => nicknameKey(e.nickname) !== key), entry]);
}

export function addLeaderboardEntry(entry: LeaderboardEntry): void {
  safeSet(STORAGE_KEYS.LEADERBOARD, JSON.stringify(mergeLeaderboardEntry(loadLeaderboard(), entry)));
}

export function buildResultCode(nickname: string, totalSeconds: number): string {
  const prefix = nickname.slice(0, 3).toUpperCase().replace(/[^A-Z0-9]/g, "X").padEnd(3, "X");
  return `${prefix}-${String(totalSeconds).padStart(4, "0")}`;
}

export function loadCustomStops(): CustomStop[] {
  try {
    const raw = safeGet(STORAGE_KEYS.CUSTOM_STOPS);
    return raw ? (JSON.parse(raw) as CustomStop[]) : [];
  } catch {
    return [];
  }
}

export function saveCustomStops(customStops: CustomStop[]): void {
  safeSet(STORAGE_KEYS.CUSTOM_STOPS, JSON.stringify(customStops));
}

export function addCustomStop(stop: CustomStop): void {
  saveCustomStops([...loadCustomStops(), stop]);
}

/** Önceki tüm durakların tamamlanıp tamamlanmadığını kontrol eder */
export function isPreviousStopsComplete(
  currentOrder: number,
  progress: GameProgress,
  orderedStops: { id: string; order: number }[]
): boolean {
  return orderedStops
    .filter((s) => s.order < currentOrder)
    .every((s) => s.id in progress);
}

export function formatElapsed(seconds: number): string {
  const m = Math.floor(seconds / 60)
    .toString()
    .padStart(2, "0");
  const s = (seconds % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

export function clearGameState(): void {
  try {
    [
      STORAGE_KEYS.NICKNAME,
      STORAGE_KEYS.START_TIME,
      STORAGE_KEYS.PROGRESS,
      STORAGE_KEYS.END_TIME,
      STORAGE_KEYS.PENALTY,
    ].forEach((k) => localStorage.removeItem(k));
  } catch {
    /* ignore */
  }
}
