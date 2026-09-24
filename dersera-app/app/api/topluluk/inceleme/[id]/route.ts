import { NextResponse } from "next/server";
import { istekHesabi, kokenReddi, oturumGerekli } from "@/lib/authRequest";
import { incele, incelemeDetayi } from "@/lib/toplulukPaylasim";
import { getToplulukStore } from "@/lib/toplulukStore";

type Ctx = { params: Promise<{ id: string }> };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const bulunamadi = () => NextResponse.json({ error: "İnceleme bekleyen böyle bir oyun yok." }, { status: 404 });

// İnceleyen öğretmenin göreceği tam oyun (cevaplar dahil) ve içerik denetimi sonucu.
export async function GET(req: Request, ctx: Ctx) {
  const hesap = await istekHesabi(req);
  if (!hesap) return oturumGerekli();
  const { id } = await ctx.params;
  if (!UUID.test(id)) return bulunamadi();
  try {
    const r = await incelemeDetayi(getToplulukStore(), hesap, id);
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
    const { ok: _ok, ...detay } = r;
    void _ok;
    return NextResponse.json(detay, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    console.error("[topluluk] inceleme detayı okunamadı", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Oyun okunamadı" }, { status: 503 });
  }
}

// { karar: "kabul" | "ret", not } — hesap başına tek inceleme.
export async function POST(req: Request, ctx: Ctx) {
  const koken = kokenReddi(req);
  if (koken) return koken;
  const hesap = await istekHesabi(req);
  if (!hesap) return oturumGerekli();
  const { id } = await ctx.params;
  if (!UUID.test(id)) return bulunamadi();
  const body = await req.json().catch(() => null);
  try {
    const r = await incele(getToplulukStore(), hesap, id, body);
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
    return NextResponse.json({ durum: r.durum, kabul: r.kabul, ret: r.ret });
  } catch (err) {
    console.error("[topluluk] inceleme kaydedilemedi", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "İnceleme kaydedilemedi" }, { status: 503 });
  }
}
