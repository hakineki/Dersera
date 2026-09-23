import { NextResponse } from "next/server";
import { isKutuphaneId } from "@/lib/library";
import { getLibraryStore } from "@/lib/libraryStore";
import { anahtarOf, sahipOf } from "@/lib/libraryService";

type Ctx = { params: Promise<{ id: string }> };

async function hedef(req: Request, ctx: Ctx) {
  const anahtar = anahtarOf(req);
  if (!anahtar) return { hata: NextResponse.json({ error: "Kütüphane anahtarı gerekli" }, { status: 401 }) };
  const { id } = await ctx.params;
  if (!isKutuphaneId(id)) return { hata: NextResponse.json({ error: "Oyun bulunamadı" }, { status: 404 }) };
  return { sahip: await sahipOf(anahtar), id };
}

export async function GET(req: Request, ctx: Ctx) {
  const h = await hedef(req, ctx);
  if (h.hata) return h.hata;
  try {
    const kayit = await getLibraryStore().get(h.sahip, h.id);
    return kayit ? NextResponse.json({ oyun: kayit }) : NextResponse.json({ error: "Oyun bulunamadı" }, { status: 404 });
  } catch (err) {
    console.error("[kutuphane] okuma hatası", err);
    return NextResponse.json({ error: "Kütüphane okunamadı" }, { status: 503 });
  }
}

export async function DELETE(req: Request, ctx: Ctx) {
  const h = await hedef(req, ctx);
  if (h.hata) return h.hata;
  try {
    const silindi = await getLibraryStore().remove(h.sahip, h.id);
    return silindi ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "Oyun bulunamadı" }, { status: 404 });
  } catch (err) {
    console.error("[kutuphane] silme hatası", err);
    return NextResponse.json({ error: "Oyun silinemedi" }, { status: 503 });
  }
}
