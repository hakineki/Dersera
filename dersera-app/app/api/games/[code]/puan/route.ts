import { NextResponse } from "next/server";
import { normalizeGameCode } from "@/lib/games";
import { getGamesStore } from "@/lib/gamesStore";
import { verifyPlayer } from "@/lib/gamesService";
import { gecerliPuan } from "@/lib/istatistik";
import { puanVer } from "@/lib/istatistikService";
import { istekSahibi } from "@/lib/libraryService";
import { NICKNAME_PATTERN } from "@/lib/results";

// Oyun sonunda öğrencinin anonim puanı (1–5). Yalnız o oyuna katılan cihazın oyuncu anahtarıyla, takma ad başına bir kez.
export async function POST(req: Request, { params }: { params: Promise<{ code: string }> }) {
  const code = normalizeGameCode((await params).code);
  if (!code) return NextResponse.json({ error: "Geçersiz kod" }, { status: 404 });

  const body = (await req.json().catch(() => null)) as { nickname?: unknown; playerToken?: unknown; puan?: unknown } | null;
  const nickname = typeof body?.nickname === "string" ? body.nickname.trim() : "";
  if (!NICKNAME_PATTERN.test(nickname) || !gecerliPuan(body?.puan)) {
    return NextResponse.json({ error: "Geçersiz puan" }, { status: 422 });
  }
  if (typeof body?.playerToken !== "string" || body.playerToken.length === 0 || body.playerToken.length > 100) {
    return NextResponse.json({ error: "Yetkisiz" }, { status: 403 });
  }

  try {
    const games = getGamesStore();
    const game = await games.get(code);
    if (!game) return NextResponse.json({ error: "Oyun bulunamadı" }, { status: 404 });
    if (!(await verifyPlayer(games, code, nickname, body.playerToken))) return NextResponse.json({ error: "Yetkisiz" }, { status: 403 });
    const sonuc = await puanVer(code, nickname, body.puan as number, await istekSahibi(req), game.expiresAt);
    if (sonuc === "bitirmedi") return NextResponse.json({ error: "Puan, oyunu bitirip sonucun kaydedildikten sonra verilebilir" }, { status: 403 });
    return sonuc === "kaydedildi" ? NextResponse.json({ ok: true }, { status: 201 }) : NextResponse.json({ error: "Bu oyuna zaten puan verdin" }, { status: 409 });
  } catch (err) {
    console.error("[istatistik] puan kaydedilemedi", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Puan kaydedilemedi" }, { status: 503 });
  }
}
