export const STORAGE_KEYS = {
  NICKNAME: "dersera:nickname",
  START_TIME: "dersera:startTime",
  PROGRESS: "dersera:progress",
  END_TIME: "dersera:endTime",
} as const;

export interface StopProgress {
  completedAt: number;
  hintsUsed: number;
}

export type GameProgress = Record<string, StopProgress>;

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

export function formatElapsed(seconds: number): string {
  const m = Math.floor(seconds / 60)
    .toString()
    .padStart(2, "0");
  const s = (seconds % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

export function clearGameState(): void {
  try {
    Object.values(STORAGE_KEYS).forEach((k) => localStorage.removeItem(k));
  } catch {
    /* ignore */
  }
}
