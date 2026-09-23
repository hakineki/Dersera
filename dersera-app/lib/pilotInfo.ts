export interface PilotInfo {
  schoolName: string;
  className: string;
  teacherName: string;
  pilotDate: string;
}

export const PILOT_STORAGE_KEY = "dersera:pilot-info";

const DEFAULT_PILOT: PilotInfo = {
  schoolName: "",
  className: "",
  teacherName: "",
  pilotDate: "",
};

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

export function loadPilotInfo(): PilotInfo {
  try {
    const raw = safeGet(PILOT_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as PilotInfo) : { ...DEFAULT_PILOT };
  } catch {
    return { ...DEFAULT_PILOT };
  }
}

export function savePilotInfo(info: PilotInfo): void {
  safeSet(PILOT_STORAGE_KEY, JSON.stringify(info));
}
