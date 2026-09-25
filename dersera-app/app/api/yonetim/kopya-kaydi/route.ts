import { NextResponse } from "next/server";
import { getDenetimKaydiStore } from "@/lib/denetimKaydi";
import { yoneticiHesabi } from "@/lib/yoneticiIstek";

// Kopya kaydı (yalnız platform yöneticisi): hangi öğretmen hangi topluluk/okul oyununun tam içeriğini ne zaman açtı.
// ?ogretmen=<ad> ile süzülür. En yeni önce, en çok 500.
export async function GET(req: Request) {
  const y = await yoneticiHesabi(req);
  if (y.yanit) return y.yanit;
  const ogretmen = new URL(req.url).searchParams.get("ogretmen")?.trim().toLocaleLowerCase("tr-TR") ?? "";
  try {
    const kayitlar = await getDenetimKaydiStore().kopyalar(ogretmen ? 5000 : 500);
    const suzulmus = ogretmen ? kayitlar.filter((k) => k.kullaniciAdi.toLocaleLowerCase("tr-TR").includes(ogretmen)).slice(0, 500) : kayitlar;
    return NextResponse.json({ kayitlar: suzulmus }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    console.error("[denetim] kopya kaydı okunamadı", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Kayıt okunamadı." }, { status: 503 });
  }
}
