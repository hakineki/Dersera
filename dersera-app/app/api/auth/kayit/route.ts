import { NextResponse } from "next/server";
import { hesapOzeti, kayitOl, oturumAc } from "@/lib/auth";
import { getAuthStore } from "@/lib/authStore";
import { denemeSiniri, jsonGovde, oturumCereziYaz } from "@/lib/authRequest";

export async function POST(req: Request) {
  const sinir = await denemeSiniri(req, "kayit");
  if (sinir) return sinir;
  const b = await jsonGovde(req);
  try {
    const store = getAuthStore();
    const r = await kayitOl(store, b.kullaniciAdi, b.sifre, b.davetKodu);
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
    return oturumCereziYaz(NextResponse.json({ hesap: hesapOzeti(r.value) }, { status: 201 }), await oturumAc(store, r.value));
  } catch (err) {
    console.error("[auth] kayıt hatası", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Hesap şu anda oluşturulamadı." }, { status: 503 });
  }
}
