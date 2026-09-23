import { NextResponse } from "next/server";
import { isGameActive, normalizeGameCode } from "@/lib/games";
import { getGamesStore } from "@/lib/gamesStore";
import { toPublicGame } from "@/lib/gamesService";

export async function GET(_req: Request, { params }: { params: Promise<{ code: string }> }) {
  const code = normalizeGameCode((await params).code);
  if (!code) return NextResponse.json({ error: "Geçersiz kod" }, { status: 404 });

  try {
    const store = getGamesStore();
    const game = await store.get(code);
    if (!game) return NextResponse.json({ error: "Geçersiz kod" }, { status: 404 });
    return NextResponse.json({
      game: toPublicGame(game),
      active: isGameActive(game),
      players: await store.playerCount(code),
      serverNow: Date.now(),
    });
  } catch (err) {
    console.error("[games] okuma hatası", err);
    return NextResponse.json({ error: "Oyun okunamadı" }, { status: 503 });
  }
}
