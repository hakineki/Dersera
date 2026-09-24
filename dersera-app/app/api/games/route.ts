import { NextResponse } from "next/server";
import { parseComposerPublish } from "@/lib/composer/adapter";
import { parsePublishRequest, type PublishRequest } from "@/lib/games";
import { getGamesStore } from "@/lib/gamesStore";
import { publishGame } from "@/lib/gamesService";
import { istekSahibi } from "@/lib/libraryService";
import { topluluguEkleGuvenli } from "@/lib/toplulukService";
import type { DersKonu } from "@/lib/composer/input";

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Geçersiz istek" }, { status: 400 });
  }

  let request: PublishRequest | null;
  let dersler: DersKonu[] | null = null;
  if (body && typeof body === "object" && "composer" in body) {
    const composed = parseComposerPublish(body);
    if (!composed.ok) {
      return NextResponse.json({ error: composed.error, validation: composed.validation }, { status: composed.status });
    }
    request = composed.request;
    dersler = composed.dersler;
  } else {
    request = parsePublishRequest(body);
  }
  if (!request) {
    return NextResponse.json({ error: "Geçersiz oyun ayarları" }, { status: 422 });
  }

  try {
    const store = getGamesStore();
    const published = await publishGame(store, request);
    if (!published) {
      return NextResponse.json({ error: "Benzersiz oyun kodu üretilemedi" }, { status: 503 });
    }
    if (request.definition && dersler) {
      await topluluguEkleGuvenli(request.definition, dersler, await istekSahibi(req), published.game.code, published.game.expiresAt);
    }
    return NextResponse.json({ ...published, persistent: store.persistent }, { status: 201 });
  } catch (err) {
    console.error("[games] yayınlama hatası", err);
    return NextResponse.json({ error: "Oyun yayınlanamadı" }, { status: 503 });
  }
}

