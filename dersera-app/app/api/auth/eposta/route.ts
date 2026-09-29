import { NextResponse } from "next/server";
import { denemeOnKontrol, hataliDenemeKaydet, istekHesabi, jsonGovde, kokenReddi, oturumGerekli } from "@/lib/authRequest";
import { siteAdresi } from "@/lib/eposta";
import { epostaDeps, epostaHatasi } from "@/lib/epostaIstek";
import { epostaDurumu, epostaEkle } from "@/lib/epostaService";

// Öğretmenin e-postası: GET durum; POST { adres, sifre } ekle ya da değiştir (doğrulama e-postası gönderilir).
export async function GET(req: Request) {
  const hesap = await istekHesabi(req);
  if (!hesap) return oturumGerekli();
  try {
    return NextResponse.json({ eposta: await epostaDurumu(epostaDeps(), hesap) }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return epostaHatasi(err);
  }
}

export async function POST(req: Request) {
  const koken = kokenReddi(req);
  if (koken) return koken;
  const hesap = await istekHesabi(req);
  if (!hesap) return oturumGerekli();
  const sinir = await denemeOnKontrol(req, "giris", hesap.kullaniciAdi);
  if (sinir) return sinir;
  const b = await jsonGovde(req);
  try {
    const r = await epostaEkle(epostaDeps(), hesap, b.adres, b.sifre, siteAdresi(req));
    if (!r.ok) {
      if (r.status === 403) await hataliDenemeKaydet(req, hesap.kullaniciAdi);
      return NextResponse.json({ error: r.error }, { status: r.status });
    }
    return NextResponse.json({ eposta: r.value });
  } catch (err) {
    return epostaHatasi(err);
  }
}
