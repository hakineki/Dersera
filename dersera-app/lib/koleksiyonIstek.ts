import { NextResponse } from "next/server";
import { istekHesabi, jsonGovde, kokenReddi, oturumGerekli } from "@/lib/authRequest";
import type { Hesap } from "@/lib/authStore";
import type { KoleksiyonDeps, KoleksiyonSonucu } from "@/lib/koleksiyonService";
import { getKoleksiyonStore } from "@/lib/koleksiyonStore";
import { getToplulukStore } from "@/lib/toplulukStore";

// Koleksiyon uç noktalarının ortak kalıbı: (yazmada) köken denetimi, oturum, gövde, hata → 503.
export async function koleksiyonIslemi(
  req: Request,
  is: (hesap: Hesap, d: KoleksiyonDeps, body: Record<string, unknown>) => Promise<KoleksiyonSonucu>,
  { yazma = false, govdesiz = false, basari = 200 }: { yazma?: boolean; govdesiz?: boolean; basari?: number } = {}
) {
  if (yazma) {
    const koken = kokenReddi(req, !govdesiz);
    if (koken) return koken;
  }
  const hesap = await istekHesabi(req);
  if (!hesap) return oturumGerekli();
  try {
    const body = yazma && !govdesiz ? await jsonGovde(req) : {};
    const r = await is(hesap, { koleksiyon: getKoleksiyonStore(), topluluk: getToplulukStore() }, body);
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
    const { ok: _ok, ...veri } = r;
    void _ok;
    return NextResponse.json(veri, { status: basari, headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    console.error("[koleksiyon] işlem başarısız", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Koleksiyon işlemi şu anda yapılamadı. Tekrar deneyin." }, { status: 503 });
  }
}
