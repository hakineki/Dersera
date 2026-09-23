import { NextResponse } from "next/server";
import { isKutuphaneId } from "@/lib/library";
import { getLibraryStore } from "@/lib/libraryStore";
import { kokenReddi, oturumGerekli } from "@/lib/authRequest";
import { istekSahibi, kayitDetayi, kutuphaneKaydiniGuncelle } from "@/lib/libraryService";

type Ctx = { params: Promise<{ id: string }> };

async function hedef(req: Request, ctx: Ctx) {
  const sahip = await istekSahibi(req);
  if (!sahip) return { hata: oturumGerekli() };
  const { id } = await ctx.params;
  if (!isKutuphaneId(id)) return { hata: NextResponse.json({ error: "Oyun bulunamadı" }, { status: 404 }) };
  return { sahip, id };
}

export async function GET(req: Request, ctx: Ctx) {
  const h = await hedef(req, ctx);
  if (h.hata) return h.hata;
  try {
    const kayit = await getLibraryStore().get(h.sahip, h.id);
    return kayit ? NextResponse.json(kayitDetayi(kayit)) : NextResponse.json({ error: "Oyun bulunamadı" }, { status: 404 });
  } catch (err) {
    console.error("[kutuphane] okuma hatası", err);
    return NextResponse.json({ error: "Kütüphane okunamadı" }, { status: 503 });
  }
}

// Düzenlenen oyun aynı kayda yazılır.
export async function PUT(req: Request, ctx: Ctx) {
  const koken = kokenReddi(req);
  if (koken) return koken;
  const sahip = await istekSahibi(req);
  if (!sahip) return oturumGerekli();
  const { id } = await ctx.params;
  if (!isKutuphaneId(id)) return NextResponse.json({ error: "Oyun bulunamadı" }, { status: 404 });
  const body = await req.json().catch(() => null);
  try {
    const r = await kutuphaneKaydiniGuncelle(getLibraryStore(), sahip, id, body);
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
    return NextResponse.json({ id: r.id, validation: r.validation });
  } catch (err) {
    console.error("[kutuphane] güncelleme hatası", err);
    return NextResponse.json({ error: "Oyun güncellenemedi" }, { status: 503 });
  }
}

export async function DELETE(req: Request, ctx: Ctx) {
  const koken = kokenReddi(req, false);
  if (koken) return koken;
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
