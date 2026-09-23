import { NextResponse } from "next/server";
import { parseLeaderboardEntry } from "@/lib/results";
import { getResultsStore } from "@/lib/resultsStore";

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Geçersiz istek" }, { status: 400 });
  }

  const entry = parseLeaderboardEntry(body);
  if (!entry) {
    return NextResponse.json({ error: "Geçersiz sonuç verisi" }, { status: 422 });
  }

  try {
    await getResultsStore().save(entry);
  } catch (err) {
    console.error("[results] kayıt hatası", err);
    return NextResponse.json({ error: "Sonuç kaydedilemedi" }, { status: 503 });
  }

  return NextResponse.json({ ok: true }, { status: 201 });
}

export async function GET() {
  const store = getResultsStore();
  try {
    const results = await store.list();
    return NextResponse.json({ results, persistent: store.persistent });
  } catch (err) {
    console.error("[results] okuma hatası", err);
    return NextResponse.json({ error: "Sonuçlar okunamadı" }, { status: 503 });
  }
}
