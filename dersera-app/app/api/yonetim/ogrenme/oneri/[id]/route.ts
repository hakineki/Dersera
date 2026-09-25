import { NextResponse } from "next/server";
import { kokenReddi } from "@/lib/authRequest";
import { oneriKarar, type OneriKarari } from "@/lib/ogrenmeService";
import { yoneticiHesabi } from "@/lib/yoneticiIstek";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const KARARLAR = new Set<OneriKarari>(["onayla", "reddet", "geri-al"]);

// Öneri kararı (yalnız platform yöneticisi): { karar: "onayla" | "reddet" | "geri-al" }. Onaylanan öneri oluşturma
// istemine ek kural olur; geri alınınca çıkar. Kim ve ne zaman karar verdiği kaydedilir.
export async function PUT(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const koken = kokenReddi(req);
  if (koken) return koken;
  const y = await yoneticiHesabi(req);
  if (y.yanit) return y.yanit;
  const { id } = await ctx.params;
  const karar = ((await req.json().catch(() => null)) as { karar?: unknown } | null)?.karar;
  if (!UUID.test(id) || typeof karar !== "string" || !KARARLAR.has(karar as OneriKarari)) return NextResponse.json({ error: "Geçersiz karar." }, { status: 422 });
  try {
    const o = await oneriKarar(id, karar as OneriKarari, y.hesap.kullaniciAdi);
    if (!o) return NextResponse.json({ error: "Öneri bulunamadı ya da durumu bu karara uygun değil (sayfayı yenile)." }, { status: 409 });
    console.info(`[ogrenme] öneri ${karar}: ${id} (${y.hesap.kullaniciAdi})`);
    return NextResponse.json({ oneri: o });
  } catch (err) {
    console.error("[ogrenme] karar kaydedilemedi", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Karar kaydedilemedi." }, { status: 503 });
  }
}
