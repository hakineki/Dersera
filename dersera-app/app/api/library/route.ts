import { NextResponse } from "next/server";
import { ozetOf } from "@/lib/library";
import { getLibraryStore } from "@/lib/libraryStore";
import { kokenReddi, oturumGerekli } from "@/lib/authRequest";
import { istekSahibi, kutuphaneyeEkle } from "@/lib/libraryService";

export async function GET(req: Request) {
  const sahip = await istekSahibi(req);
  if (!sahip) return oturumGerekli();
  try {
    const store = getLibraryStore();
    const kayitlar = await store.list(sahip);
    const oyunlar = kayitlar.map(ozetOf).sort((a, b) => b.createdAt - a.createdAt);
    return NextResponse.json({ oyunlar, persistent: store.persistent });
  } catch (err) {
    console.error("[kutuphane] listeleme hatası", err);
    return NextResponse.json({ error: "Kütüphane okunamadı" }, { status: 503 });
  }
}

// Composer'daki "Kütüphaneye kaydet" butonu. Yayınlamadan bağımsızdır.
export async function POST(req: Request) {
  const koken = kokenReddi(req);
  if (koken) return koken;
  const sahip = await istekSahibi(req);
  if (!sahip) return oturumGerekli();
  const body = await req.json().catch(() => null);
  try {
    const r = await kutuphaneyeEkle(getLibraryStore(), sahip, body);
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
    return NextResponse.json({ id: r.id, validation: r.validation }, { status: 201 });
  } catch (err) {
    console.error("[kutuphane] kayıt hatası", err);
    return NextResponse.json({ error: "Oyun kütüphaneye kaydedilemedi" }, { status: 503 });
  }
}
