import { NextResponse } from "next/server";
import { ozetOf } from "@/lib/library";
import { getLibraryStore } from "@/lib/libraryStore";
import { anahtarOf, sahipOf } from "@/lib/libraryService";

export async function GET(req: Request) {
  const anahtar = anahtarOf(req);
  if (!anahtar) return NextResponse.json({ error: "Kütüphane anahtarı gerekli" }, { status: 401 });
  try {
    const store = getLibraryStore();
    const kayitlar = await store.list(await sahipOf(anahtar));
    const oyunlar = kayitlar.map(ozetOf).sort((a, b) => b.createdAt - a.createdAt);
    return NextResponse.json({ oyunlar, persistent: store.persistent });
  } catch (err) {
    console.error("[kutuphane] listeleme hatası", err);
    return NextResponse.json({ error: "Kütüphane okunamadı" }, { status: 503 });
  }
}
