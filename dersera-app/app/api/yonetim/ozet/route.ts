import { NextResponse } from "next/server";
import { getAuthStore } from "@/lib/authStore";
import { getModerasyonStore } from "@/lib/moderasyonStore";
import { getOgrenmeStore } from "@/lib/ogrenmeStore";
import { getOkulStore } from "@/lib/okulStore";
import { getToplulukStore } from "@/lib/toplulukStore";
import { yonetimOzeti } from "@/lib/yonetimOzeti";
import { yoneticiHesabi } from "@/lib/yoneticiIstek";

// Yönetim genel bakışı (yalnız platform yöneticisi): özet sayılar ve yapılandırma sağlığı.
export async function GET(req: Request) {
  const y = await yoneticiHesabi(req);
  if (y.yanit) return y.yanit;
  try {
    const ozet = await yonetimOzeti(
      { auth: getAuthStore(), okul: getOkulStore(), topluluk: getToplulukStore(), moderasyon: getModerasyonStore(), ogrenme: getOgrenmeStore() },
      process.env
    );
    return NextResponse.json(ozet, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    console.error("[yonetim] özet okunamadı", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Özet okunamadı." }, { status: 503 });
  }
}
