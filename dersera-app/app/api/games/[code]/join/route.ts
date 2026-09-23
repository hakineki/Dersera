import { NextResponse } from "next/server";
import { isGameActive, normalizeGameCode } from "@/lib/games";
import { getGamesStore } from "@/lib/gamesStore";
import { NICKNAME_PATTERN } from "@/lib/results";

export async function POST(req: Request, { params }: { params: Promise<{ code: string }> }) {
  const code = normalizeGameCode((await params).code);
  if (!code) return NextResponse.json({ error: "Geçersiz kod" }, { status: 404 });

  let nickname: unknown;
  try {
    nickname = ((await req.json()) as { nickname?: unknown })?.nickname;
  } catch {
    return NextResponse.json({ error: "Geçersiz istek" }, { status: 400 });
  }
  if (typeof nickname !== "string" || !NICKNAME_PATTERN.test(nickname.trim())) {
    return NextResponse.json({ error: "Geçersiz takma ad" }, { status: 422 });
  }

  try {
    const store = getGamesStore();
    const game = await store.get(code);
    if (!game) return NextResponse.json({ error: "Geçersiz kod" }, { status: 404 });
    const now = Date.now();
    if (!isGameActive(game, now)) return NextResponse.json({ error: "Oyun sona erdi" }, { status: 410 });
    await store.addPlayer(code, nickname.trim(), now, game.expiresAt);
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (err) {
    console.error("[games] katılım hatası", err);
    return NextResponse.json({ error: "Katılım kaydedilemedi" }, { status: 503 });
  }
}
