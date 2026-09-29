import { NextResponse } from "next/server";
import { denemeOnKontrol, hataliDenemeKaydet, istekHesabi, jsonGovde, kokenReddi, oturumGerekli } from "@/lib/authRequest";
import { epostaDeps, epostaHatasi } from "@/lib/epostaIstek";
import { epostaKaldir } from "@/lib/epostaService";

// E-postayı kaldır: { sifre }.
export async function POST(req: Request) {
  const koken = kokenReddi(req);
  if (koken) return koken;
  const hesap = await istekHesabi(req);
  if (!hesap) return oturumGerekli();
  const sinir = await denemeOnKontrol(req, "giris", hesap.kullaniciAdi);
  if (sinir) return sinir;
  const b = await jsonGovde(req);
  try {
    const r = await epostaKaldir(epostaDeps(), hesap, b.sifre);
    if (!r.ok) {
      if (r.status === 403) await hataliDenemeKaydet(req, hesap.kullaniciAdi);
      return NextResponse.json({ error: r.error }, { status: r.status });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    return epostaHatasi(err);
  }
}
