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

const YAYIN_HATASI = "Oyun yayınlanamadı. Bağlantını kontrol edip tekrar dene.";

// Sunucu yayını reddederse gerekçesi (ör. içerik denetimi bulguları) öğretmene gösterilir.
export async function publishGameRequest(req: PublishRequest): Promise<PublishResponse | { error: string }> {
  try {
    const res = await fetch("/api/games", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req),
    });
    const json = await res.json().catch(() => ({}));
    if (res.ok) return json as PublishResponse;
    const bulgular: string[] = Array.isArray(json.bulgular) ? json.bulgular.map((b: { mesaj?: unknown }) => b.mesaj).filter((m: unknown): m is string => typeof m === "string") : [];
    return { error: [typeof json.error === "string" ? json.error : YAYIN_HATASI, ...bulgular.slice(0, 3)].join(" ") };
  } catch {
    return { error: YAYIN_HATASI };
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

export type JoinResponse = { status: "joined"; playerToken: string } | { status: "taken" } | { status: "error" };

// "error" (ağ yok vb.) oyunu durdurmaz; sonuç gönderilmeden önce katılım yeniden denenir, olmazsa sonuç kodu yedektir.
export async function joinGameRequest(code: string, nickname: string): Promise<JoinResponse> {
  try {
    const res = await fetch(`/api/games/${encodeURIComponent(code)}/join`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nickname }),
    });
    if (res.status === 409) return { status: "taken" };
    const token = res.ok ? ((await res.json()) as { playerToken?: string }).playerToken : undefined;
    return token ? { status: "joined", playerToken: token } : { status: "error" };
  } catch {
    return { status: "error" };
  }
}
