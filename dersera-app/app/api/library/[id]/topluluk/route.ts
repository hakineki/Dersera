import { NextResponse } from "next/server";
import { istekHesabi, kokenReddi, oturumGerekli } from "@/lib/authRequest";
import { isKutuphaneId } from "@/lib/library";
import { getLibraryStore } from "@/lib/libraryStore";
import { topluluktanGeriCek, topluluktaPaylas } from "@/lib/toplulukPaylasim";
import { getToplulukStore } from "@/lib/toplulukStore";

type Ctx = { params: Promise<{ id: string }> };

// "Toplulukta paylaş": kütüphanedeki oyun eşikleri geçtiyse iki öğretmen incelemesine gönderilir.
export async function POST(req: Request, ctx: Ctx) {
  const koken = kokenReddi(req, false);
  if (koken) return koken;
  const hesap = await istekHesabi(req);
  if (!hesap) return oturumGerekli();
  const { id } = await ctx.params;
  if (!isKutuphaneId(id)) return NextResponse.json({ error: "Oyun bulunamadı" }, { status: 404 });
  try {
    const r = await topluluktaPaylas(getToplulukStore(), getLibraryStore(), hesap, id);
    if (!r.ok) return NextResponse.json({ error: r.error, nedenler: r.nedenler, yonetisim: r.yonetisim }, { status: r.status });
    return NextResponse.json({ durum: r.durum }, { status: 201 });
  } catch (err) {
    console.error("[topluluk] gönderim hatası", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Oyun topluluğa gönderilemedi" }, { status: 503 });
  }
}

// "Topluluktan geri çek".
export async function DELETE(req: Request, ctx: Ctx) {
  const koken = kokenReddi(req, false);
  if (koken) return koken;
  const hesap = await istekHesabi(req);
  if (!hesap) return oturumGerekli();
  const { id } = await ctx.params;
  if (!isKutuphaneId(id)) return NextResponse.json({ error: "Oyun bulunamadı" }, { status: 404 });
  try {
    const r = await topluluktanGeriCek(getToplulukStore(), hesap, id);
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[topluluk] geri çekme hatası", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Oyun geri çekilemedi" }, { status: 503 });
  }
}
