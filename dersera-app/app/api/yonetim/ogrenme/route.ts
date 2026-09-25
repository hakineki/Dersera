import { NextResponse } from "next/server";
import { ayOf } from "@/lib/kredi";
import { ogrenmeDurumu } from "@/lib/ogrenmeService";
import { yoneticiHesabi } from "@/lib/yoneticiIstek";

// Öğrenme döngüsü raporu (yalnız platform yöneticisi): ?ay=YYYY-MM (varsayılan bu ay). Toplu, kimliksiz sayılar,
// son yapay zekâ güncelleme talimatları ve öneriler.
export async function GET(req: Request) {
  const y = await yoneticiHesabi(req);
  if (y.yanit) return y.yanit;
  const istenen = new URL(req.url).searchParams.get("ay");
  const ay = istenen && /^\d{4}-\d{2}$/.test(istenen) ? istenen : ayOf(Date.now());
  try {
    return NextResponse.json(await ogrenmeDurumu(ay), { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    console.error("[ogrenme] rapor okunamadı", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Rapor okunamadı." }, { status: 503 });
  }
}
