import { NextResponse } from "next/server";
import { istekHesabi, kokenReddi, oturumGerekli } from "@/lib/authRequest";
import { gorselDurumu, gorselUret, type GorselDeps } from "@/lib/gorselService";
import { getGorselStore } from "@/lib/gorselStore";
import { gorselUretVeYaz } from "@/lib/gorselUretici";

// Görsel zenginleştirme: POST sıradaki görseli üretir (istemci hedef sayısı kadar çağırır), GET ilerlemeyi döner.
// Yalnız işi başlatan öğretmen. Üretim + sıkıştırma + yükleme bir görselde bu sınırın altında kalır.
export const maxDuration = 60;

const depolar = (): GorselDeps => ({ store: getGorselStore(), uret: gorselUretVeYaz });
type Params = { params: Promise<{ isId: string }> };
type Sonuc = { ok: true } | { ok: false; status: number; error: string };

async function islem(req: Request, ctx: Params, is: (hesapId: string, isId: string) => Promise<Sonuc>) {
  const hesap = await istekHesabi(req);
  if (!hesap) return oturumGerekli();
  try {
    const r = await is(hesap.id, (await ctx.params).isId);
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
    const { ok: _ok, ...veri } = r;
    void _ok;
    return NextResponse.json(veri, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    console.error("[gorsel] işlem başarısız", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Görsel şu anda üretilemedi." }, { status: 503 });
  }
}

export async function GET(req: Request, ctx: Params) {
  return islem(req, ctx, (hesapId, isId) => gorselDurumu(depolar(), hesapId, isId));
}

export async function POST(req: Request, ctx: Params) {
  const koken = kokenReddi(req, false);
  if (koken) return koken;
  return islem(req, ctx, (hesapId, isId) => gorselUret(depolar(), hesapId, isId));
}
