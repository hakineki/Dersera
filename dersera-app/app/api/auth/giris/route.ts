import { NextResponse } from "next/server";
import { girisYap, hesapOzeti, kullaniciAdiNormal, oturumAc, oturumKapat } from "@/lib/auth";
import { getAuthStore } from "@/lib/authStore";
import { denemeOnKontrol, hataliDenemeKaydet, jsonGovde, kokenReddi, oturumBelirteci, oturumCereziYaz } from "@/lib/authRequest";

export async function POST(req: Request) {
  const koken = kokenReddi(req);
  if (koken) return koken;
  const b = await jsonGovde(req);
  const ad = kullaniciAdiNormal(b.kullaniciAdi);
  const sinir = await denemeOnKontrol(req, "giris", ad ?? undefined);
  if (sinir) return sinir;
  try {
    const store = getAuthStore();
    const r = await girisYap(store, b.kullaniciAdi, b.sifre);
    if (!r.ok) {
      if (ad) await hataliDenemeKaydet(req, ad);
      return NextResponse.json({ error: r.error }, { status: r.status });
    }
    // Aynı tarayıcıda önceki (başka hesabın) oturumu sunucuda da kapatılır.
    await oturumKapat(store, oturumBelirteci(req));
    return oturumCereziYaz(NextResponse.json({ hesap: hesapOzeti(r.value) }), await oturumAc(store, r.value));
  } catch (err) {
    console.error("[auth] giriş hatası", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Giriş şu anda yapılamıyor." }, { status: 503 });
  }
}
