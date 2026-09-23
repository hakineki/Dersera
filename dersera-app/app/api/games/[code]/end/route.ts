import { NextResponse } from "next/server";
import { normalizeGameCode } from "@/lib/games";
import { getGamesStore } from "@/lib/gamesStore";
import { endGame } from "@/lib/gamesService";

export async function POST(req: Request, { params }: { params: Promise<{ code: string }> }) {
  const code = normalizeGameCode((await params).code);
  if (!code) return NextResponse.json({ error: "Geçersiz kod" }, { status: 404 });

  let adminToken: unknown;
  try {
    adminToken = ((await req.json()) as { adminToken?: unknown })?.adminToken;
  } catch {
    return NextResponse.json({ error: "Geçersiz istek" }, { status: 400 });
  }
  if (typeof adminToken !== "string" || adminToken.length === 0 || adminToken.length > 100) {
    return NextResponse.json({ error: "Yetkisiz" }, { status: 403 });
  }

  try {
    const result = await endGame(getGamesStore(), code, adminToken);
    if (result === "not-found") return NextResponse.json({ error: "Geçersiz kod" }, { status: 404 });
    if (result === "forbidden") return NextResponse.json({ error: "Yetkisiz" }, { status: 403 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[games] bitirme hatası", err);
    return NextResponse.json({ error: "Oyun bitirilemedi" }, { status: 503 });
  }
}
