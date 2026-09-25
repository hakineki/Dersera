import { NextResponse } from "next/server";
import { normalizeGameCode } from "@/lib/games";
import { getGamesStore } from "@/lib/gamesStore";
import { verifyPlayer } from "@/lib/gamesService";
import { parseLeaderboardEntry } from "@/lib/results";
import { getResultsStore } from "@/lib/resultsStore";
import { bitirisSay, oyuncuOf } from "@/lib/istatistikService";
import { ogrenciSinyali } from "@/lib/ogrenmeService";
import { GAME_RETENTION_MS } from "@/lib/gamesStore";
import { istekSahibi } from "@/lib/libraryService";

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Geçersiz istek" }, { status: 400 });
  }

  const { gameCode, playerToken, result } = (body ?? {}) as {
    gameCode?: unknown;
    playerToken?: unknown;
    result?: unknown;
  };
  const code = typeof gameCode === "string" ? normalizeGameCode(gameCode) : null;
  const entry = parseLeaderboardEntry(result);
  if (!code || !entry) {
    return NextResponse.json({ error: "Geçersiz sonuç verisi" }, { status: 422 });
  }
  if (typeof playerToken !== "string" || playerToken.length === 0 || playerToken.length > 100) {
    return NextResponse.json({ error: "Yetkisiz" }, { status: 403 });
  }

  try {
    // Süresi dolmuş oyunun sonucu da kabul edilir: çevrimdışı bitiren öğrenci sonradan gönderebilir.
    const games = getGamesStore();
    const game = await games.get(code);
    if (!game) {
      return NextResponse.json({ error: "Oyun bulunamadı" }, { status: 404 });
    }
    if (!(await verifyPlayer(games, code, entry.nickname, playerToken))) {
      return NextResponse.json({ error: "Yetkisiz" }, { status: 403 });
    }
    await getResultsStore().save(code, entry);
    await bitirisSay(code, entry.nickname, await istekSahibi(req), game.expiresAt, game.definition?.meta.sure_dk ?? null);
    // Öğrenme döngüsü: durak başına yanlış sayısı (kimliksiz, öğrenci oyun başına bir kez).
    if (game.definition && entry.stopDetails) {
      const yanlislar = Object.fromEntries(Object.entries(entry.stopDetails).map(([id, d]) => [id, d.hintsUsed]));
      await ogrenciSinyali(code, oyuncuOf(code, entry.nickname), game.definition, yanlislar, game.expiresAt + GAME_RETENTION_MS - Date.now());
    }
  } catch (err) {
    console.error("[results] kayıt hatası", err);
    return NextResponse.json({ error: "Sonuç kaydedilemedi" }, { status: 503 });
  }

  return NextResponse.json({ ok: true }, { status: 201 });
}

export async function GET(req: Request) {
  const code = normalizeGameCode(new URL(req.url).searchParams.get("code") ?? "");
  if (!code) {
    return NextResponse.json({ error: "Oyun kodu gerekli" }, { status: 400 });
  }

  const store = getResultsStore();
  try {
    const results = await store.list(code);
    return NextResponse.json({ results, persistent: store.persistent });
  } catch (err) {
    console.error("[results] okuma hatası", err);
    return NextResponse.json({ error: "Sonuçlar okunamadı" }, { status: 503 });
  }
}
