import type { PublicGame, PublishRequest } from "@/lib/games";

export type FetchGameResult =
  | { status: "ok"; game: PublicGame; active: boolean; players: number; serverNow: number }
  | { status: "not-found" }
  | { status: "error" };

export async function fetchGame(code: string, timeoutMs = 5000): Promise<FetchGameResult> {
  try {
    const res = await fetch(`/api/games/${encodeURIComponent(code)}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (res.status === 404) return { status: "not-found" };
    if (!res.ok) return { status: "error" };
    return { status: "ok", ...(await res.json()) };
  } catch {
    return { status: "error" };
  }
}

export interface PublishResponse {
  game: PublicGame;
  adminToken: string;
  persistent: boolean;
}

export async function publishGameRequest(req: PublishRequest): Promise<PublishResponse | null> {
  try {
    const res = await fetch("/api/games", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req),
    });
    return res.ok ? ((await res.json()) as PublishResponse) : null;
  } catch {
    return null;
  }
}

export async function endGameRequest(code: string, adminToken: string): Promise<boolean> {
  try {
    const res = await fetch(`/api/games/${encodeURIComponent(code)}/end`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ adminToken }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

// Başarısız olursa oyun yine sürer; sonuç gönderilmeden önce yeniden denenir, olmazsa sonuç kodu yedektir.
export async function joinGameRequest(code: string, nickname: string): Promise<string | null> {
  try {
    const res = await fetch(`/api/games/${encodeURIComponent(code)}/join`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nickname }),
    });
    if (!res.ok) return null;
    return ((await res.json()) as { playerToken?: string }).playerToken ?? null;
  } catch {
    return null;
  }
}
