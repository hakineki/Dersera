import { NextResponse } from "next/server";
import { kutuphaneSahibi } from "@/lib/auth";
import { istekHesabi, oturumGerekli } from "@/lib/authRequest";
import { ayOf } from "@/lib/kredi";
import { takipRaporu } from "@/lib/ogrenmeTakibiService";

// Öğretmenin öğrenme takibi: ?ay=YYYY-MM (varsayılan bu ay) ve önceki iki ay. Yalnız kendi yayınladığı oyunların
// toplu, kimliksiz sonuçları.
export async function GET(req: Request) {
  const hesap = await istekHesabi(req);
  if (!hesap) return oturumGerekli();
  const istenen = new URL(req.url).searchParams.get("ay");
  const ay = istenen && /^\d{4}-(0[1-9]|1[0-2])$/.test(istenen) ? istenen : ayOf(Date.now());
  try {
    return NextResponse.json(await takipRaporu(kutuphaneSahibi(hesap), ay), { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    console.error("[takip] rapor okunamadı", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Öğrenme takibi şu anda okunamadı." }, { status: 503 });
  }
}
