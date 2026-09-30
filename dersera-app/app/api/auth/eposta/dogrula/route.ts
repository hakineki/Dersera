import { NextResponse } from "next/server";
import { jsonGovde, kokenReddi } from "@/lib/authRequest";
import { epostaDeps, epostaHatasi, ipSiniri } from "@/lib/epostaIstek";
import { epostaDogrula } from "@/lib/epostaService";

// E-posta doğrulama: { t } (bağlantıdaki belirteç). Oturum gerekmez.
export async function POST(req: Request) {
  const koken = kokenReddi(req);
  if (koken) return koken;
  const sinir = await ipSiniri(req, "eposta-dogrula", 30);
  if (sinir) return sinir;
  const b = await jsonGovde(req);
  try {
    const r = await epostaDogrula(epostaDeps(), b.t);
    return r.ok ? NextResponse.json({ adres: r.value.adres }) : NextResponse.json({ error: r.error }, { status: r.status });
  } catch (err) {
    return epostaHatasi(err);
  }
}
