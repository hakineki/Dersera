import { NextResponse } from "next/server";
import { getToplulukStore } from "@/lib/toplulukStore";
import { listele, listeSorgusu } from "@/lib/toplulukService";
import { checkLimit, clientIp } from "@/lib/composer/rateLimit";

// Herkese açık liste: yalnız özet alanları (cevap ve oluşturan yok).
export async function GET(req: Request) {
  const izin = await checkLimit(`dersera:topluluk:liste:${clientIp(req)}`, 60_000, 60).catch(() => true);
  if (!izin) return NextResponse.json({ error: "Çok fazla istek. Biraz sonra tekrar deneyin." }, { status: 429 });
  const s = listeSorgusu(new URL(req.url).searchParams);
  if (!s.ok) return NextResponse.json({ error: s.error }, { status: 422 });
  try {
    return NextResponse.json(await listele(getToplulukStore(), s.filtre, s.imlec, s.limit), { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    console.error("[topluluk] listelenemedi", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Kütüphane okunamadı" }, { status: 503 });
  }
}
