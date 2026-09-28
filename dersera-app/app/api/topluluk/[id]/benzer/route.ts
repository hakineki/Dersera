import { NextResponse } from "next/server";
import { istekHesabi, oturumGerekli } from "@/lib/authRequest";
import { checkLimit, clientIp } from "@/lib/composer/rateLimit";
import { getToplulukStore } from "@/lib/toplulukStore";
import { benzerOyunOnerileri } from "@/lib/toplulukService";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

// Oyun kartındaki "Benzer oyunlar": yalnız özetler (tam içerik açılmaz, günlük açma hakkından sayılmaz).
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!(await istekHesabi(req))) return oturumGerekli();
  const { id } = await ctx.params;
  if (!UUID.test(id)) return NextResponse.json({ error: "Oyun bulunamadı" }, { status: 404 });
  // Liste ile aynı istek sınırı.
  const izin = await checkLimit(`dersera:topluluk:liste:${clientIp(req)}`, 60_000, 60).catch(() => true);
  if (!izin) return NextResponse.json({ error: "Çok fazla istek. Biraz sonra tekrar deneyin." }, { status: 429 });
  try {
    const oyunlar = await benzerOyunOnerileri(getToplulukStore(), id);
    if (!oyunlar) return NextResponse.json({ error: "Oyun bulunamadı" }, { status: 404 });
    return NextResponse.json({ oyunlar }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    console.error("[topluluk] benzer oyunlar okunamadı", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Kütüphane okunamadı" }, { status: 503 });
  }
}
