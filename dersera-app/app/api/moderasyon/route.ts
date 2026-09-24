import { NextResponse } from "next/server";
import { ozetOf } from "@/lib/moderasyon";
import { getModerasyonStore } from "@/lib/moderasyonStore";
import { yoneticiHesabi } from "@/lib/yoneticiIstek";

// Moderasyon kuyruğu: ?durum=bekliyor (varsayılan) | kapatildi; en yeni önce, en çok 100.
export async function GET(req: Request) {
  try {
    const y = await yoneticiHesabi(req);
    if (y.yanit) return y.yanit;
    const durum = new URL(req.url).searchParams.get("durum") === "kapatildi" ? "kapatildi" : "bekliyor";
    const kayitlar = await getModerasyonStore().liste(durum, 100);
    return NextResponse.json({ kayitlar: kayitlar.map(ozetOf) }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    console.error("[moderasyon] liste okunamadı", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Kuyruk okunamadı." }, { status: 503 });
  }
}
