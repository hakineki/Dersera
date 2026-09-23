import { NextResponse } from "next/server";
import { hesapOzeti, kayitOl, oturumAc, oturumKapat } from "@/lib/auth";
import { getAuthStore } from "@/lib/authStore";
import { denemeOnKontrol, jsonGovde, kokenReddi, oturumBelirteci, oturumCereziYaz } from "@/lib/authRequest";

export async function POST(req: Request) {
  const red = kokenReddi(req) ?? (await denemeOnKontrol(req, "kayit"));
  if (red) return red;
  const b = await jsonGovde(req);
  try {
    const store = getAuthStore();
    const r = await kayitOl(store, b.kullaniciAdi, b.sifre, b.davetKodu);
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
    // Bu tarayıcıda açık önceki oturum kapatılır.
    await oturumKapat(store, oturumBelirteci(req));
    return oturumCereziYaz(NextResponse.json({ hesap: hesapOzeti(r.value) }, { status: 201 }), await oturumAc(store, r.value));
  } catch (err) {
    console.error("[auth] kayıt hatası", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Hesap şu anda oluşturulamadı." }, { status: 503 });
  }
}
