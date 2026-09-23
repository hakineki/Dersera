import { NextResponse } from "next/server";
import type { DersKonu } from "@/lib/composer/input";
import { parseComposerPublish } from "@/lib/composer/adapter";
import { parsePublishRequest, type PublishRequest } from "@/lib/games";
import { getGamesStore } from "@/lib/gamesStore";
import { publishGame } from "@/lib/gamesService";
import { isKutuphaneAnahtari } from "@/lib/library";
import { getLibraryStore } from "@/lib/libraryStore";
import { kutuphaneyeEkle } from "@/lib/libraryService";

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Geçersiz istek" }, { status: 400 });
  }

  let request: PublishRequest | null;
  if (body && typeof body === "object" && "composer" in body) {
    const composed = parseComposerPublish(body);
    if (!composed.ok) {
      return NextResponse.json({ error: composed.error, validation: composed.validation }, { status: composed.status });
    }
    request = composed.request;
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
    const kutuphaneId = await kutuphaneyeKaydet(body, request, published.game.code);
    return NextResponse.json({ ...published, persistent: store.persistent, kutuphaneId }, { status: 201 });
  } catch (err) {
    console.error("[games] yayınlama hatası", err);
    return NextResponse.json({ error: "Oyun yayınlanamadı" }, { status: 503 });
  }
}

// Composer oyunu, istek kütüphane anahtarı taşıyorsa öğretmenin kütüphanesine eklenir.
// Kütüphane hatası yayını bozmaz: oyun zaten yayınlandı, öğretmene kod dönmelidir.
async function kutuphaneyeKaydet(body: unknown, request: PublishRequest, kod: string): Promise<string | null> {
  const b = body as { kutuphane?: unknown; composer?: { dersler?: unknown } };
  if (!request.definition || !isKutuphaneAnahtari(b.kutuphane)) return null;
  try {
    return await kutuphaneyeEkle(getLibraryStore(), b.kutuphane, request.definition, b.composer!.dersler as DersKonu[], kod);
  } catch (err) {
    console.error("[kutuphane] kayıt hatası", err);
    return null;
  }
}
