const DEFAULT_CREDS = { username: "ogretmen", password: "dersera2025" };

export const TEACHER_STORAGE_KEYS = {
  CREDS: "dersera:teacher-creds",
  SESSION: "dersera:teacher-session",
} as const;

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

function safeRemove(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

export function loadTeacherCreds(): { username: string; password: string } {
  try {
    const raw = safeGet(TEACHER_STORAGE_KEYS.CREDS);
    return raw ? (JSON.parse(raw) as { username: string; password: string }) : DEFAULT_CREDS;
  } catch {
    return DEFAULT_CREDS;
  }
}

export function saveTeacherCreds(username: string, password: string): void {
  safeSet(
    TEACHER_STORAGE_KEYS.CREDS,
    JSON.stringify({ username: username.trim(), password })
  );
}

export function verifyTeacher(username: string, password: string): boolean {
  const creds = loadTeacherCreds();
  return username.trim() === creds.username && password === creds.password;
}

export function loadTeacherSession(): boolean {
  return safeGet(TEACHER_STORAGE_KEYS.SESSION) === "1";
}

export function setTeacherSession(active: boolean): void {
  if (active) {
    safeSet(TEACHER_STORAGE_KEYS.SESSION, "1");
  } else {
    safeRemove(TEACHER_STORAGE_KEYS.SESSION);
  }
}
