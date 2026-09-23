import { NextResponse } from "next/server";
import { getGamesStore } from "@/lib/gamesStore";
import { isKutuphaneId } from "@/lib/library";
import { getLibraryStore } from "@/lib/libraryStore";
import { anahtarOf, parseSure, yenidenYayinla } from "@/lib/libraryService";

// Kayıtlı oyunu yeni oyun koduyla yayınlar; yapay zekâ çağrısı yapılmaz.
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const anahtar = anahtarOf(req);
  if (!anahtar) return NextResponse.json({ error: "Kütüphane anahtarı gerekli" }, { status: 401 });
  const { id } = await ctx.params;
  if (!isKutuphaneId(id)) return NextResponse.json({ error: "Oyun bulunamadı" }, { status: 404 });
  const body = (await req.json().catch(() => ({}))) as { durationMinutes?: unknown } | null;
  const sure = parseSure(body?.durationMinutes);
  if (sure === null) return NextResponse.json({ error: "Geçersiz süre" }, { status: 422 });
  try {
    const games = getGamesStore();
    const r = await yenidenYayinla(getLibraryStore(), games, anahtar, id, sure);
    if (!r.ok) return NextResponse.json({ error: r.error, validation: r.validation }, { status: r.status });
    return NextResponse.json({ game: r.game, adminToken: r.adminToken, persistent: games.persistent }, { status: 201 });
  } catch (err) {
    console.error("[kutuphane] yayınlama hatası", err);
    return NextResponse.json({ error: "Oyun yayınlanamadı" }, { status: 503 });
  }
}
