import { NextResponse } from "next/server";
import { girisYap, hesapOzeti, kullaniciAdiNormal, oturumAc } from "@/lib/auth";
import { getAuthStore } from "@/lib/authStore";
import { denemeSiniri, jsonGovde, oturumCereziYaz } from "@/lib/authRequest";

export async function POST(req: Request) {
  const b = await jsonGovde(req);
  const sinir = await denemeSiniri(req, "giris", kullaniciAdiNormal(b.kullaniciAdi) ?? undefined);
  if (sinir) return sinir;
  try {
    const store = getAuthStore();
    const r = await girisYap(store, b.kullaniciAdi, b.sifre);
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
    return oturumCereziYaz(NextResponse.json({ hesap: hesapOzeti(r.value) }), await oturumAc(store, r.value));
  } catch (err) {
    console.error("[auth] giriş hatası", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Giriş şu anda yapılamıyor." }, { status: 503 });
  }
}
