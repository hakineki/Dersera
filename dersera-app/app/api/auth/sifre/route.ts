import { NextResponse } from "next/server";
import { hesapOzeti, oturumAc, sifreDegistir } from "@/lib/auth";
import { getAuthStore } from "@/lib/authStore";
import { denemeOnKontrol, hataliDenemeKaydet, istekHesabi, jsonGovde, kokenReddi, oturumCereziYaz, oturumGerekli } from "@/lib/authRequest";

// Şifre değişince diğer cihazlardaki oturumlar kapanır; bu cihaza yeni oturum açılır.
export async function POST(req: Request) {
  const koken = kokenReddi(req);
  if (koken) return koken;
  const hesap = await istekHesabi(req);
  if (!hesap) return oturumGerekli();
  const sinir = await denemeOnKontrol(req, "giris", hesap.kullaniciAdi);
  if (sinir) return sinir;
  const b = await jsonGovde(req);
  try {
    const store = getAuthStore();
    const r = await sifreDegistir(store, hesap, b.mevcutSifre, b.yeniSifre);
    if (!r.ok) {
      if (r.status === 403) await hataliDenemeKaydet(req, hesap.kullaniciAdi);
      return NextResponse.json({ error: r.error }, { status: r.status });
    }
    return oturumCereziYaz(NextResponse.json({ hesap: hesapOzeti(r.value) }), await oturumAc(store, r.value));
  } catch (err) {
    console.error("[auth] şifre değiştirme hatası", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Şifre şu anda değiştirilemedi." }, { status: 503 });
  }
}
