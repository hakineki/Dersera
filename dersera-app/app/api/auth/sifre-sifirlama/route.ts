import { NextResponse } from "next/server";
import { jsonGovde, kokenReddi } from "@/lib/authRequest";
import { epostaDeps, epostaHatasi, ipSiniri } from "@/lib/epostaIstek";
import { sifreSifirla } from "@/lib/epostaService";

// Yeni şifre: { t, yeniSifre }. Başarıda bütün oturumlar kapanır; öğretmen yeni şifreyle giriş yapar.
export async function POST(req: Request) {
  const koken = kokenReddi(req);
  if (koken) return koken;
  const sinir = await ipSiniri(req, "sifre-sifirla", 20);
  if (sinir) return sinir;
  const b = await jsonGovde(req);
  try {
    const r = await sifreSifirla(epostaDeps(), b.t, b.yeniSifre);
    return r.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: r.error }, { status: r.status });
  } catch (err) {
    return epostaHatasi(err);
  }
}
