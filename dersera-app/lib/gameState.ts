export const STORAGE_KEYS = {
  NICKNAME: "dersera:nickname",
  START_TIME: "dersera:startTime",
  PROGRESS: "dersera:progress",
  END_TIME: "dersera:endTime",
  CUSTOM_STOPS: "dersera:custom-stops",
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
    ].forEach((k) => localStorage.removeItem(k));
  } catch {
    /* ignore */
  }
}
