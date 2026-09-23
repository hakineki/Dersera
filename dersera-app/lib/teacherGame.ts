import { isPublicGame, type PublicGame } from "@/lib/games";

export const TEACHER_GAME_KEY = "dersera:teacher-game";

export interface TeacherGame {
  game: PublicGame;
  adminToken: string;
}

export function loadTeacherGame(): TeacherGame | null {
  try {
    const raw = localStorage.getItem(TEACHER_GAME_KEY);
    const parsed = raw ? (JSON.parse(raw) as Partial<TeacherGame>) : null;
    if (!parsed || typeof parsed.adminToken !== "string" || !isPublicGame(parsed.game)) return null;
    return { game: parsed.game, adminToken: parsed.adminToken };
  } catch {
    return null;
  }
}

export function saveTeacherGame(tg: TeacherGame): void {
  try {
    localStorage.setItem(TEACHER_GAME_KEY, JSON.stringify(tg));
  } catch {
    /* ignore */
  }
}
