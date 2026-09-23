import { NextResponse } from "next/server";
import { parsePublishRequest } from "@/lib/games";
import { getGamesStore } from "@/lib/gamesStore";
import { publishGame } from "@/lib/gamesService";

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Geçersiz istek" }, { status: 400 });
  }

  const request = parsePublishRequest(body);
  if (!request) {
    return NextResponse.json({ error: "Geçersiz oyun ayarları" }, { status: 422 });
  }

  try {
    const store = getGamesStore();
    const published = await publishGame(store, request);
    if (!published) {
      return NextResponse.json({ error: "Benzersiz oyun kodu üretilemedi" }, { status: 503 });
    }
    return NextResponse.json({ ...published, persistent: store.persistent }, { status: 201 });
  } catch (err) {
    console.error("[games] yayınlama hatası", err);
    return NextResponse.json({ error: "Oyun yayınlanamadı" }, { status: 503 });
  }
}
