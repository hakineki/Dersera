import { NextResponse } from "next/server";
import { kokenReddi, oturumGerekli } from "@/lib/authRequest";
import { getLibraryStore } from "@/lib/libraryStore";
import { anahtarOf, eskiSahipOf, istekSahibi, kutuphaneyiTasi } from "@/lib/libraryService";

// Hesap öncesinde bu tarayıcıda oluşturulan kütüphane. Ortak bilgisayarda başkasına ait olabileceği için
// önce sayısı gösterilir; taşıma yalnız öğretmen onaylayınca yapılır.
async function hazirla(req: Request) {
  const sahip = await istekSahibi(req);
  if (!sahip) return { hata: oturumGerekli() };
  const anahtar = anahtarOf(req);
  if (!anahtar) return { hata: NextResponse.json({ error: "Kütüphane anahtarı gerekli" }, { status: 400 }) };
  return { sahip, eski: await eskiSahipOf(anahtar) };
}

export async function GET(req: Request) {
  const h = await hazirla(req);
  if (h.hata) return h.hata;
  try {
    return NextResponse.json({ bekleyen: await getLibraryStore().count(h.eski) }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    console.error("[kutuphane] eski kütüphane okunamadı", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Kütüphane okunamadı" }, { status: 503 });
  }
}

export async function POST(req: Request) {
  const koken = kokenReddi(req, false);
  if (koken) return koken;
  const h = await hazirla(req);
  if (h.hata) return h.hata;
  try {
    return NextResponse.json(await kutuphaneyiTasi(getLibraryStore(), h.eski, h.sahip));
  } catch (err) {
    console.error("[kutuphane] taşıma hatası", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Kütüphane taşınamadı" }, { status: 503 });
  }
}
