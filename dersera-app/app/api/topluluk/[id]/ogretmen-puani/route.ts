import { NextResponse } from "next/server";
import { istekHesabi, kokenReddi, oturumGerekli } from "@/lib/authRequest";
import { ogretmenPuaniDurumu, ogretmenPuanVer } from "@/lib/ogretmenPuani";
import { getToplulukStore } from "@/lib/toplulukStore";

type Ctx = { params: Promise<{ id: string }> };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const bulunamadi = () => NextResponse.json({ error: "Bu oyun toplulukta değil." }, { status: 404 });

// Oyunun öğretmen puanı, öğretmenin kendi puanı ve puan verip veremeyeceği.
export async function GET(req: Request, ctx: Ctx) {
  const hesap = await istekHesabi(req);
  if (!hesap) return oturumGerekli();
  const { id } = await ctx.params;
  if (!UUID.test(id)) return bulunamadi();
  try {
    const d = await ogretmenPuaniDurumu(getToplulukStore(), hesap, id);
    return d ? NextResponse.json(d, { headers: { "Cache-Control": "no-store" } }) : bulunamadi();
  } catch (err) {
    console.error("[topluluk] öğretmen puanı okunamadı", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Puan okunamadı" }, { status: 503 });
  }
}

// { puan: 1–5 } — öğretmen başına tek puan, güncellenebilir.
export async function POST(req: Request, ctx: Ctx) {
  const koken = kokenReddi(req);
  if (koken) return koken;
  const hesap = await istekHesabi(req);
  if (!hesap) return oturumGerekli();
  const { id } = await ctx.params;
  if (!UUID.test(id)) return bulunamadi();
  const body = await req.json().catch(() => null);
  try {
    const r = await ogretmenPuanVer(getToplulukStore(), hesap, id, body);
    return r.ok ? NextResponse.json(r.durum) : NextResponse.json({ error: r.error }, { status: r.status });
  } catch (err) {
    console.error("[topluluk] öğretmen puanı yazılamadı", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Puan kaydedilemedi" }, { status: 503 });
  }
}
