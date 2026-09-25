import type { HesapOzeti } from "@/lib/authClient";
import { isPublicGame, type PublicGame } from "@/lib/games";

export const TEACHER_GAME_KEY = "dersera:teacher-game";

export interface TeacherGame {
  game: PublicGame;
  adminToken: string;
}

// Kayıt yayınlayan hesaba bağlıdır: ortak bilgisayarda sonraki öğretmen öncekinin oyununu, sonuçlarını ve yönetim
// belirtecini görmez. Kullanıcı adı değişebilir ve boşalan ada başkası kaydolabilir; hesabı değişmeyen oluşturma anı
// tanır (istemci hesap kimliğini görmez).
const sahibi = (h: HesapOzeti) => String(h.olusturma);

export const ayniHesap = (a: HesapOzeti | null, b: HesapOzeti | null) => !!a && !!b && sahibi(a) === sahibi(b);

type KayitliOyun = TeacherGame & { sahip: string };

export function loadTeacherGame(hesap: HesapOzeti): TeacherGame | null {
  try {
    const raw = localStorage.getItem(TEACHER_GAME_KEY);
    const parsed = raw ? (JSON.parse(raw) as Partial<KayitliOyun>) : null;
    if (!parsed) return null;
    // Hesaba bağlanmadan önceki sahipsiz kayıt kime ait olduğu bilinemediği için kimseye verilmez, silinir.
    if (typeof parsed.sahip !== "string") {
      localStorage.removeItem(TEACHER_GAME_KEY);
      return null;
    }
    // Başka hesabın kaydı yok sayılır ama silinmez: sahibi bu tarayıcıda yeniden girince oyununa döner.
    if (parsed.sahip !== sahibi(hesap) || typeof parsed.adminToken !== "string" || !isPublicGame(parsed.game)) return null;
    return { game: parsed.game, adminToken: parsed.adminToken };
  } catch {
    return null;
  }
}

export function saveTeacherGame(tg: TeacherGame, hesap: HesapOzeti): void {
  try {
    const kayit: KayitliOyun = { game: tg.game, adminToken: tg.adminToken, sahip: sahibi(hesap) };
    localStorage.setItem(TEACHER_GAME_KEY, JSON.stringify(kayit));
  } catch {
    /* ignore */
  }
}

// Çıkışta bu tarayıcıdaki oyun kaydı, kimin olursa olsun, silinir.
export function clearTeacherGame(): void {
  try {
    localStorage.removeItem(TEACHER_GAME_KEY);
  } catch {
    /* ignore */
  }
}
