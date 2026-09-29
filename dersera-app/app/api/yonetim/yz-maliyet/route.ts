import { NextResponse } from "next/server";
import { ayOf } from "@/lib/kredi";
import { getOkulStore } from "@/lib/okulStore";
import { AY_BICIMI, yzMaliyetRaporu } from "@/lib/yzMaliyetRaporu";
import { getYzMaliyetStore } from "@/lib/yzMaliyetStore";
import { yoneticiHesabi } from "@/lib/yoneticiIstek";

// Yapay zekâ maliyet raporu (yalnız platform yöneticisi): ?ay=YYYY-MM (varsayılan bu ay).
export async function GET(req: Request) {
  const y = await yoneticiHesabi(req);
  if (y.yanit) return y.yanit;
  const ay = new URL(req.url).searchParams.get("ay") ?? ayOf(Date.now());
  if (!AY_BICIMI.test(ay)) return NextResponse.json({ error: "Geçersiz ay." }, { status: 422 });
  try {
    const rapor = await yzMaliyetRaporu({ maliyet: getYzMaliyetStore(), okul: getOkulStore() }, ay);
    return NextResponse.json(rapor, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    console.error("[yz-maliyet] rapor okunamadı", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Rapor okunamadı." }, { status: 503 });
  }
}
