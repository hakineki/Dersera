import type { LeaderboardEntry } from "@/lib/gameState";

export interface ResultsResponse {
  results: LeaderboardEntry[];
  persistent: boolean;
}

export async function submitResult(gameCode: string, result: LeaderboardEntry): Promise<boolean> {
  try {
    const res = await fetch("/api/results", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ gameCode, result }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function fetchResults(gameCode: string): Promise<ResultsResponse | null> {
  try {
    const res = await fetch(`/api/results?code=${encodeURIComponent(gameCode)}`, { cache: "no-store" });
    if (!res.ok) return null;
    return (await res.json()) as ResultsResponse;
  } catch {
    return null;
  }
}
