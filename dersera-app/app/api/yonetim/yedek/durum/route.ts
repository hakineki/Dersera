import { NextResponse } from "next/server";
import { redisFromEnv } from "@/lib/redis";
import { yedekDurumu } from "@/lib/yedekDepo";
import { yoneticiHesabi } from "@/lib/yoneticiIstek";

// Son gece yedeğinin sonucu (yalnız platform yöneticisi): yönetici sayfası başarısız ya da gecikmiş yedeği gösterir.
export async function GET(req: Request) {
  const y = await yoneticiHesabi(req);
  if (y.yanit) return y.yanit;
  const command = redisFromEnv();
  if (!command) return NextResponse.json({ durum: null, yapilandirilmamis: true }, { headers: { "Cache-Control": "no-store" } });
  try {
    return NextResponse.json({ durum: await yedekDurumu(command) }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    console.error("[yedek] durum okunamadı", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Yedek durumu okunamadı." }, { status: 503 });
  }
}
