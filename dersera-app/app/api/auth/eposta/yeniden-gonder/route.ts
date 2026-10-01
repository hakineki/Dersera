import { NextResponse } from "next/server";
import { istekHesabi, kokenReddi, oturumGerekli } from "@/lib/authRequest";
import { siteAdresi } from "@/lib/eposta";
import { epostaDeps, epostaHatasi } from "@/lib/epostaIstek";
import { dogrulamaYenidenGonder } from "@/lib/epostaService";

// Doğrulanmamış e-postaya doğrulama bağlantısını yeniden gönderir (paneldeki uyarıdan). Adres değişmediği için şifre
// istenmez; hesap başına saatlik e-posta sınırı geçerlidir.
export async function POST(req: Request) {
  const koken = kokenReddi(req);
  if (koken) return koken;
  const hesap = await istekHesabi(req);
  if (!hesap) return oturumGerekli();
  try {
    const r = await dogrulamaYenidenGonder(epostaDeps(), hesap, siteAdresi(req));
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
    return NextResponse.json({ adres: r.value.adres });
  } catch (err) {
    return epostaHatasi(err);
  }
}
