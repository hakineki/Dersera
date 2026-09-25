import { NextResponse } from "next/server";
import { kokenReddi } from "@/lib/authRequest";
import { checkLimit } from "@/lib/composer/rateLimit";
import { ayOf } from "@/lib/kredi";
import { OneriVeriYetersiz, oneriUret } from "@/lib/ogrenmeService";
import { yoneticiHesabi } from "@/lib/yoneticiIstek";

// Yapay zekâdan öneri iste (yalnız platform yöneticisi). Maliyet için günde en çok ONERI_GUNLUK istek.
export const maxDuration = 90;
export const ONERI_GUNLUK = 10;

export async function POST(req: Request) {
  const koken = kokenReddi(req);
  if (koken) return koken;
  const y = await yoneticiHesabi(req);
  if (y.yanit) return y.yanit;
  const body = (await req.json().catch(() => null)) as { ay?: unknown } | null;
  const ay = typeof body?.ay === "string" && /^\d{4}-\d{2}$/.test(body.ay) ? body.ay : ayOf(Date.now());
  try {
    if (!(await checkLimit(`dersera:ogrenme:oneri:${y.hesap.id}`, 24 * 60 * 60 * 1000, ONERI_GUNLUK))) {
      return NextResponse.json({ error: `Günde en çok ${ONERI_GUNLUK} öneri isteyebilirsin.` }, { status: 429 });
    }
    return NextResponse.json({ oneriler: await oneriUret(ay) }, { status: 201 });
  } catch (err) {
    if (err instanceof OneriVeriYetersiz) return NextResponse.json({ error: err.message }, { status: 422 });
    console.error("[ogrenme] öneri üretilemedi", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Öneri şu anda üretilemedi. Tekrar deneyin." }, { status: 503 });
  }
}
