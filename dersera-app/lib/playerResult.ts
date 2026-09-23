import { loadPlayerToken, savePlayerToken, type GameProgress, type LeaderboardEntry } from "@/lib/gameState";
import { joinGameRequest } from "@/lib/gamesClient";
import { submitResult } from "@/lib/resultsClient";

// Oyuncu anahtarı yoksa (katılım çevrimdışı başarısız olduysa) önce katılır, sonra sonucu gönderir.
export async function sendPlayerResult(gameCode: string, entry: LeaderboardEntry): Promise<boolean> {
  let token = loadPlayerToken();
  if (!token) {
    const joined = await joinGameRequest(gameCode, entry.nickname);
    if (joined.status === "joined") {
      token = joined.playerToken;
      savePlayerToken(token);
    }
  }
  return token ? submitResult(gameCode, token, entry) : false;
}

const MAX_NET_SECONDS = 24 * 60 * 60;

export function buildLeaderboardEntry(
  nickname: string,
  startTime: number,
  endTime: number,
  penaltySeconds: number,
  progress: GameProgress
): LeaderboardEntry {
  const net = Math.floor((endTime - startTime) / 1000);
  return {
    nickname,
    // Sunucu 0–24 saat dışını reddeder; gece yarısını aşan ya da saati kaymış cihaz takılı kalmasın.
    netSeconds: Math.min(Math.max(net, 0), MAX_NET_SECONDS),
    penaltySeconds,
    hintsUsed: Object.values(progress).reduce((s, p) => s + p.hintsUsed, 0),
    completedAt: endTime,
    stopDetails: Object.fromEntries(
      Object.entries(progress).map(([id, p]) => [id, { hintsUsed: p.hintsUsed, completedAt: p.completedAt }])
    ),
  };
}
