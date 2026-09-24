import { NextResponse } from "next/server";
import { getToplulukStore } from "@/lib/toplulukStore";
import { listele, listeSorgusu } from "@/lib/toplulukService";

// Herkese açık liste: yalnız özet alanları (cevap ve oluşturan yok).
export async function GET(req: Request) {
  const s = listeSorgusu(new URL(req.url).searchParams);
  if (!s.ok) return NextResponse.json({ error: s.error }, { status: 422 });
  try {
    return NextResponse.json(await listele(getToplulukStore(), s.filtre, s.imlec, s.limit), { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    console.error("[topluluk] listelenemedi", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Kütüphane okunamadı" }, { status: 503 });
  }
}
