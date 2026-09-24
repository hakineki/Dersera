import { NextResponse } from "next/server";
import { istekHesabi, oturumGerekli } from "@/lib/authRequest";
import { ozetOf } from "@/lib/moderasyon";
import { getModerasyonStore } from "@/lib/moderasyonStore";
import { yoneticiMi } from "@/lib/yonetici";

// Yalnız yönetici: oturum yoksa 401, yönetici değilse 403.
async function yoneticiHesabi(req: Request) {
  const hesap = await istekHesabi(req);
  if (!hesap) return { yanit: oturumGerekli() };
  if (!(await yoneticiMi(hesap))) return { yanit: NextResponse.json({ error: "Bu sayfa yalnız yöneticilere açık." }, { status: 403 }) };
  return { hesap };
}

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
