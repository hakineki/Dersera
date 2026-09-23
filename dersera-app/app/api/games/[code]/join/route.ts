import { NextResponse } from "next/server";
import { normalizeGameCode } from "@/lib/games";
import { getGamesStore } from "@/lib/gamesStore";
import { joinGame } from "@/lib/gamesService";
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
    const result = await joinGame(getGamesStore(), code, nickname.trim());
    switch (result.status) {
      case "joined":
        return NextResponse.json({ playerToken: result.playerToken }, { status: 201 });
      case "taken":
        return NextResponse.json({ error: "Bu takma ad bu oyunda kullanımda" }, { status: 409 });
      case "closed":
        return NextResponse.json({ error: "Oyun sona erdi" }, { status: 410 });
      case "not-found":
        return NextResponse.json({ error: "Geçersiz kod" }, { status: 404 });
    }
  } catch (err) {
    console.error("[games] katılım hatası", err);
    return NextResponse.json({ error: "Katılım kaydedilemedi" }, { status: 503 });
  }
}
