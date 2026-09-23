import { NextResponse } from "next/server";
import { oturumGerekli } from "@/lib/authRequest";
import { getLibraryStore } from "@/lib/libraryStore";
import { anahtarOf, eskiSahipOf, istekSahibi, kutuphaneyiTasi } from "@/lib/libraryService";

// Hesap öncesinde bu tarayıcıda oluşturulan kütüphaneyi giriş yapan hesaba taşır.
export async function POST(req: Request) {
  const sahip = await istekSahibi(req);
  if (!sahip) return oturumGerekli();
  const anahtar = anahtarOf(req);
  if (!anahtar) return NextResponse.json({ error: "Kütüphane anahtarı gerekli" }, { status: 400 });
  try {
    return NextResponse.json(await kutuphaneyiTasi(getLibraryStore(), await eskiSahipOf(anahtar), sahip));
  } catch (err) {
    console.error("[kutuphane] taşıma hatası", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Kütüphane taşınamadı" }, { status: 503 });
  }
}
