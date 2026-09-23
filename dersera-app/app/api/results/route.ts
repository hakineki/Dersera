import { NextResponse } from "next/server";
import { normalizeGameCode } from "@/lib/games";
import { getGamesStore } from "@/lib/gamesStore";
import { parseLeaderboardEntry } from "@/lib/results";
import { getResultsStore } from "@/lib/resultsStore";

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Geçersiz istek" }, { status: 400 });
  }

  const { gameCode, result } = (body ?? {}) as { gameCode?: unknown; result?: unknown };
  const code = typeof gameCode === "string" ? normalizeGameCode(gameCode) : null;
  const entry = parseLeaderboardEntry(result);
  if (!code || !entry) {
    return NextResponse.json({ error: "Geçersiz sonuç verisi" }, { status: 422 });
  }

  try {
    // Süresi dolmuş oyunun sonucu da kabul edilir: çevrimdışı bitiren öğrenci sonradan gönderebilir.
    if (!(await getGamesStore().get(code))) {
      return NextResponse.json({ error: "Oyun bulunamadı" }, { status: 404 });
    }
    await getResultsStore().save(code, entry);
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
