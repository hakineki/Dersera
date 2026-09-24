import { NextResponse } from "next/server";
import { kokenReddi } from "@/lib/authRequest";
import { getGamesStore } from "@/lib/gamesStore";
import { MODERASYON } from "@/lib/moderasyon";
import { moderasyonKarari } from "@/lib/moderasyonService";
import { getModerasyonStore } from "@/lib/moderasyonStore";
import { getToplulukStore } from "@/lib/toplulukStore";
import { yoneticiHesabi } from "@/lib/yoneticiIstek";

const ID = /^[0-9a-f-]{36}$/;

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const y = await yoneticiHesabi(req);
    if (y.yanit) return y.yanit;
    const { id } = await ctx.params;
    const kayit = ID.test(id) ? await getModerasyonStore().get(id) : null;
    if (!kayit) return NextResponse.json({ error: "Kayıt bulunamadı." }, { status: 404 });
    return NextResponse.json({ kayit }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    console.error("[moderasyon] kayıt okunamadı", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Kayıt okunamadı." }, { status: 503 });
  }
}

// Karar: { karar: "temiz" | "kaldir", not? }. "kaldir" sınıf oyununu bitirir, topluluk oyununu reddeder.
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const koken = kokenReddi(req);
  if (koken) return koken;
  try {
    const y = await yoneticiHesabi(req);
    if (y.yanit) return y.yanit;
    const { id } = await ctx.params;
    if (!ID.test(id)) return NextResponse.json({ error: "Kayıt bulunamadı." }, { status: 404 });
    const body = (await req.json().catch(() => null)) as { karar?: unknown; not?: unknown } | null;
    const karar = body?.karar;
    const not = typeof body?.not === "string" ? body.not : "";
    if ((karar !== "temiz" && karar !== "kaldir") || not.length > MODERASYON.notEnCok) {
      return NextResponse.json({ error: "Geçersiz karar." }, { status: 422 });
    }
    const r = await moderasyonKarari(id, karar, not, y.hesap.kullaniciAdi, { games: getGamesStore(), topluluk: getToplulukStore() });
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
    return NextResponse.json({ kayit: r.kayit });
  } catch (err) {
    console.error("[moderasyon] karar kaydedilemedi", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Karar kaydedilemedi." }, { status: 503 });
  }
}
