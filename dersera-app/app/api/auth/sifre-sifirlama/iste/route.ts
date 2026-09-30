import { NextResponse } from "next/server";
import { jsonGovde, kokenReddi } from "@/lib/authRequest";
import { siteAdresi } from "@/lib/eposta";
import { epostaDeps, epostaHatasi, ipSiniri } from "@/lib/epostaIstek";
import { SIFIRLAMA_ISTENDI, sifirlamaIste } from "@/lib/epostaService";

// "Şifremi unuttum": { girdi } (kullanıcı adı ya da e-posta). Yanıt her durumda aynıdır.
export async function POST(req: Request) {
  const koken = kokenReddi(req);
  if (koken) return koken;
  const sinir = await ipSiniri(req, "sifirlama-iste", 10);
  if (sinir) return sinir;
  const b = await jsonGovde(req);
  try {
    await sifirlamaIste(epostaDeps(), b.girdi, siteAdresi(req));
    return NextResponse.json({ mesaj: SIFIRLAMA_ISTENDI });
  } catch (err) {
    return epostaHatasi(err);
  }
}
