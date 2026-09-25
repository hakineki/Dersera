import { NextResponse } from "next/server";
import { isGameActive, normalizeGameCode } from "@/lib/games";
import { getGamesStore } from "@/lib/gamesStore";
import { toPublicGame, verifyPlayer } from "@/lib/gamesService";

// Oyuncu kimliği başlıklarla gelir (adres çubuğuna ve kayıtlara düşmesin); takma ad Türkçe harf içerebildiği için kodlanır.
function oyuncuOf(req: Request): { ad: string; anahtar: string } | null {
  const ad = req.headers.get("x-oyuncu-adi");
  const anahtar = req.headers.get("x-oyuncu-anahtari");
  if (!ad || !anahtar || ad.length > 200 || anahtar.length > 100) return null;
  try {
    return { ad: decodeURIComponent(ad), anahtar };
  } catch {
    return null;
  }
}

export async function GET(req: Request, { params }: { params: Promise<{ code: string }> }) {
  const code = normalizeGameCode((await params).code);
  if (!code) return NextResponse.json({ error: "Geçersiz kod" }, { status: 404 });

  try {
    const store = getGamesStore();
    const game = await store.get(code);
    if (!game) return NextResponse.json({ error: "Geçersiz kod" }, { status: 404 });
    // Composer oyununun soruları ve cevapları yalnız bu oyuna katılmış oyuncuya, oyun sürerken gider.
    const oyuncu = game.definition && isGameActive(game) ? oyuncuOf(req) : null;
    const icerik = !game.definition || (!!oyuncu && (await verifyPlayer(store, code, oyuncu.ad, oyuncu.anahtar)));
    return NextResponse.json({
      game: toPublicGame(game, icerik),
      active: isGameActive(game),
      players: await store.playerCount(code),
      serverNow: Date.now(),
    });
  } catch (err) {
    console.error("[games] okuma hatası", err);
    return NextResponse.json({ error: "Oyun okunamadı" }, { status: 503 });
  }
}
